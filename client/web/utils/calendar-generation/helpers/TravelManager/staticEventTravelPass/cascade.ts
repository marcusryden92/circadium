import { Category } from "@/types/prisma";
import { AvailableSlot, CategorySlot, Slot } from "../../../models/TimeSlot";
import { TravelManager } from "../../../core/TravelManager";
import { TravelProcessingAction } from "../../../models/SchedulingModels";
import {
  collectShardSources,
  createTravelShards,
  shardSourceFromAvailable,
  shardSourceFromCategory,
  type ShardSource,
} from "../../../utils/timeSlotUtils";
import { TravelPassRecorder } from "../TravelPassRecorder";
import { M } from "../travelPassMessages";
import {
  BackwardFitResult,
  detectBleedRecovery,
  walkBackwardForFit,
  walkForwardForFit,
} from "../travelPassUtils";
import { nextPinnedLocation } from "./lookups";
import { fillCurrentWithAlert, trespassCategoryExit } from "./placement";
import {
  buildLandingSurvivor,
  shortenPlaceableAtEnd,
  spliceBleedNext,
  spliceBleedPrev,
} from "./slotShape";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Action: Category entry, Prev=Occupied, doesn't fit — bypass cascade
// ---------------------------------------------------------------------------

export function bypassCategoryCascade(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
): number {
  // Cat[i] doesn't fit the travel from prev (Occupied) into it. Walk forward
  // looking for a Category to land in (first-fit naturalFit / preFit). Hard
  // stop on Occupied/Travel; end-of-slots without a landing falls back to a
  // pinned destination and ultimately trespassCategoryExit().
  travelManager.untrackLeg(action.prevLocation, action.nextLocation);
  recorder?.decision(M.bypassCategoryCascade.header, 3);

  const category = slots[i] as CategorySlot;
  const A = action.prevLocation;

  const fit = walkForwardForFit({
    slots,
    startIdx: i + 1,
    referenceStartTime: category.start,
    initialConsumedCategoryIds: [category.categoryId],
    availableCandidateMode: "always-next",
    travelManager,
    origin: A,
    referenceTime: () => category.end,
    hardStopReferenceTime: category.end,
    onVisit: recorder
      ? (event) => {
          recorder.decision(
            M.bypassCategoryCascade.evaluateCat(
              event.idx,
              recorder.label(event.slot),
              event.T,
            ),
            4,
          );
          if (event.fitKind === "overflow") {
            recorder.decision(
              M.bypassCategoryCascade.overshootSkip(
                event.idx,
                event.T,
                event.slot.durationMinutes,
              ),
              5,
            );
          }
        }
      : undefined,
  });

  const consumedCategoryIds = [...fit.consumedCategoryIds];
  let destination: string | null = null;
  let T = 0;
  let boundary: Date;
  let removeCount: number;

  switch (fit.kind) {
    case "naturalFit": {
      destination = fit.destination;
      T = fit.T;
      boundary = fit.travelEnd;
      if (
        fit.slot.type === "category" &&
        boundary.getTime() > fit.slot.start.getTime()
      ) {
        consumedCategoryIds.push(fit.slot.categoryId);
      } else if (
        fit.slot.type === "travel" &&
        fit.slot.consumedCategoryIds &&
        boundary.getTime() > fit.slot.start.getTime()
      ) {
        consumedCategoryIds.push(...fit.slot.consumedCategoryIds);
      }
      removeCount = fit.idx - i + 1;
      recorder?.decision(
        M.bypassCategoryCascade.partialSplit(fit.idx, fit.remaining),
        5,
      );
      break;
    }
    case "preFit": {
      destination = fit.destination;
      T = fit.T;
      boundary = fit.slot.start;
      removeCount = fit.idx - i;
      recorder?.decision(
        M.bypassCategoryCascade.endAtSlotStart(T, fit.consumed, fit.idx),
        5,
      );
      break;
    }
    case "hardStop": {
      if (recorder) {
        recorder.decision(
          M.bypassCategoryCascade.anchorHardStop(
            fit.idx,
            recorder.label(fit.hardStopSlot),
          ),
          4,
        );
      }
      if (fit.pinnedDestination) {
        destination = fit.pinnedDestination;
        T = fit.pinnedT;
        recorder?.decision(M.bypassCategoryCascade.retargetOccupied(T), 5);
      }
      boundary = fit.hardStopSlot.start;
      removeCount = fit.idx - i;
      break;
    }
    case "exhausted": {
      const lastIdx = slots.length - 1;
      boundary = lastIdx > i ? slots[lastIdx].end : category.end;
      removeCount = slots.length - i;
      break;
    }
  }

  // No destination set — we never landed at a Category, hard-stopped on a
  // Travel slot, or hard-stopped on a location-less Occupied. Fall back to a
  // pinned destination so we still place something with a coherent target.
  // The fallbacks re-track the leg untracked at the top before delegating —
  // trespassCategoryExit untracks it again, and an unbalanced double-untrack
  // would strip an unrelated same-pair leg from the ledger.
  if (destination === null) {
    const fallback = nextPinnedLocation(slots, i + 1);
    if (!fallback) {
      recorder?.decision(M.bypassCategoryCascade.noPinnedDestination, 4);
      travelManager.trackLeg(action.prevLocation, action.nextLocation);
      return trespassCategoryExit(slots, i, action, travelManager, recorder);
    }
    destination = fallback;
    T = travelManager.getTravelTime(A, destination, category.end);
    if (T <= 0) {
      recorder?.decision(M.bypassCategoryCascade.noTravelTime, 4);
      travelManager.trackLeg(action.prevLocation, action.nextLocation);
      return trespassCategoryExit(slots, i, action, travelManager, recorder);
    }
  }

  // Track the final destination once.
  travelManager.trackLeg(A, destination);

  // Forward cascade geometric rule: travel fills the entire absorbed region
  // as one atomic transit. The user already left A at category.start
  // (typically end-of-Occupied) — there's no "at A" time inside the absorb
  // to preserve, so unlike the backward cascade there's no bleed-Available
  // recovery here. (See applyBackwardCascadeFit for the contrast.)
  //
  //   travel.start = category.start                 (= absorb-region start)
  //   travel.end   = boundary                       (= region end)
  //
  //   overconstrained when slot.dur > T  (region wider than the trip)
  //   insufficient    when slot.dur < T  (hardStop / exhausted only —
  //                                        preFit/naturalFit guarantee
  //                                        slot.dur >= T)
  //
  // For naturalFit the walker landed inside the boundary slot's interior,
  // so boundary = fit.travelEnd and slot.dur == T exactly (no
  // overconstrained). The slot's surviving tail [boundary, fit.slot.end]
  // is restored as the landing-slot survivor.
  const travelStart = category.start;
  const travelEnd = boundary;
  const slotDurMs = travelEnd.getTime() - travelStart.getTime();
  const naturalDurMs = T * 60000;
  const insufficient = slotDurMs < naturalDurMs;
  const overconstrained = slotDurMs > naturalDurMs;

  const absorbed = slots.slice(i, i + removeCount);
  const shardSources = collectShardSources(absorbed, travelStart, travelEnd);
  const shards = createTravelShards(
    shardSources,
    uuidv4(),
    A,
    destination,
    "preliminary",
    insufficient || overconstrained
      ? {
          insufficientTravel: insufficient,
          requiredTravelMinutes: T,
          overconstrained: overconstrained || undefined,
        }
      : undefined,
  );
  if (shards.length > 0) {
    shards[0].consumedCategoryIds = (
      shards[0].consumedCategoryIds ?? []
    ).concat(consumedCategoryIds);
  }

  const replacements: Slot[] = [...shards];

  if (fit.kind === "naturalFit") {
    replacements.push(buildLandingSurvivor(fit.slot, travelEnd, destination));
  }

  slots.splice(i, removeCount, ...replacements);
  if (recorder) {
    recorder.action(
      M.bypassCategoryCascade.action(
        absorbed.map((s) => recorder.label(s)),
        insufficient,
        overconstrained,
      ),
    );
  }
  // For naturalFit, land on the landing-slot survivor so its exit edge can
  // fire. For preFit / hardStop / exhausted, land on the preserved boundary
  // slot.
  return fit.kind === "naturalFit"
    ? i + replacements.length - 1
    : i + replacements.length;
}

// ---------------------------------------------------------------------------
// Action: Available with next=Occupied — backward bypass cascade.
//
// Uses walkBackwardForFit to find the latest legal travel start. The walker
// returns one of preFit / naturalFit / overconstrained (success) or
// hardStop / exhausted (no anchor — fall back to the insufficient bleed).
// ---------------------------------------------------------------------------

export function backwardBypassCascade(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  categories: Category[],
  recorder?: TravelPassRecorder,
): number {
  const current = slots[i] as AvailableSlot;
  const destination = action.nextLocation;
  const regionEnd = current.end;

  // Untrack the original leg up front. If the walker can't find an anchor,
  // we re-track it in the fallback path.
  travelManager.untrackLeg(action.prevLocation, action.nextLocation);
  recorder?.decision(M.backwardBypassCascade.header, 5);

  const fit = walkBackwardForFit({
    slots,
    walkStartIdx: i,
    regionEnd,
    destination,
    travelManager,
    referenceTime: regionEnd,
  });

  if (fit.kind === "hardStop" || fit.kind === "exhausted") {
    recorder?.decision(M.backwardBypassCascade.noAnchorFits, 6);
    travelManager.trackLeg(action.prevLocation, action.nextLocation);
    const result = bleedSingleSideInsufficient(slots, i, action, "prev");
    recorder?.action(M.backwardBypassCascade.fallbackPrevAction);
    return result;
  }

  return applyBackwardCascadeFit({
    slots,
    walkStartIdx: i,
    fit,
    regionEnd,
    destination,
    travelManager,
    categories,
    recorder,
    actionMessage: (labels, overconstrained) =>
      M.backwardBypassCascade.action(labels, overconstrained),
  });
}

// ---------------------------------------------------------------------------
// Backward cascade placement — shared by backwardBypassCascade,
// absorbAndReplanThroughCategory's cascade branch, and absorbAndReplanBackward.
//
// Geometric rule (single rule for every kind):
//   travel.start = max(fit.travelStart, bleed.floor, recovered-Avail end)
//   travel.end   = regionEnd
//   overconstrained = travel.dur > T
//
// Each walker fit kind sets fit.travelStart according to the anchor:
//   - preFit:          anchor preserved → fit.travelStart = anchor.end.
//   - naturalFit:      anchor partial-eaten → fit.travelStart = regionEnd-T
//                      (inside anchor; head [anchor.start, travelStart]
//                      survives as a shortened anchor).
//   - overconstrained: anchor (atomic) absorbed → fit.travelStart =
//                      anchor.start.
//
// Two additional adjustments push travel.start forward:
//
//   1. Bleed-trimmed prev cat recovery. If the slot immediately before
//      the absorb is a Cat whose end was clipped by an earlier bleed
//      pass, partially restore its wrapper end. travel.start can't begin
//      before that. The restore target is capped at regionEnd - T so a
//      full wrapper restore can't push the travel into insufficiency.
//
//   2. Absorbed-Available recovery. The absorbed region may contain
//      Travel shards whose original source was an Available (created by
//      an earlier bleed pass that expected the user to travel toward a
//      destination this cascade is now reversing). Each such shard
//      sitting contiguously at the current "at A" boundary is surfaced
//      back as an Available@origin slot — it represents free time at the
//      cascade origin, not in-transit time. Same cap as Adjustment 1.
//
// Why this asymmetry from the forward cascades. Forward cascades fill the
// absorb region (travel.start = absorb.start) because the user has just
// left A — there's no "at A" time inside the absorb to preserve. Backward
// cascades preserve at-A time because the user IS at A throughout the
// absorb until the new travel departs.
// ---------------------------------------------------------------------------

export function applyBackwardCascadeFit(args: {
  slots: Slot[];
  walkStartIdx: number;
  fit: Extract<
    BackwardFitResult,
    { kind: "preFit" | "naturalFit" | "overconstrained" }
  >;
  regionEnd: Date;
  destination: string;
  travelManager: TravelManager;
  categories: Category[];
  recorder: TravelPassRecorder | undefined;
  actionMessage: (absorbedLabels: string[], overconstrained: boolean) => string;
}): number {
  const {
    slots,
    walkStartIdx,
    fit,
    regionEnd,
    destination,
    travelManager,
    categories,
    recorder,
  } = args;

  // PreFit: anchor preserved. Absorb = (anchor+1 .. walkStartIdx).
  // NaturalFit / overconstrained: anchor absorbed. Absorb = (anchor .. walkStartIdx).
  // The walker promotes preFit at a non-sentinel Travel span to
  // overconstrained, so we never see a preFit fit.slot of type "travel"
  // here unless it's a zero-distance sentinel (where the whole span IS one
  // logical slot at startIdx and there's no separate endIdx to worry about).
  const absorbStartIdx = fit.kind === "preFit" ? fit.idx + 1 : fit.idx;
  const removeCount = walkStartIdx - absorbStartIdx + 1;

  // Untrack absorbed travel legs.
  for (let k = absorbStartIdx; k <= walkStartIdx; k++) {
    const s = slots[k];
    if (s.type === "travel" && s.travelFromLocationId && s.travelToLocationId) {
      travelManager.untrackLeg(s.travelFromLocationId, s.travelToLocationId);
    }
  }
  travelManager.trackLeg(fit.origin, destination);

  // Adjustment 1: bleed-trimmed prev cat recovery, capped at regionEnd-T so
  // the restore never pushes travelStart past the latest point that still
  // meets natural T. When the cap bites, the cat is partially restored and
  // the new travel bleeds back into the remaining un-restored tail.
  const maxRestoreEndMs = regionEnd.getTime() - fit.T * 60000;
  const bleed = detectBleedRecovery(
    absorbStartIdx > 0 ? slots[absorbStartIdx - 1] : undefined,
    categories,
    slots[absorbStartIdx].start,
    undefined,
    new Date(maxRestoreEndMs),
  );

  let travelStart = fit.travelStart;
  if (travelStart.getTime() < bleed.floor.getTime()) {
    travelStart = bleed.floor;
  }

  // Build partial survivor for naturalFit. The anchor's head [anchor.start,
  // travelStart] becomes a shortened version of the anchor with next=origin.
  // If bleed recovery pushed travelStart past the anchor's start, the head
  // may be empty (or wholly inside the bleed wrapper) — no survivor.
  // (NaturalFit at a Travel anchor is impossible — atomic Travel spans
  // promote to overconstrained in the walker.)
  const leadingReplacements: Slot[] = [];
  if (
    fit.kind === "naturalFit" &&
    fit.slot.start.getTime() < travelStart.getTime() &&
    bleed.floor.getTime() <= fit.slot.start.getTime()
  ) {
    const anchor = fit.slot;
    if (anchor.type === "category" || anchor.type === "available") {
      leadingReplacements.push(
        shortenPlaceableAtEnd(anchor, travelStart, fit.origin),
      );
    }
  }

  const absorbed = slots.slice(absorbStartIdx, absorbStartIdx + removeCount);

  // Adjustment 2: absorbed-Available recovery. Travel shards in the absorb
  // whose original source was an Available (created by an earlier bleed
  // pass) represent free time at A, not in-transit time. Surface them
  // back as Available@origin slots — but only if they sit contiguously at
  // the current "at A" boundary. A non-contiguous recovered Available
  // can't be restored without tearing the slots array or claiming the
  // user is at two places at once.
  //
  // Restoration is also CAPPED at `regionEnd - T` (same cap as Adjustment
  // 1) so the new travel still covers at least its natural T. When the cap
  // bites mid-shard, only the first portion is recovered and the rest is
  // absorbed by the travel ("bleeding into the recovered Available").
  const recoveredAvails: AvailableSlot[] = [];
  let effectiveTravelStart = travelStart;
  for (const slot of absorbed) {
    if (slot.type !== "travel" || slot.originalType !== "available") continue;
    if (slot.start.getTime() !== effectiveTravelStart.getTime()) continue;
    const pieceEndMs = Math.min(
      slot.end.getTime(),
      regionEnd.getTime(),
      maxRestoreEndMs,
    );
    if (slot.start.getTime() >= pieceEndMs) break;
    recoveredAvails.push({
      type: "available",
      start: slot.start,
      end: new Date(pieceEndMs),
      durationMinutes: Math.floor((pieceEndMs - slot.start.getTime()) / 60000),
      prevLocationId: fit.origin,
      nextLocationId: fit.origin,
    });
    effectiveTravelStart = new Date(pieceEndMs);
    if (effectiveTravelStart.getTime() >= maxRestoreEndMs) break;
  }

  // Geometric overconstrained / insufficient: travel duration vs natural T.
  // The cap above prevents insufficient under normal walker returns, but
  // we still compute the flag defensively in case future changes shift
  // the budget arithmetic.
  const slotDurMs = regionEnd.getTime() - effectiveTravelStart.getTime();
  const naturalDurMs = fit.T * 60000;
  const insufficient = slotDurMs < naturalDurMs;
  const overconstrained = slotDurMs > naturalDurMs;

  // Travel shards come from sources in [effectiveTravelStart, regionEnd].
  // Extracted bleed-Availables are naturally excluded — they're outside this
  // range because effectiveTravelStart was pushed past them above. Bleed
  // shards we didn't extract (non-contiguous with the "at A" boundary) are
  // intentionally still included: the user is in transit during those, so
  // they belong to the new travel as Travel sources.
  const shardSources = collectShardSources(
    absorbed,
    effectiveTravelStart,
    regionEnd,
  );
  const shards = createTravelShards(
    shardSources,
    uuidv4(),
    fit.origin,
    destination,
    "preliminary",
    insufficient || overconstrained
      ? {
          insufficientTravel: insufficient,
          requiredTravelMinutes: fit.T,
          overconstrained: overconstrained || undefined,
        }
      : undefined,
  );
  if (shards.length > 0) {
    shards[0].consumedCategoryIds = (
      shards[0].consumedCategoryIds ?? []
    ).concat(fit.consumedCategoryIds);
  }

  const replacements: Slot[] = [
    ...leadingReplacements,
    ...recoveredAvails,
    ...shards,
  ];

  bleed.restore();

  // If every absorbed second turned out to be recoverable free time at A
  // (shards.length === 0), the leg tracker still has the new A->C leg from
  // trackLeg above. Untrack it — no travel actually happens here.
  if (shards.length === 0) {
    travelManager.untrackLeg(fit.origin, destination);
  }

  slots.splice(absorbStartIdx, removeCount, ...replacements);

  if (recorder) {
    recorder.action(
      args.actionMessage(
        absorbed.map((s) => recorder.label(s)),
        overconstrained,
      ),
    );
  }

  return absorbStartIdx + replacements.length;
}

// ---------------------------------------------------------------------------
// Restore the original leg in the tracker (untracked at the top of
// backwardBypassCascade) and place a localized insufficient travel that
// only touches [current, immediate prev]. Called from every cascade exit
// that doesn't place a new A->C travel — single place to keep the
// untrack/retrack ledger balanced.
// ---------------------------------------------------------------------------

function bleedSingleSideInsufficient(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  side: "prev" | "next",
): number {
  const slot = slots[i] as AvailableSlot;
  const { prevLocation, nextLocation, travelMinutes } = action;
  const neighborIdx = side === "prev" ? i - 1 : i + 1;
  const neighbor = slots[neighborIdx];
  if (
    !neighbor ||
    (neighbor.type !== "available" && neighbor.type !== "category")
  ) {
    return fillCurrentWithAlert(slots, i, action);
  }
  const neighborDur = neighbor.durationMinutes;
  const consumeFromNeighbor = neighborDur;
  let travelStart: Date;
  let travelEnd: Date;
  if (side === "prev") {
    travelEnd = slot.end;
    travelStart = new Date(slot.start.getTime() - consumeFromNeighbor * 60000);
  } else {
    travelStart = slot.start;
    travelEnd = new Date(slot.end.getTime() + consumeFromNeighbor * 60000);
  }
  // Two source pieces: the neighbor (fully consumed) and the current Available.
  const sources: ShardSource[] =
    side === "prev"
      ? [
          neighbor.type === "available"
            ? shardSourceFromAvailable(neighbor, travelStart, neighbor.end)
            : shardSourceFromCategory(neighbor, travelStart, neighbor.end),
          shardSourceFromAvailable(slot, slot.start, slot.end),
        ]
      : [
          shardSourceFromAvailable(slot, slot.start, slot.end),
          neighbor.type === "available"
            ? shardSourceFromAvailable(neighbor, neighbor.start, travelEnd)
            : shardSourceFromCategory(neighbor, neighbor.start, travelEnd),
        ];

  const shards = createTravelShards(
    sources,
    uuidv4(),
    prevLocation,
    nextLocation,
    "preliminary",
    { insufficientTravel: true, requiredTravelMinutes: travelMinutes },
  );
  if (side === "prev") {
    return spliceBleedPrev(
      slots,
      i,
      neighborIdx,
      neighbor,
      shards,
      true,
      travelStart,
    );
  }
  return spliceBleedNext(
    slots,
    i,
    neighborIdx,
    neighbor,
    shards,
    true,
    travelEnd,
  );
}

// ---------------------------------------------------------------------------
// Action: Available with next=Available/Category, insufficient — forward
// cascade with iterative destination replanning.
//
// Walks forward from the current Available slot through subsequent placeable
// slots (Available / Category) accumulating duration. At each step past the
// immediate next, REPLAN: retarget the travel to that slot's location
// (untrack the old leg, compute and track the new one). Then check fit:
//
//   - T <= consumed:           replanned travel fits inside the already-
//                              consumed slots. End exactly at this slot's
//                              start (slot itself preserved). The travel
//                              slot spans the consumed region — if larger
//                              than T, the geometric overconstrained flag
//                              fires from the post-loop check.
//   - consumed < T <= newCum:  bleed into this slot (partial split) and
//                              the slot's leftover head is preserved. The
//                              travel slot duration equals T exactly — no
//                              wasted space, NOT overconstrained.
//   - T > newCum:              consume this slot and cascade to the next.
//
// `overconstrained` is computed geometrically AFTER placement: only when
// the travel slot duration exceeds the actual travel duration T. Cascading
// past cats with an exact-fit bleed isn't overconstrained — the slot fits.
//
// Hard stop (Occupied / Travel / end of slots): if the Occupied has a
// location we haven't reached yet, replan once more straight to it. Then
// place a travel up to slot.start; insufficient = (consumed < T).
// ---------------------------------------------------------------------------

export function forwardBypassCascade(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
): number {
  const current = slots[i] as AvailableSlot;
  const A = action.prevLocation;
  travelManager.untrackLeg(action.prevLocation, action.nextLocation);

  recorder?.decision(M.forwardBypassCascade.header, 5);

  const fit = walkForwardForFit({
    slots,
    startIdx: i,
    referenceStartTime: current.start,
    initialConsumedCategoryIds: [],
    availableCandidateMode: "always-next",
    travelManager,
    origin: A,
    referenceTime: () => current.end,
    hardStopReferenceTime: current.end,
  });

  let destination = action.nextLocation;
  let T = action.travelMinutes;
  let boundary: Date;
  let removeCount: number;
  const consumedCategoryIds = [...fit.consumedCategoryIds];

  switch (fit.kind) {
    case "naturalFit": {
      destination = fit.destination;
      T = fit.T;
      boundary = fit.travelEnd;
      if (
        fit.slot.type === "category" &&
        boundary.getTime() > fit.slot.start.getTime()
      ) {
        consumedCategoryIds.push(fit.slot.categoryId);
      } else if (
        fit.slot.type === "travel" &&
        fit.slot.consumedCategoryIds &&
        boundary.getTime() > fit.slot.start.getTime()
      ) {
        consumedCategoryIds.push(...fit.slot.consumedCategoryIds);
      }
      removeCount = fit.idx - i + 1;
      recorder?.decision(
        M.forwardBypassCascade.partialSplit(fit.idx, fit.remaining),
        7,
      );
      break;
    }
    case "preFit": {
      destination = fit.destination;
      T = fit.T;
      boundary = fit.slot.start;
      removeCount = fit.idx - i;
      recorder?.decision(
        M.forwardBypassCascade.endAtSlotStart(T, fit.consumed, fit.idx),
        7,
      );
      break;
    }
    case "hardStop": {
      if (recorder) {
        recorder.decision(
          M.forwardBypassCascade.anchorHardStop(
            fit.idx,
            recorder.label(fit.hardStopSlot),
          ),
          6,
        );
      }
      if (fit.pinnedDestination) {
        destination = fit.pinnedDestination;
        T = fit.pinnedT;
        recorder?.decision(M.forwardBypassCascade.retargetOccupied(T), 7);
      }
      boundary = fit.hardStopSlot.start;
      removeCount = fit.idx - i;
      break;
    }
    case "exhausted": {
      const lastIdx = slots.length - 1;
      boundary = lastIdx > i ? slots[lastIdx].end : current.end;
      removeCount = slots.length - i;
      break;
    }
  }

  // Track the final chosen leg before placement.
  travelManager.trackLeg(A, destination);

  // Forward cascade geometric rule (same as bypassCategoryCascade). The
  // user already left A at current.start — no "at A" time to preserve, no
  // bleed-Available recovery.
  //
  //   travel.start = current.start                  (= absorb-region start)
  //   travel.end   = boundary                       (= region end)
  //
  //   overconstrained when slot.dur > T
  //   insufficient    when slot.dur < T (hardStop / exhausted only)
  //
  // For naturalFit the boundary IS T after travelStart, so the slot
  // duration matches T exactly; the landing slot's tail survives as the
  // landing-slot survivor.
  const travelStart = current.start;
  const travelEnd = boundary;
  const slotDurMs = travelEnd.getTime() - travelStart.getTime();
  const naturalDurMs = T * 60000;
  const insufficient = slotDurMs < naturalDurMs;
  const overconstrained = slotDurMs > naturalDurMs;

  const absorbed = slots.slice(i, i + removeCount);
  const shardSources = collectShardSources(absorbed, travelStart, travelEnd);
  const shards = createTravelShards(
    shardSources,
    uuidv4(),
    A,
    destination,
    "preliminary",
    insufficient || overconstrained
      ? {
          insufficientTravel: insufficient,
          requiredTravelMinutes: T,
          overconstrained: overconstrained || undefined,
        }
      : undefined,
  );
  if (shards.length > 0) {
    shards[0].consumedCategoryIds = (
      shards[0].consumedCategoryIds ?? []
    ).concat(consumedCategoryIds);
  }

  const replacements: Slot[] = [...shards];

  if (fit.kind === "naturalFit") {
    replacements.push(buildLandingSurvivor(fit.slot, travelEnd, destination));
  }

  slots.splice(i, removeCount, ...replacements);
  if (recorder) {
    recorder.action(
      M.forwardBypassCascade.action(
        absorbed.map((s) => recorder.label(s)),
        insufficient,
        overconstrained,
      ),
    );
  }
  return fit.kind === "naturalFit"
    ? i + replacements.length - 1
    : i + replacements.length;
}
