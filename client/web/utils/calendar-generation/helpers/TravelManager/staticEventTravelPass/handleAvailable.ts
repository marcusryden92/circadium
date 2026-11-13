import { Category } from "@/types/prisma";
import { AvailableSlot, Slot } from "../../../models/TimeSlot";
import { TravelManager } from "../../../core/TravelManager";
import { TravelPassRecorder } from "../TravelPassRecorder";
import { M } from "../travelPassMessages";
import { absorbAndReplan } from "./absorb";
import {
  bleedAcrossPrevCurrentNext,
  bleedIntoNext,
  bleedIntoPrev,
} from "./bleed";
import { findPrevTravelForAvailable } from "./lookups";
import { fillCurrentWithAlert, placeTravelInCurrent } from "./placement";
import { logInconsistency } from "./staticEventTravelPass";

// Classification of the two neighbors used by handleAvailable's dispatch.
// "soft" = Available or Category (both can be bled into / across).
// "hard" = Occupied (no bleeding). A missing neighbor (array edge) is hard
// too — there is nothing to bleed into, but the transition itself is real
// and must still be placed (or fail loud as insufficient), never dropped.
type NeighborKind = "soft" | "hard" | "travel";

function classifyNeighbor(slot: Slot | null): NeighborKind {
  if (!slot) return "hard";
  if (slot.type === "available" || slot.type === "category") return "soft";
  if (slot.type === "occupied") return "hard";
  return "travel";
}

export function handleAvailable(
  slots: Slot[],
  i: number,
  travelManager: TravelManager,
  categories: Category[],
  recorder?: TravelPassRecorder,
): number {
  const slot = slots[i] as AvailableSlot;

  // Outer guard: prev != next (null on either side = no transition).
  // resolveTravel tracks the leg here; absorb branches untrack and retrack.
  const action = travelManager.resolveTravel(slot);
  if (!action) {
    recorder?.decision(M.handleAvailable.outerGuardSkip, 0);
    return i + 1;
  }
  recorder?.decision(
    M.handleAvailable.outerGuardTransition(action.travelMinutes),
    0,
  );

  // Current size: large enough for travel
  if (slot.durationMinutes >= action.travelMinutes) {
    recorder?.decision(
      M.handleAvailable.currentLargeEnough(
        slot.durationMinutes,
        action.travelMinutes,
      ),
      1,
    );
    const result = placeTravelInCurrent(slots, i, action);
    recorder?.action(
      M.handleAvailable.placeTravelInCurrentAction(!!action.placeAtSlotStart),
    );
    return result;
  }
  recorder?.decision(
    M.handleAvailable.currentTooSmall(
      slot.durationMinutes,
      action.travelMinutes,
    ),
    1,
  );

  // Current size: not large enough for travel — dispatch on (prev, next).
  const prev = i > 0 ? slots[i - 1] : null;
  const next = i + 1 < slots.length ? slots[i + 1] : null;
  const nextKind = classifyNeighbor(next);

  // Forward walker invariant: a Travel slot at i+1 means the next transition
  // was already placed, so the current transition is stale. Same handling
  // regardless of prev type.
  if (nextKind === "travel") {
    travelManager.untrackLeg(action.prevLocation, action.nextLocation);
    logInconsistency(
      `Available with Next=Travel (prev=${prev?.type ?? "none"}) — should not occur on forward walk`,
    );
    recorder?.decision(M.handleAvailable.nextIsTravelDecision, 2);
    recorder?.action(M.handleAvailable.skipInconsistent);
    return i + 1;
  }

  // Prev=Travel (slots[i-1] directly OR slots[i-2] across a transparent prev
  // Available leftover) — absorb the prev travel and replan A→C. This takes
  // precedence over the soft/hard prev dispatch below.
  const prevTravel = findPrevTravelForAvailable(slots, i);
  if (prevTravel && next) {
    recorder?.decision(
      M.handleAvailable.prevIsTravel(
        prevTravel.travelIndex,
        recorder.label(prevTravel.travel),
      ),
      2,
    );
    recorder?.decision(M.handleAvailable.nextAbsorbReplan(next.type), 3);
    return absorbAndReplan(
      slots,
      i,
      action,
      prevTravel,
      travelManager,
      recorder,
    );
  }

  // Dispatch on the (prevKind, nextKind) shape. Category and Available are
  // both "soft" predecessors that can bleed time backwards; Occupied is
  // "hard". The asymmetry on the next side (bleedIntoPrev vs
  // bleedAcrossPrevCurrentNext) only depends on next's type.
  const prevKind = classifyNeighbor(prev);
  if (prevKind === "soft" && nextKind === "soft") {
    recorder?.decision(M.handleAvailable.prevSoft(prev!.type), 2);
    recorder?.decision(M.handleAvailable.nextBleedAcross(next!.type), 3);
    const result = bleedAcrossPrevCurrentNext(slots, i, action);
    recorder?.action(M.handleAvailable.bleedAcrossAction);
    return result;
  }
  if (prevKind === "soft" && nextKind === "hard") {
    recorder?.decision(M.handleAvailable.prevSoft(prev!.type), 2);
    recorder?.decision(M.handleAvailable.nextOccupiedBleedIntoPrev, 3);
    return bleedIntoPrev(slots, i, action, travelManager, categories, recorder);
  }
  if (prevKind === "hard" && nextKind === "soft") {
    recorder?.decision(M.handleAvailable.prevOccupied, 2);
    recorder?.decision(M.handleAvailable.nextBleedIntoNext(next!.type), 3);
    return bleedIntoNext(slots, i, action, travelManager, recorder);
  }
  if (prevKind === "hard" && nextKind === "hard") {
    recorder?.decision(M.handleAvailable.prevOccupied, 2);
    recorder?.decision(M.handleAvailable.nextOccupiedFillCurrent, 3);
    const result = fillCurrentWithAlert(slots, i, action);
    recorder?.action(M.handleAvailable.fillCurrentWithAlertAction);
    return result;
  }

  travelManager.untrackLeg(action.prevLocation, action.nextLocation);
  logInconsistency("handleAvailable: unhandled prev/next combination");
  recorder?.decision(M.handleAvailable.unhandledCombination, 2);
  recorder?.action(M.handleAvailable.skipUnhandled);
  return i + 1;
}
