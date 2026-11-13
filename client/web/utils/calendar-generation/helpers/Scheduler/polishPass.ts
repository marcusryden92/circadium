import { Planner, PlannerType, SimpleEvent } from "@/types/prisma";
import { Category } from "@/types/prisma";
import { plannerHasFlexibleRecurrence } from "../../../planRecurrence";
import {
  AvailableSlot,
  OccupiedSlot,
  Slot,
} from "../../models/TimeSlot";
import { TravelManager } from "../../core/TravelManager";
import { SCHEDULING_CONFIG } from "../../constants";
import { unplanTravel } from "../../utils/timeSlotUtils";
import { reserveSlotWithTravel } from "../TimeSlotManager/reserveSlotWithTravel";
import { expandCategoryWindowPeriods } from "../TimeSlotManager/expandCategoryWindowPeriods";
import { intersectIntervalWithAllowed } from "../../../allowedTimes";
import type { PlannerSchedulingConstraints } from "../CalendarGenerator/buildPlannerConstraintsMap";
import { resolveInheritedDeadline } from "../PrioritySorter/schedulingOrder";

// Same-duration polish pass: after every placement loop has run, one
// non-iterating sweep over pairs of placed dynamic events looks for pure slot
// exchanges that strictly reduce travel. The greedy forward pass reliably
// produces "Tuesday's errand near the office, Wednesday's errand at home,
// each dragging its own commute" — swapping them is strictly better and
// geometrically trivial because the durations are identical: no re-splicing,
// no capacity risk beyond the travel envelopes, no leftover reconstruction.
//
// Safety model: snapshot-trial-restore. The slot fabric is deep-cloned before
// each trial; the swap runs through the REAL reservation mutation
// (reserveSlotWithTravel) so travel and buffers are reconstructed by the same
// code as normal placement, and any failure or non-improvement restores the
// snapshot wholesale — a half-applied swap cannot survive.
//
// v1 eligibility is deliberately narrow (every exclusion errs toward "no
// swap", never toward a wrong one):
//   - plain single-block leaves only — no split chunks, habit occurrences, or
//     other composite-id placements (their ledgers/windows don't move well)
//   - no chain or precedence involvement (queue/dependency/detour bounds and
//     goal day caps are placement-time invariants this pass cannot re-check)
//   - both intervals clear of every category-window occurrence (an event
//     inside a window sits on category interior the freed region could not
//     faithfully restore)
//   - flanking travel legs are removed only when location-matched to the
//     event (see collectOwnLegs); unrecognized flush geometry rejects the pair
//   - both intervals before the placement cutoff, within PAIR_WINDOW_DAYS of
//     each other, and mutually compatible with earliest-start + allowed-times

const MS_PER_MINUTE = 60 * 1000;

export interface PolishSwap {
  aId: string;
  bId: string;
}

export interface PolishPassArgs {
  slots: Slot[];
  bufferTimeMinutes: number;
  travelManager: TravelManager;
  events: SimpleEvent[];
  plannersById: Map<string, Planner>;
  plannerLocationMap: Map<string, string | null>;
  plannerConstraintsMap?: Map<string, PlannerSchedulingConstraints>;
  excludedLeafIds: Set<string>;
  windowedCategories: Category[];
  placementCutoffDate: Date | null;
}

interface SwapCandidate {
  event: SimpleEvent;
  planner: Planner;
  locationId: string | null;
  start: Date;
  end: Date;
  durationMinutes: number;
}

function cloneSlots(slots: Slot[]): Slot[] {
  return slots.map((slot) => {
    const copy: Slot = {
      ...slot,
      start: new Date(slot.start),
      end: new Date(slot.end),
    };
    if (copy.type === "travel") {
      if (copy.consumedCategoryIds) {
        copy.consumedCategoryIds = [...copy.consumedCategoryIds];
      }
      if (copy.originalSourceStart) {
        copy.originalSourceStart = new Date(copy.originalSourceStart);
      }
      if (copy.originalSourceEnd) {
        copy.originalSourceEnd = new Date(copy.originalSourceEnd);
      }
    }
    return copy;
  });
}

function restoreSlots(slots: Slot[], snapshot: Slot[]): void {
  slots.length = 0;
  slots.push(...snapshot);
}

function totalTravelMinutes(slots: Slot[]): number {
  let total = 0;
  for (const slot of slots) {
    if (slot.type === "travel") total += slot.durationMinutes;
  }
  return total;
}

function effectiveSlotLocation(
  slot: Slot,
  side: "before" | "after",
  plannerLocationMap: Map<string, string | null>,
): string | null {
  switch (slot.type) {
    case "occupied":
      return slot.locationId ?? plannerLocationMap.get(slot.eventId) ?? null;
    case "travel":
      // Preceding a gap the user has ARRIVED (destination); following a gap
      // the user must be at the leg's origin when it departs.
      return side === "before"
        ? slot.travelToLocationId
        : slot.travelFromLocationId;
    case "category":
      return slot.currentLocationId;
    case "available":
      return side === "before"
        ? (slot.nextLocationId ?? null)
        : (slot.prevLocationId ?? null);
  }
}

/**
 * A flanking travel leg belongs to this event when it is flush against it and
 * location-matched (inbound: destination = the event's location; outbound:
 * origin = it). Removing an owned leg with the event is self-consistent even
 * when a neighbouring placement relied on it: placements sit flush, so the
 * freed region's pointers re-derive from the surviving neighbours and the
 * re-reservation recreates whatever approach leg the new tenant's envelope
 * needs. An "Anywhere" event owns no legs (flanking travel is fabric it sits
 * next to, not travel it caused); a flush leg whose locations don't relate
 * to the event at all is unrecognized geometry — the pair is rejected.
 */
function collectOwnLegs(
  slots: Slot[],
  occupiedIndex: number,
  locationId: string | null,
): { legKeys: string[] } | null {
  const occupied = slots[occupiedIndex];
  const legKeys: string[] = [];

  const before = occupiedIndex > 0 ? slots[occupiedIndex - 1] : null;
  if (
    before &&
    before.type === "travel" &&
    before.end.getTime() === occupied.start.getTime() &&
    locationId
  ) {
    if (before.travelToLocationId !== locationId) return null;
    legKeys.push(before.travelId ?? before.eventId);
  }

  const after =
    occupiedIndex < slots.length - 1 ? slots[occupiedIndex + 1] : null;
  if (
    after &&
    after.type === "travel" &&
    after.start.getTime() === occupied.end.getTime() &&
    locationId
  ) {
    if (after.travelFromLocationId !== locationId) return null;
    legKeys.push(after.travelId ?? after.eventId);
  }

  return { legKeys };
}

/**
 * Remove one placed event (occupied slot + its own flanking legs) and restore
 * the region as free time with location pointers re-derived from the
 * surviving neighbours. Returns false when the geometry is shared/unknown —
 * caller aborts the trial (snapshot restore).
 */
function unreserveEvent(
  slots: Slot[],
  eventId: string,
  locationId: string | null,
  plannerLocationMap: Map<string, string | null>,
): boolean {
  const occupiedIndex = slots.findIndex(
    (s) => s.type === "occupied" && s.eventId === eventId,
  );
  if (occupiedIndex === -1) return false;

  const legs = collectOwnLegs(slots, occupiedIndex, locationId);
  if (!legs) return false;

  const occupied = slots[occupiedIndex] as OccupiedSlot;
  const freed: AvailableSlot = {
    type: "available",
    start: occupied.start,
    end: occupied.end,
    durationMinutes: occupied.durationMinutes,
    prevLocationId: null,
    nextLocationId: null,
  };
  slots.splice(occupiedIndex, 1, freed);

  for (const key of legs.legKeys) {
    unplanTravel(slots, key);
  }

  // unplanTravel merged adjacent available slots; locate the merged freed
  // region and stamp its pointers from the surviving neighbours.
  const freedIndex = slots.findIndex(
    (s) =>
      s.type === "available" &&
      s.start.getTime() <= freed.start.getTime() &&
      s.end.getTime() >= freed.end.getTime(),
  );
  if (freedIndex === -1) return false;
  const region = slots[freedIndex] as AvailableSlot;
  const prevSlot = freedIndex > 0 ? slots[freedIndex - 1] : null;
  const nextSlot =
    freedIndex < slots.length - 1 ? slots[freedIndex + 1] : null;
  region.prevLocationId = prevSlot
    ? effectiveSlotLocation(prevSlot, "before", plannerLocationMap)
    : null;
  region.nextLocationId = nextSlot
    ? effectiveSlotLocation(nextSlot, "after", plannerLocationMap)
    : null;
  return true;
}

/**
 * Reserve a task at an exact target interval through the normal reservation
 * mutation. Travel envelopes are computed against the containing slot's
 * pointers; capacity (travel + buffers inside the slot) is pre-checked
 * strictly, and reserveSlotWithTravel does the actual splice.
 */
function reserveAtTarget(
  slots: Slot[],
  bufferTimeMinutes: number,
  travelManager: TravelManager,
  planner: Planner,
  locationId: string | null,
  start: Date,
  end: Date,
): boolean {
  const container = slots.find(
    (s): s is AvailableSlot =>
      s.type === "available" &&
      s.start.getTime() <= start.getTime() &&
      s.end.getTime() >= end.getTime(),
  );
  if (!container) return false;

  const bufferMs = bufferTimeMinutes * MS_PER_MINUTE;
  const prevLoc = container.prevLocationId ?? null;
  const nextLoc = container.nextLocationId ?? null;

  const travelBefore =
    locationId && prevLoc && prevLoc !== locationId
      ? travelManager.getTravelTime(prevLoc, locationId, start)
      : 0;
  const travelAfter =
    locationId && nextLoc && nextLoc !== locationId
      ? travelManager.getTravelTime(locationId, nextLoc, end)
      : 0;

  // Strict envelope check: leading buffer + inbound leg before the task,
  // outbound leg + trailing buffer after — all inside the containing slot.
  const needBefore = travelBefore * MS_PER_MINUTE + bufferMs;
  const needAfter = travelAfter * MS_PER_MINUTE + bufferMs;
  if (container.start.getTime() + needBefore > start.getTime()) return false;
  if (container.end.getTime() < end.getTime() + needAfter) return false;

  const result = reserveSlotWithTravel(
    slots,
    bufferTimeMinutes,
    start,
    end,
    planner.id,
    planner.plannerType,
    locationId,
    travelBefore,
    travelAfter,
    prevLoc,
    nextLoc,
  );
  return result.success;
}

function intervalSatisfiesConstraints(
  constraints: PlannerSchedulingConstraints | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!constraints) return true;
  if (constraints.placementWindowEnd) return false;
  if (constraints.earliestStart && start < constraints.earliestStart) {
    return false;
  }
  const allowed = constraints.allowedTimes;
  if (allowed.length > 0) {
    const fragments = intersectIntervalWithAllowed(start, end, allowed);
    if (
      fragments.length !== 1 ||
      fragments[0].start.getTime() !== start.getTime() ||
      fragments[0].end.getTime() !== end.getTime()
    ) {
      return false;
    }
  }
  return true;
}

function latenessMinutes(
  planner: Planner,
  end: Date,
  plannersById: Map<string, Planner>,
  deadlineCache: Map<string, Date | null>,
): number {
  const deadline = resolveInheritedDeadline(planner, plannersById, deadlineCache);
  if (!deadline) return 0;
  return Math.max(0, (end.getTime() - deadline.getTime()) / MS_PER_MINUTE);
}

export function polishPass(args: PolishPassArgs): { swaps: PolishSwap[] } {
  const {
    slots,
    bufferTimeMinutes,
    travelManager,
    events,
    plannersById,
    plannerLocationMap,
    plannerConstraintsMap,
    excludedLeafIds,
    windowedCategories,
    placementCutoffDate,
  } = args;

  const swaps: PolishSwap[] = [];
  const deadlineCache = new Map<string, Date | null>();

  const candidates: SwapCandidate[] = [];
  for (const event of events) {
    if (event.id.includes("|")) continue;
    if (excludedLeafIds.has(event.id)) continue;
    const planner = plannersById.get(event.id);
    if (!planner) continue;
    if (
      planner.plannerType === PlannerType.plan ||
      plannerHasFlexibleRecurrence(planner)
    ) {
      continue;
    }
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (placementCutoffDate && end >= placementCutoffDate) continue;
    candidates.push({
      event,
      planner,
      locationId: plannerLocationMap.get(event.id) ?? null,
      start,
      end,
      durationMinutes: Math.round(
        (end.getTime() - start.getTime()) / MS_PER_MINUTE,
      ),
    });
  }
  if (candidates.length < 2) return { swaps };

  candidates.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      (a.event.id < b.event.id ? -1 : 1),
  );

  // Category-window occurrences over the candidates' whole span; an interval
  // touching any occurrence is ineligible (the freed region could not
  // faithfully restore category interior).
  let windowPeriods: Array<{ start: Date; end: Date }> = [];
  if (windowedCategories.length > 0) {
    const rangeStart = new Date(
      candidates[0].start.getTime() - 24 * 60 * MS_PER_MINUTE,
    );
    const rangeEnd = new Date(
      candidates[candidates.length - 1].end.getTime() +
        24 * 60 * MS_PER_MINUTE,
    );
    windowPeriods = expandCategoryWindowPeriods(
      windowedCategories,
      rangeStart,
      rangeEnd,
    );
  }
  const touchesWindow = (start: Date, end: Date): boolean =>
    windowPeriods.some(
      (p) => p.start.getTime() < end.getTime() && p.end.getTime() > start.getTime(),
    );

  const pairWindowMs =
    SCHEDULING_CONFIG.POLISH_PASS_PAIR_WINDOW_DAYS * 24 * 60 * MS_PER_MINUTE;
  const consumed = new Set<string>();
  let trials = 0;

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (consumed.has(a.event.id)) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (consumed.has(a.event.id)) break;
      if (consumed.has(b.event.id)) continue;
      if (b.start.getTime() - a.start.getTime() > pairWindowMs) break;
      if (a.durationMinutes !== b.durationMinutes) continue;
      // Same effective location ⇒ a swap cannot change travel; lateness-only
      // churn is the EDF tier's job, not this pass's.
      if (a.locationId === b.locationId) continue;
      if (touchesWindow(a.start, a.end) || touchesWindow(b.start, b.end)) {
        continue;
      }
      const aConstraints = plannerConstraintsMap?.get(a.event.id);
      const bConstraints = plannerConstraintsMap?.get(b.event.id);
      if (
        !intervalSatisfiesConstraints(aConstraints, b.start, b.end) ||
        !intervalSatisfiesConstraints(bConstraints, a.start, a.end)
      ) {
        continue;
      }

      if (trials >= SCHEDULING_CONFIG.POLISH_PASS_MAX_TRIALS) {
        return { swaps };
      }
      trials++;

      const snapshot = cloneSlots(slots);
      const travelBefore = totalTravelMinutes(slots);
      const latenessBefore =
        latenessMinutes(a.planner, a.end, plannersById, deadlineCache) +
        latenessMinutes(b.planner, b.end, plannersById, deadlineCache);

      const applied =
        unreserveEvent(slots, a.event.id, a.locationId, plannerLocationMap) &&
        unreserveEvent(slots, b.event.id, b.locationId, plannerLocationMap) &&
        reserveAtTarget(
          slots,
          bufferTimeMinutes,
          travelManager,
          a.planner,
          a.locationId,
          b.start,
          b.end,
        ) &&
        reserveAtTarget(
          slots,
          bufferTimeMinutes,
          travelManager,
          b.planner,
          b.locationId,
          a.start,
          a.end,
        );

      if (!applied) {
        restoreSlots(slots, snapshot);
        continue;
      }

      const travelAfter = totalTravelMinutes(slots);
      const latenessAfter =
        latenessMinutes(a.planner, b.end, plannersById, deadlineCache) +
        latenessMinutes(b.planner, a.end, plannersById, deadlineCache);

      // Pareto acceptance (stricter than the lexicographic order the hand-off
      // suggested): travel must strictly drop with lateness no worse, or
      // lateness strictly drop with travel no worse — a travel win is never
      // allowed to push work past a deadline.
      const accept =
        (travelAfter < travelBefore && latenessAfter <= latenessBefore) ||
        (travelAfter <= travelBefore && latenessAfter < latenessBefore);
      if (!accept) {
        restoreSlots(slots, snapshot);
        continue;
      }

      const aStartIso = a.event.start;
      const aEndIso = a.event.end;
      a.event.start = b.event.start;
      a.event.end = b.event.end;
      b.event.start = aStartIso;
      b.event.end = aEndIso;
      const aStart = a.start;
      const aEnd = a.end;
      a.start = b.start;
      a.end = b.end;
      b.start = aStart;
      b.end = aEnd;

      consumed.add(a.event.id);
      consumed.add(b.event.id);
      swaps.push({ aId: a.event.id, bId: b.event.id });
      break;
    }
  }

  return { swaps };
}
