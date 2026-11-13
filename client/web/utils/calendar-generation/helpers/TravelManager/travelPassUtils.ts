/**
 * travelPassUtils
 *
 * Pure utilities used by the preliminary travel pass. Geometry helpers,
 * lookups, and the shared forward-fit walk primitive. Kept separate from the
 * walker / handler / cascade code so the dispatch logic stays readable.
 *
 * Nothing here mutates the slots array — callers do the splicing.
 */

import { Category } from "@/types/prisma";
import {
  AvailableSlot,
  CategorySlot,
  Slot,
  TravelSlot,
} from "../../models/TimeSlot";
import { TravelManager } from "../../core/TravelManager";
import { findTravelShardSpan } from "../../utils/timeSlotUtils";
import { expandCategoryWindowPeriods } from "../TimeSlotManager/expandCategoryWindowPeriods";

// ---------------------------------------------------------------------------
// Bleed-trimmed category recovery
// ---------------------------------------------------------------------------

export type BleedTrimmedCat = { slot: CategorySlot; wrapperEnd: Date };

/**
 * Detects a Category slot whose end was trimmed by an earlier bleed — i.e.
 * its CategorySlot.end sits earlier than the wrapper period's true end.
 * Cascade placements that anchor on the slot's right boundary use this to
 * recover the original-fabric boundary so the new travel's left edge sits
 * cleanly on it instead of on the bleed seam.
 */
export function detectBleedTrimmedCat(
  slot: Slot | undefined,
  categories: Category[],
  maxWrapperEnd?: Date,
): BleedTrimmedCat | null {
  if (!slot || slot.type !== "category") return null;
  const wrapperEnd = findCategoryWrapperEnd(slot, categories);
  if (!wrapperEnd || wrapperEnd.getTime() <= slot.end.getTime()) return null;
  if (maxWrapperEnd && wrapperEnd.getTime() > maxWrapperEnd.getTime())
    return null;
  return { slot, wrapperEnd };
}

/**
 * Mutates the trimmed cat back to its full wrapper duration. The slot is
 * expected to survive in slots[] after the surrounding splice — the new
 * travel will start exactly at slot.end after this restore.
 */
export function restoreBleedTrimmedCat(trimmed: BleedTrimmedCat): void {
  const { slot, wrapperEnd } = trimmed;
  slot.end = wrapperEnd;
  slot.durationMinutes = Math.floor(
    (slot.end.getTime() - slot.start.getTime()) / 60000,
  );
  slot.nextLocationId = slot.currentLocationId;
  slot.trespassingEnd = undefined;
}

// Result bundle for the detect→floor→restore pattern that every cascade absorb
// uses to handle a bleed-trimmed Category sitting at the boundary of its
// absorb region. `floor` is the earliest the new travel may start (the partial
// restore target when trimmed, otherwise the caller-provided default).
// `restore()` is a no-op when nothing was trimmed; call it before the
// surrounding splice.
export type BleedRecovery = {
  trimmed: BleedTrimmedCat | null;
  floor: Date;
  restore: () => void;
};

/**
 * Wraps the detect→compute-floor→restore pattern shared by every cascade
 * absorb. Pass the candidate slot to inspect (typically the slot just before
 * the absorb region, or the chosen backward anchor itself), the fallback
 * floor to use when the slot isn't a bleed-trimmed Category, and:
 *
 *   - `maxWrapperEnd` — disables detection if the cat's wrapper would extend
 *     past this point. Used by backward cascades to refuse a restore that
 *     would reach beyond the absorb's far edge.
 *
 *   - `maxRestoreEnd` — caps the partial restore target. If a full wrapper
 *     restore would push the new travel past this point (typically
 *     `regionEnd - T`, the latest start that still meets natural T), the
 *     restore is clipped here. The cat ends up partially restored — the
 *     new travel then bleeds back into the remaining un-restored portion
 *     of the cat as needed.
 */
export function detectBleedRecovery(
  candidateSlot: Slot | undefined,
  categories: Category[],
  defaultFloor: Date,
  maxWrapperEnd?: Date,
  maxRestoreEnd?: Date,
): BleedRecovery {
  const trimmed = detectBleedTrimmedCat(candidateSlot, categories, maxWrapperEnd);
  if (!trimmed) {
    return {
      trimmed: null,
      floor: defaultFloor,
      restore: () => {},
    };
  }
  // Partial restore target. Clamped between the current (trimmed) end and
  // the wrapper end, with maxRestoreEnd capping the upper bound.
  const wrapperEndMs = trimmed.wrapperEnd.getTime();
  const currentEndMs = trimmed.slot.end.getTime();
  const targetMs = maxRestoreEnd
    ? Math.max(currentEndMs, Math.min(wrapperEndMs, maxRestoreEnd.getTime()))
    : wrapperEndMs;
  const restoreTarget = new Date(targetMs);
  return {
    trimmed,
    floor: restoreTarget,
    restore: () => {
      const slot = trimmed.slot;
      slot.end = restoreTarget;
      slot.durationMinutes = Math.floor(
        (slot.end.getTime() - slot.start.getTime()) / 60000,
      );
      slot.nextLocationId = slot.currentLocationId;
      // Only clear the trespass marker on a full restore — a partial
      // restore still leaves the cat short of its wrapper, so the
      // boundary trespass remains meaningful.
      if (targetMs >= wrapperEndMs) {
        slot.trespassingEnd = undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Category wrapper lookup
// ---------------------------------------------------------------------------

/**
 * Look up the wrapper end of a CategorySlot by matching against its
 * Category's recurring timeSlots for the slot's day. Returns null if no
 * matching wrapper period contains the slot (which can happen if the slot's
 * boundaries were clipped by a gap rather than the wrapper itself).
 */
export function findCategoryWrapperEnd(
  slot: CategorySlot,
  categories: Category[],
): Date | null {
  const wrapper = findCategoryWrapper(slot, categories);
  return wrapper?.end ?? null;
}

export function findCategoryWrapper(
  slot: CategorySlot,
  categories: Category[],
): { start: Date; end: Date } | null {
  const category = categories.find((c) => c.id === slot.categoryId);
  if (!category?.timeSlots?.length) return null;

  // Pad a day either side so overnight occurrences anchored the previous day
  // and exception-moved occurrences containing this fragment stay findable.
  const day = new Date(slot.start);
  day.setHours(0, 0, 0, 0);
  const rangeStart = new Date(day);
  rangeStart.setDate(rangeStart.getDate() - 1);
  const rangeEnd = new Date(day);
  rangeEnd.setDate(rangeEnd.getDate() + 2);

  const periods = expandCategoryWindowPeriods([category], rangeStart, rangeEnd);
  for (const period of periods) {
    if (
      period.start.getTime() <= slot.start.getTime() &&
      period.end.getTime() >= slot.end.getTime()
    ) {
      return { start: period.start, end: period.end };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recent-travel lookup (transparent prev-Available + Anywhere chain)
// ---------------------------------------------------------------------------

/**
 * Walks backward from slots[startIdx] skipping transparent slots (Available
 * leftover, Anywhere Occupied) and returns the first Travel found, or null
 * if none. Entry-edge and Available handlers use this to detect that an
 * earlier walker step has already placed the relevant travel — the caller
 * inspects the travel's destination to decide whether to skip or fall
 * through to a fresh placement.
 */
export function findRecentTravelBehind(
  slots: Slot[],
  startIdx: number,
): { travel: TravelSlot; idx: number } | null {
  let idx = startIdx;
  while (idx >= 0) {
    const s = slots[idx];
    if (s.type === "travel") return { travel: s, idx };
    if (s.type === "available") {
      idx--;
      continue;
    }
    if (s.type === "occupied" && s.locationId == null) {
      idx--;
      continue;
    }
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Forward fit walk — shared primitive used by every forward cascade. Walks
// slots[startIdx..] looking for the first slot whose location yields a
// natural-fit (T fits inside the slot given accumulated consumed minutes)
// or pre-fit (T is already <= consumed, so the travel ends at slot.start
// and the slot survives intact). Stops on Occupied / Travel; if the stop
// is a location-pinned Occupied the result carries that pin so the caller
// can retarget the final placement to it.
//
// Available candidate handling differs by call site:
//   - "always-next": treat every Available as a destination using
//     nextLocationId (the forward cascade variants that walk through transit
//     space heading toward the original target).
//   - "transit-only": only treat Available as a destination when
//     prevLocationId === nextLocationId (the user is sitting at A and the
//     surrounding cats already routed; we can land here without disturbing
//     the upcoming transition the slot is reserving).
// ---------------------------------------------------------------------------

export type AvailableCandidateMode = "always-next" | "transit-only";

// The fit may land inside an Available, Category, OR a zero-distance Travel
// sentinel (the marker the pre-pass leaves where it killed an unreachable
// category). Sentinels are traversable because the user is statically at
// that location through them.
export type ForwardCandidateSlot = AvailableSlot | CategorySlot | TravelSlot;

export type ForwardFitResult =
  | {
      kind: "naturalFit";
      idx: number;
      slot: ForwardCandidateSlot;
      destination: string;
      T: number;
      travelEnd: Date;
      // Minutes eaten from the landing slot — `T - consumed` at fit time.
      remaining: number;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "preFit";
      idx: number;
      slot: ForwardCandidateSlot;
      destination: string;
      T: number;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "hardStop";
      idx: number;
      hardStopSlot: Slot;
      pinnedDestination: string | null;
      pinnedT: number;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "exhausted";
      consumed: number;
      consumedCategoryIds: string[];
    };

// Per-slot event fired by walkForwardForFit. Lets callers emit fine-grained
// per-slot recorder lines (e.g. "evaluated this cat", "overshot, continuing")
// without re-implementing the loop.
export type ForwardWalkEvent = {
  kind: "candidate";
  idx: number;
  slot: ForwardCandidateSlot;
  destination: string;
  T: number;
  fitKind: "naturalFit" | "preFit" | "overflow";
  consumed: number;
};

// True for zero-distance Travel slots — they're sentinels for consumed cats
// where the user stays at travelFromLocationId throughout. The cascade can
// traverse them as if they were free time at that location.
function isZeroDistanceSentinel(slot: Slot): boolean {
  return (
    slot.type === "travel" &&
    slot.travelFromLocationId !== null &&
    slot.travelFromLocationId === slot.travelToLocationId
  );
}

// A candidate slot can have two landing targets:
//   - preFitTarget: where the user is expected to BE at slot.start. The travel
//     ends at slot.start and the slot survives intact.
//   - naturalFitTarget: where the user ends up AFTER landing somewhere inside
//     the slot. The slot's head [start, landing] is absorbed by the travel,
//     its tail [landing, end] survives. Null when partial-split would leave
//     an incoherent fragment (sentinels, where the marker is atomic).
//
// Category: both targets are the Category's own location. The Cat already
// sits at the destination, so landing inside it leaves a coherent tail (user
// at cat.location for the surviving cat.tail).
//
// Travel sentinel: only preFitTarget. Sentinels are dropped-cat markers; a
// partial split would imply the dropped cat is partially un-dropped, which
// is contradictory.
//
// Available "always-next": preFit lands at slot.start with the user at prev
// (matches Available.prevLoc); naturalFit lands inside, with the user already
// transitioned to next.
//
// Available "transit-only": only relevant when prev === next (the user is
// sitting at one place); preFit/naturalFit both target that location.
function resolveLandingTargets(
  slot: ForwardCandidateSlot,
  mode: AvailableCandidateMode,
): { preFitTarget: string | null; naturalFitTarget: string | null } {
  if (slot.type === "category") {
    return {
      preFitTarget: slot.currentLocationId,
      naturalFitTarget: slot.currentLocationId,
    };
  }
  if (slot.type === "travel") {
    // Zero-distance sentinel. Real travels never reach this helper — they're
    // hard-stopped above.
    return { preFitTarget: slot.travelFromLocationId, naturalFitTarget: null };
  }
  if (mode === "always-next") {
    return {
      preFitTarget: slot.prevLocationId ?? null,
      naturalFitTarget: slot.nextLocationId ?? null,
    };
  }
  if (slot.prevLocationId && slot.prevLocationId === slot.nextLocationId) {
    return {
      preFitTarget: slot.prevLocationId,
      naturalFitTarget: slot.prevLocationId,
    };
  }
  return { preFitTarget: null, naturalFitTarget: null };
}

export function walkForwardForFit(args: {
  slots: Slot[];
  startIdx: number;
  // Absolute reference timestamp the walker uses to measure elapsed time at
  // each candidate slot — consumedMs = slot.start - referenceStartTime. Using
  // a fixed reference avoids drift from slot.durationMinutes flooring when
  // timestamps have sub-minute precision (e.g. a 21.5-minute Category stored
  // as durationMinutes=21 would otherwise undercount by 30 seconds and push
  // travelEnd past the natural boundary).
  referenceStartTime: Date;
  initialConsumedCategoryIds: string[];
  availableCandidateMode: AvailableCandidateMode;
  travelManager: TravelManager;
  origin: string;
  referenceTime: (slot: ForwardCandidateSlot) => Date;
  hardStopReferenceTime: Date;
  onVisit?: (event: ForwardWalkEvent) => void;
}): ForwardFitResult {
  const consumedCategoryIds = [...args.initialConsumedCategoryIds];
  const referenceMs = args.referenceStartTime.getTime();
  let idx = args.startIdx;

  while (idx < args.slots.length) {
    const slot = args.slots[idx];
    const slotStartMs = slot.start.getTime();
    const slotEndMs = slot.end.getTime();
    const consumedMs = slotStartMs - referenceMs;
    const consumedMinutes = Math.floor(consumedMs / 60000);

    // Real hard stops: Occupied (any) and non-sentinel Travel (the walker
    // placed it for a real transition; absorbing would invalidate that).
    const isRealHardStop =
      slot.type === "occupied" ||
      (slot.type === "travel" && !isZeroDistanceSentinel(slot));
    if (isRealHardStop) {
      let pinnedDestination: string | null = null;
      let pinnedT = 0;
      if (slot.type === "occupied" && slot.locationId) {
        const hardT = args.travelManager.getTravelTime(
          args.origin,
          slot.locationId,
          args.hardStopReferenceTime,
        );
        if (hardT > 0) {
          pinnedDestination = slot.locationId;
          pinnedT = hardT;
        }
      }
      return {
        kind: "hardStop",
        idx,
        hardStopSlot: slot,
        pinnedDestination,
        pinnedT,
        consumed: consumedMinutes,
        consumedCategoryIds,
      };
    }

    const candidate = slot as ForwardCandidateSlot;
    const { preFitTarget, naturalFitTarget } = resolveLandingTargets(
      candidate,
      args.availableCandidateMode,
    );
    const slotDurMs = slotEndMs - slotStartMs;
    const refTime = args.referenceTime(candidate);

    const T_pre = preFitTarget
      ? args.travelManager.getTravelTime(args.origin, preFitTarget, refTime)
      : 0;
    const T_nat = naturalFitTarget
      ? args.travelManager.getTravelTime(args.origin, naturalFitTarget, refTime)
      : 0;
    const T_pre_ms = T_pre * 60000;
    const T_nat_ms = T_nat * 60000;

    // preFit: travel ends at slot.start with the slot surviving intact.
    // Try each candidate target in order. preFitTarget is the primary
    // (slot.prevLocationId for Available always-next; the cat's location for
    // Category). naturalFitTarget — when different — is the "redirect"
    // fallback for Available always-next where T(origin→prev) doesn't fit
    // but T(origin→next) does; the slot's prev→next transition becomes
    // redundant and the surviving slot is effectively Available at next
    // throughout.
    const preFitOptions: { target: string; T: number; Tms: number }[] = [];
    if (preFitTarget && T_pre > 0) {
      preFitOptions.push({ target: preFitTarget, T: T_pre, Tms: T_pre_ms });
    }
    if (naturalFitTarget && naturalFitTarget !== preFitTarget && T_nat > 0) {
      preFitOptions.push({ target: naturalFitTarget, T: T_nat, Tms: T_nat_ms });
    }
    for (const opt of preFitOptions) {
      if (opt.Tms <= consumedMs) {
        args.onVisit?.({
          kind: "candidate",
          idx,
          slot: candidate,
          destination: opt.target,
          T: opt.T,
          fitKind: "preFit",
          consumed: consumedMinutes,
        });
        return {
          kind: "preFit",
          idx,
          slot: candidate,
          destination: opt.target,
          T: opt.T,
          consumed: consumedMinutes,
          consumedCategoryIds,
        };
      }
    }

    // naturalFit at naturalFitTarget — travel lands inside slot at the user
    // arriving at naturalFitTarget. Slot tail [landing, end] survives.
    if (
      naturalFitTarget &&
      T_nat > 0 &&
      T_nat_ms > consumedMs &&
      T_nat_ms <= consumedMs + slotDurMs
    ) {
      const remainingMs = T_nat_ms - consumedMs;
      const travelEnd = new Date(slotStartMs + remainingMs);
      args.onVisit?.({
        kind: "candidate",
        idx,
        slot: candidate,
        destination: naturalFitTarget,
        T: T_nat,
        fitKind: "naturalFit",
        consumed: consumedMinutes,
      });
      return {
        kind: "naturalFit",
        idx,
        slot: candidate,
        destination: naturalFitTarget,
        T: T_nat,
        travelEnd,
        remaining: Math.floor(remainingMs / 60000),
        consumed: T_nat,
        consumedCategoryIds,
      };
    }

    // Overflow: emit the visit event with whichever T we evaluated (prefer the
    // naturalFit target since that's the user-facing "where would I land" T)
    // and fall through to consume the slot.
    const overflowTarget = naturalFitTarget ?? preFitTarget;
    const overflowT = T_nat > 0 ? T_nat : T_pre;
    if (overflowTarget && overflowT > 0) {
      args.onVisit?.({
        kind: "candidate",
        idx,
        slot: candidate,
        destination: overflowTarget,
        T: overflowT,
        fitKind: "overflow",
        consumed: consumedMinutes,
      });
    }

    // Consume the slot: pull in its identity for the new travel's consumed
    // list. Categories contribute their categoryId; zero-distance Travel
    // sentinels contribute their already-recorded consumedCategoryIds. No
    // consumed accumulator — the next iteration recomputes from referenceMs.
    if (slot.type === "category") {
      consumedCategoryIds.push(slot.categoryId);
    } else if (slot.type === "travel" && slot.consumedCategoryIds) {
      consumedCategoryIds.push(...slot.consumedCategoryIds);
    }
    idx += 1;
  }

  const lastSlotEndMs =
    args.slots.length > 0
      ? args.slots[args.slots.length - 1].end.getTime()
      : referenceMs;
  return {
    kind: "exhausted",
    consumed: Math.floor((lastSlotEndMs - referenceMs) / 60000),
    consumedCategoryIds,
  };
}

// ---------------------------------------------------------------------------
// Backward fit walk — the rigorous backward equivalent of walkForwardForFit.
// Walks slots[walkStartIdx..0] backward looking for a slot whose location
// yields a travel to `destination` that fits the accumulated minutes. Four
// fit modes at each candidate:
//
//   - preFit   (T ≤ consumed):              travel ends at regionEnd, starts
//                                           at the candidate's end. Candidate
//                                           preserved.
//   - naturalFit (consumed < T ≤ +slotDur): travel ends at regionEnd, starts
//                                           inside the candidate. Candidate's
//                                           head survives as a shortened
//                                           version of itself. ONLY when the
//                                           candidate is non-atomic.
//   - overconstrained (atomic + interior):  the natural start lands inside
//                                           an atomic candidate, so the
//                                           travel must extend to the
//                                           candidate's start, absorbing it
//                                           wholly. Travel slot is bigger
//                                           than T.
//   - overflow:                             consume candidate wholly, walk
//                                           back.
//
// Candidate types:
//   - Live Category: origin = currentLocationId. Non-atomic; partial-eat
//     trims the Cat's tail.
//   - Live Available (transit-mode, prev == next): origin = prev. Non-atomic;
//     partial-eat trims the Available's tail. Non-transit Availables aren't
//     candidates — choosing one would erase the upstream transition.
//   - Travel SPAN (every Travel slot is processed as part of its whole span,
//     coalescing all shards sharing a travelId): origin = travelFromLocationId.
//     ATOMIC. The user is in transit during a travel; partial-eating a span
//     would mean half-travelling, which is incoherent. The walker consumes
//     or preserves the whole span; never carves into it. This applies to
//     real placement travels, bleed travels, AND zero-distance sentinels.
//
// Hard stop on Occupied. Exhausted if we walk past slots[0] without a fit.
// ---------------------------------------------------------------------------

export type BackwardCandidateSlot = AvailableSlot | CategorySlot | TravelSlot;

export type BackwardFitResult =
  | {
      kind: "preFit";
      idx: number;
      slot: BackwardCandidateSlot;
      origin: string;
      T: number;
      travelStart: Date;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "naturalFit";
      idx: number;
      slot: BackwardCandidateSlot;
      origin: string;
      T: number;
      travelStart: Date;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "overconstrained";
      idx: number;
      slot: BackwardCandidateSlot;
      origin: string;
      T: number;
      travelStart: Date;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "hardStop";
      idx: number;
      hardStopSlot: Slot;
      consumed: number;
      consumedCategoryIds: string[];
    }
  | {
      kind: "exhausted";
      consumed: number;
      consumedCategoryIds: string[];
    };

// Per-candidate view used by the walker. For a Travel slot the candidate
// reflects the whole shard span (idx = span.startIdx, slotDur = span total).
type BackwardCandidate = {
  idx: number; // canonical idx (for Travel spans: startIdx of the leftmost shard)
  slot: BackwardCandidateSlot; // representative slot (for Travel spans: first shard)
  origin: string | null;
  isAtomic: boolean;
  slotDur: number;
  slotStart: Date;
  slotEnd: Date;
  contributedCategoryIds: string[];
  prevIdx: number; // next idx to visit after this candidate
};

function nextBackwardCandidate(
  slots: Slot[],
  idx: number,
):
  | { kind: "candidate"; value: BackwardCandidate }
  | { kind: "hardStop"; slot: Slot }
  | { kind: "skip"; prevIdx: number } {
  const slot = slots[idx];

  if (slot.type === "occupied") {
    return { kind: "hardStop", slot };
  }

  if (slot.type === "travel") {
    const span = findTravelShardSpan(slots, idx);
    if (!span) return { kind: "skip", prevIdx: idx - 1 };
    const spanEnd = span.shards[span.shards.length - 1].end;
    const slotDur = Math.floor(
      (spanEnd.getTime() - span.travelStart.getTime()) / 60000,
    );
    const catSet = new Set<string>();
    for (const s of span.shards) {
      if (s.consumedCategoryIds) {
        for (const id of s.consumedCategoryIds) catSet.add(id);
      }
      if (s.originalType === "category" && s.originalCategoryId) {
        catSet.add(s.originalCategoryId);
      }
    }
    return {
      kind: "candidate",
      value: {
        idx: span.startIdx,
        slot: span.shards[0],
        origin: span.travelFromLocationId,
        isAtomic: true,
        slotDur,
        slotStart: span.travelStart,
        slotEnd: spanEnd,
        contributedCategoryIds: [...catSet],
        prevIdx: span.startIdx - 1,
      },
    };
  }

  if (slot.type === "category") {
    return {
      kind: "candidate",
      value: {
        idx,
        slot,
        origin: slot.currentLocationId,
        isAtomic: false,
        slotDur: slot.durationMinutes,
        slotStart: slot.start,
        slotEnd: slot.end,
        contributedCategoryIds: [slot.categoryId],
        prevIdx: idx - 1,
      },
    };
  }

  // Available — only a candidate origin when prev == next (transit-mode).
  const origin =
    slot.prevLocationId && slot.prevLocationId === slot.nextLocationId
      ? slot.prevLocationId
      : null;
  return {
    kind: "candidate",
    value: {
      idx,
      slot,
      origin,
      isAtomic: false,
      slotDur: slot.durationMinutes,
      slotStart: slot.start,
      slotEnd: slot.end,
      contributedCategoryIds: [],
      prevIdx: idx - 1,
    },
  };
}

export function walkBackwardForFit(args: {
  slots: Slot[];
  walkStartIdx: number;
  regionEnd: Date;
  destination: string;
  travelManager: TravelManager;
  referenceTime: Date;
}): BackwardFitResult {
  let idx = args.walkStartIdx;
  const consumedCategoryIds = new Set<string>();
  const regionEndMs = args.regionEnd.getTime();

  while (idx >= 0) {
    const step = nextBackwardCandidate(args.slots, idx);

    if (step.kind === "hardStop") {
      return {
        kind: "hardStop",
        idx,
        hardStopSlot: step.slot,
        consumed: Math.floor(
          (regionEndMs - step.slot.end.getTime()) / 60000,
        ),
        consumedCategoryIds: [...consumedCategoryIds],
      };
    }
    if (step.kind === "skip") {
      idx = step.prevIdx;
      continue;
    }

    const cand = step.value;
    // Timestamp-based accounting (the fabric is gapless): measuring elapsed
    // time from regionEnd avoids the sub-minute drift that accumulating
    // floored durationMinutes produces — same reasoning as
    // walkForwardForFit's referenceStartTime.
    const consumedMs = regionEndMs - cand.slotEnd.getTime();
    const slotDurMs = cand.slotEnd.getTime() - cand.slotStart.getTime();
    const consumedMinutes = Math.floor(consumedMs / 60000);

    if (cand.origin && cand.origin !== args.destination) {
      const T = args.travelManager.getTravelTime(
        cand.origin,
        args.destination,
        args.referenceTime,
      );
      if (T > 0) {
        const Tms = T * 60000;
        if (Tms <= consumedMs) {
          // A non-sentinel atomic anchor (a real Travel span going from A to
          // some B != A) can't be a preFit-preserved anchor: preserving it
          // would leave the user at B at spanEnd, but the new travel starts
          // from A. Promote to overconstrained — absorb the whole span and
          // start the new travel at spanStart, where the user was last
          // genuinely at A. Sentinel spans (from == to) fall through to
          // normal preFit since the user stays put throughout the span.
          const isSentinel =
            cand.slot.type === "travel" &&
            cand.slot.travelFromLocationId !== null &&
            cand.slot.travelFromLocationId === cand.slot.travelToLocationId;
          if (cand.isAtomic && !isSentinel) {
            const localConsumed = new Set(consumedCategoryIds);
            for (const id of cand.contributedCategoryIds) localConsumed.add(id);
            return {
              kind: "overconstrained",
              idx: cand.idx,
              slot: cand.slot,
              origin: cand.origin,
              T,
              travelStart: cand.slotStart,
              consumed: Math.floor((consumedMs + slotDurMs) / 60000),
              consumedCategoryIds: [...localConsumed],
            };
          }
          return {
            kind: "preFit",
            idx: cand.idx,
            slot: cand.slot,
            origin: cand.origin,
            T,
            travelStart: cand.slotEnd,
            consumed: consumedMinutes,
            consumedCategoryIds: [...consumedCategoryIds],
          };
        }
        if (Tms <= consumedMs + slotDurMs) {
          // Candidate is absorbed (partial in naturalFit, whole in
          // overconstrained). Add its contributed cats to consumed.
          const localConsumed = new Set(consumedCategoryIds);
          for (const id of cand.contributedCategoryIds) localConsumed.add(id);
          if (cand.isAtomic) {
            return {
              kind: "overconstrained",
              idx: cand.idx,
              slot: cand.slot,
              origin: cand.origin,
              T,
              travelStart: cand.slotStart,
              consumed: consumedMinutes,
              consumedCategoryIds: [...localConsumed],
            };
          }
          const travelStart = new Date(regionEndMs - Tms);
          return {
            kind: "naturalFit",
            idx: cand.idx,
            slot: cand.slot,
            origin: cand.origin,
            T,
            travelStart,
            consumed: consumedMinutes,
            consumedCategoryIds: [...localConsumed],
          };
        }
      }
    }

    // Overflow: consume candidate wholly, walk back.
    for (const id of cand.contributedCategoryIds) consumedCategoryIds.add(id);
    idx = cand.prevIdx;
  }

  const firstSlotStartMs =
    args.slots.length > 0 ? args.slots[0].start.getTime() : regionEndMs;
  return {
    kind: "exhausted",
    consumed: Math.floor((regionEndMs - firstSlotStartMs) / 60000),
    consumedCategoryIds: [...consumedCategoryIds],
  };
}
