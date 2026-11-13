import { Category } from "@/types/prisma";
import { CategorySlot, Slot } from "../../../models/TimeSlot";
import { TravelManager } from "../../../core/TravelManager";
import { TravelPassRecorder } from "../TravelPassRecorder";
import { M } from "../travelPassMessages";
import { findRecentTravelBehind } from "../travelPassUtils";
import {
  absorbAndReplanBackward,
  absorbAndReplanIntoNextCategory,
  absorbAndReplanThroughCategory,
} from "./absorb";
import { bleedAcrossCategoryBoundary } from "./bleed";
import { bypassCategoryCascade } from "./cascade";
import { findPrevTravelForAvailable } from "./lookups";
import {
  placeTravelAtCategoryHead,
  placeTravelAtCategoryTail,
  trespassCategoryExit,
} from "./placement";
import { logInconsistency } from "./staticEventTravelPass";

// ---------------------------------------------------------------------------
// Current type: Category — Entry edge then Exit edge
// ---------------------------------------------------------------------------

export function handleCategory(
  slots: Slot[],
  i: number,
  travelManager: TravelManager,
  categories: Category[],
  recorder?: TravelPassRecorder,
): number {
  const entrySlot = slots[i] as CategorySlot;
  const entryCategoryId = entrySlot.categoryId;
  const entryEndMs = entrySlot.end.getTime();

  recorder?.decision(M.handleCategory.entryEdge, 0);
  const afterEntry = handleCategoryEntryEdge(slots, i, travelManager, recorder);

  // Only run the exit edge when afterEntry still refers to THIS category
  // visit (the original slot or its shortened remainder). An entry travel
  // that consumed the whole slot — or a cascade that landed elsewhere —
  // leaves afterEntry pointing at a different slot; running its exit edge
  // here would skip that slot's own entry edge. Return to the walker so it
  // gets a full fresh pass instead.
  const afterSlot = afterEntry < slots.length ? slots[afterEntry] : null;
  const sameVisit =
    afterSlot?.type === "category" &&
    afterSlot.categoryId === entryCategoryId &&
    afterSlot.end.getTime() === entryEndMs;
  if (!sameVisit) {
    return afterEntry;
  }

  recorder?.decision(M.handleCategory.exitEdge, 0);
  return handleCategoryExitEdge(
    slots,
    afterEntry,
    travelManager,
    categories,
    recorder,
  );
}

function handleCategoryEntryEdge(
  slots: Slot[],
  i: number,
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
): number {
  const slot = slots[i] as CategorySlot;

  // Incremental resume: this slot was processed on an earlier pass and is
  // being re-entered only so its deferred exit edge can run against the
  // newly-built region. Entry travel (if any) was already placed last time —
  // skip entry to avoid re-placing it. The end-of-pass markLastCategoryAsFinal
  // will clear this flag and move it to the new array-end category.
  if (slot.isFinal) {
    return i;
  }

  // Outer guard: prev != current (null on either side = no transition).
  // Manual check so we don't track a leg we won't end up placing.
  if (
    !slot.prevLocationId ||
    !slot.currentLocationId ||
    slot.prevLocationId === slot.currentLocationId
  ) {
    recorder?.decision(M.handleCategoryEntryEdge.outerGuardSkip, 1);
    return i;
  }

  // ---- no prev (i === 0) ----
  if (i === 0) {
    recorder?.decision(M.handleCategoryEntryEdge.noPrev, 1);
    return i;
  }

  const prev = slots[i - 1];

  // Category-to-category transitions are owned by the earlier cat's exit edge.
  if (prev.type === "category") {
    recorder?.decision(M.handleCategoryEntryEdge.prevCategory, 1);
    return i;
  }

  // Look behind for a Travel that may already carry this transition. The
  // helper transparently walks past an Available leftover or a chain of
  // Anywhere Occupieds. A located Occupied is opaque (returns null).
  const recent = findRecentTravelBehind(slots, i - 1);

  if (prev.type === "travel") {
    // recent is guaranteed non-null and === slots[i-1].
    if (prev.travelToLocationId === slot.currentLocationId) {
      recorder?.decision(M.handleCategoryEntryEdge.prevTravelEndsAtCurrent, 1);
      return i;
    }
    if (prev.travelToLocationId !== slot.prevLocationId) {
      logInconsistency(
        `Category entry edge: prev Travel destination ${prev.travelToLocationId} doesn't match slot.prevLocationId ${slot.prevLocationId}`,
      );
      recorder?.decision(M.handleCategoryEntryEdge.prevTravelUnexpectedDest, 1);
      return i;
    }
    recorder?.decision(M.handleCategoryEntryEdge.prevTravelMatchesPrevLoc, 1);
  } else if (prev.type === "available") {
    // The leading Available was already processed; if it carried the
    // transition there must be a Travel ending at current behind it.
    if (recent && recent.travel.travelToLocationId === slot.currentLocationId) {
      recorder?.decision(
        M.handleCategoryEntryEdge.prevAvailableWithTravelAtPrevPrev(recent.idx),
        1,
      );
      return i;
    }
    logInconsistency(
      "Category entry edge: prev Available without matching Travel at slots[i-2]",
    );
    recorder?.decision(
      M.handleCategoryEntryEdge.prevAvailableNoMatchingTravel,
      1,
    );
    return i;
  } else if (prev.type === "occupied") {
    // Anywhere Occupied chains may hide an earlier Travel landing at current.
    if (
      prev.locationId == null &&
      recent &&
      recent.travel.travelToLocationId === slot.currentLocationId
    ) {
      recorder?.decision(
        M.handleCategoryEntryEdge.prevAnywhereOccupiedHandled(recent.idx),
        1,
      );
      return i;
    }
    recorder?.decision(M.handleCategoryEntryEdge.prevOccupiedFallThrough, 1);
  }

  // Place the entry travel.
  const action = travelManager.resolveCategoryEdge(slot, "entry");
  if (!action) {
    recorder?.decision(M.handleCategoryEntryEdge.noActionFromResolve, 1);
    return i;
  }

  if (slot.durationMinutes >= action.travelMinutes) {
    recorder?.decision(
      M.handleCategoryEntryEdge.fitsAtHead(
        slot.durationMinutes,
        action.travelMinutes,
      ),
      2,
    );
    const result = placeTravelAtCategoryHead(slots, i, action);
    recorder?.action(M.handleCategoryEntryEdge.placeAtHeadAction);
    return result;
  }
  recorder?.decision(
    M.handleCategoryEntryEdge.bypassCascade(
      slot.durationMinutes,
      action.travelMinutes,
    ),
    2,
  );
  return bypassCategoryCascade(slots, i, action, travelManager, recorder);
}

function handleCategoryExitEdge(
  slots: Slot[],
  i: number,
  travelManager: TravelManager,
  categories: Category[],
  recorder?: TravelPassRecorder,
): number {
  const slot = slots[i] as CategorySlot;

  // Outer guard
  if (
    !slot.currentLocationId ||
    !slot.nextLocationId ||
    slot.currentLocationId === slot.nextLocationId
  ) {
    recorder?.decision(M.handleCategoryExitEdge.outerGuardSkip, 1);
    return i + 1;
  }

  // ---- no next (last slot) ----
  if (i + 1 >= slots.length) {
    // Defer planning the exit edge — there's nothing reachable to plan toward.
    // The end-of-pass markLastCategoryAsFinal will flag this slot for future
    // expansion to pick up from.
    recorder?.decision(M.handleCategoryExitEdge.lastSlotFinal, 1);
    recorder?.action(M.handleCategoryExitEdge.markFinalAction);
    return i + 1;
  }

  const next = slots[i + 1];

  // ---- Next type: Available ----
  if (next.type === "available") {
    recorder?.decision(M.handleCategoryExitEdge.nextAvailableDeferred, 1);
    return i + 1;
  }

  // ---- Next type: Category ----
  if (next.type === "category") {
    recorder?.decision(M.handleCategoryExitEdge.nextCategoryBleedBoundary, 1);
    const action = travelManager.resolveCategoryEdge(slot, "exit");
    if (!action) {
      recorder?.decision(M.handleCategoryExitEdge.noActionFromResolve, 2);
      return i + 1;
    }

    // Whole-minute split: the current side takes the ceil so boundaries stay
    // minute-aligned (matches bleedAcrossCategoryBoundary's rounding).
    const half = Math.ceil(action.travelMinutes / 2);
    const halfNext = action.travelMinutes - half;
    const symFails =
      half >= slot.durationMinutes || halfNext >= next.durationMinutes;

    // Backward-cascade pre-check: when sym bleed would fail AND a located
    // Occupied sits flush against cat2 at a different location, the user's
    // real next fixed point is that Occupied. Try backward cascade first —
    // re-target the natural travel toward the Occupied's location and
    // absorb cat1+cat2 (and possibly more) into one slot. Falls back to
    // the existing forward/symmetric strategies if no anchor fits.
    if (symFails) {
      const afterNext = i + 2 < slots.length ? slots[i + 2] : null;
      if (
        afterNext &&
        afterNext.type === "occupied" &&
        afterNext.locationId &&
        afterNext.locationId !== next.currentLocationId &&
        afterNext.start.getTime() === next.end.getTime()
      ) {
        if (recorder) {
          recorder.decision(
            M.handleCategoryExitEdge.symFailsTryBackwardCascade(
              half,
              recorder.label(afterNext),
            ),
            2,
          );
        }
        const backwardResult = absorbAndReplanBackward(
          slots,
          i,
          i + 2,
          action,
          travelManager,
          categories,
          recorder,
        );
        if (backwardResult !== null) return backwardResult;
        recorder?.decision(M.handleCategoryExitEdge.backwardCascadeFailed, 2);
      }
    }

    // When symmetric bleed would entirely consume the current cat, the cat
    // is "skippable": prefer forward absorb when a prev Travel exists
    // (replaces it with one longer travel that lands at a later candidate),
    // otherwise forward-cascade through cat[i] using bypassCategoryCascade.
    // The absorb function walks forward through every cat candidate and
    // picks natural-fit (earliest) or latest pre-fit, so the dispatcher
    // doesn't need to pre-check the immediate next cat anymore.
    if (half >= slot.durationMinutes) {
      const prevTravel = findPrevTravelForAvailable(slots, i);
      if (prevTravel) {
        if (recorder) {
          recorder.decision(
            M.handleCategoryExitEdge.symmetricBleedFailsTryAbsorb(
              half,
              slot.durationMinutes,
              prevTravel.travelIndex,
              recorder.label(prevTravel.travel),
            ),
            2,
          );
        }
        return absorbAndReplanIntoNextCategory(
          slots,
          i,
          action,
          prevTravel,
          travelManager,
          categories,
          recorder,
        );
      }
      recorder?.decision(
        M.handleCategoryExitEdge.symmetricBleedFailsForwardCascade(
          half,
          slot.durationMinutes,
        ),
        2,
      );
      return bypassCategoryCascade(slots, i, action, travelManager, recorder);
    }

    return bleedAcrossCategoryBoundary(
      slots,
      i,
      action,
      travelManager,
      recorder,
    );
  }

  // ---- Next type: Occupied ----
  if (next.type === "occupied") {
    recorder?.decision(
      M.handleCategoryExitEdge.nextOccupied(recorder.label(next)),
      1,
    );
    const action = travelManager.resolveCategoryEdge(slot, "exit");
    if (!action) {
      recorder?.decision(M.handleCategoryExitEdge.noActionFromResolve, 2);
      return i + 1;
    }

    if (slot.durationMinutes >= action.travelMinutes) {
      recorder?.decision(
        M.handleCategoryExitEdge.fitsAtTail(
          slot.durationMinutes,
          action.travelMinutes,
        ),
        2,
      );
      const result = placeTravelAtCategoryTail(slots, i, action);
      recorder?.action(M.handleCategoryExitEdge.placeAtTailAction);
      return result;
    }

    // Same lookup as the Available handler — the walker reaches the Category
    // exit edge after processing the leading Available, so the prev Travel is
    // either directly behind or one slot back across a transparent leftover.
    const prevTravel = findPrevTravelForAvailable(slots, i);
    if (prevTravel) {
      recorder?.decision(
        M.handleCategoryExitEdge.prevTravelAbsorbReplan(
          prevTravel.travelIndex,
          recorder.label(prevTravel.travel),
        ),
        2,
      );
      return absorbAndReplanThroughCategory(
        slots,
        i,
        action,
        prevTravel,
        travelManager,
        categories,
        recorder,
      );
    }

    recorder?.decision(M.handleCategoryExitEdge.noPrevTravel, 2);
    return trespassCategoryExit(slots, i, action, travelManager, recorder);
  }

  // ---- Next type: Travel ----
  if (next.type === "travel") {
    travelManager.untrackLeg(slot.currentLocationId, slot.nextLocationId);
    logInconsistency(
      "Category exit edge: Next=Travel — should not occur on forward walk",
    );
    recorder?.decision(M.handleCategoryExitEdge.nextIsTravelDecision, 1);
    recorder?.action(M.handleCategoryExitEdge.skipInconsistent);
    return i + 1;
  }

  logInconsistency("Category exit edge: unhandled next type");
  recorder?.decision(M.handleCategoryExitEdge.unhandledNext, 1);
  return i + 1;
}
