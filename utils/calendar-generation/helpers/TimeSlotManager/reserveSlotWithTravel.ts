import {
  AvailableSlot,
  CategorySlot,
  OccupiedSlot,
  Slot,
  TimeSlot,
  TravelSlot,
} from "../../models/TimeSlot";
import { EventType, PlannerType } from "@/types/prisma";
import { isTravelSlot, createTravelSlot } from "../../utils/timeSlotUtils";
import type { TravelShardSpan } from "../../utils/timeSlotUtils";
import type { SchedulerRecorder } from "../Scheduler/SchedulerRecorder";
import { SM } from "../Scheduler/schedulerMessages";
import { SCHEDULING_CONFIG } from "../../constants";
import { v4 as uuidv4 } from "uuid";

// Remove every shard belonging to a logical travel (identified by travelId)
// from a local filtered view. Returns the span's aggregate start/end so
// callers can recompute the freed-up region. Use this anywhere the
// scheduler "absorbs" or "reclaims" travel — splice(i, 1) only removes one
// shard of a multi-shard span and leaves the rest orphaned.
function removeTravelShards(
  list: (OccupiedSlot | TravelSlot)[],
  travelId: string,
): { spanStart: Date; spanEnd: Date } | null {
  let spanStart: Date | null = null;
  let spanEnd: Date | null = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s.type !== "travel") continue;
    const key = s.travelId ?? s.eventId;
    if (key !== travelId) continue;
    if (!spanEnd || s.end.getTime() > spanEnd.getTime()) spanEnd = s.end;
    if (!spanStart || s.start.getTime() < spanStart.getTime())
      spanStart = s.start;
    list.splice(i, 1);
  }
  return spanStart && spanEnd ? { spanStart, spanEnd } : null;
}

type PlaceableSlot = AvailableSlot | CategorySlot;

// Build a leftover fragment after a task carves out the middle of a placeable
// slot. Category leftovers keep their currentLocationId / categoryId so the
// dispatcher still sees the fragment as inside the category.
function makeLeftover(
  source: PlaceableSlot,
  start: Date,
  end: Date,
  prevLocationId: string | null,
  nextLocationId: string | null,
): PlaceableSlot {
  const durationMinutes = Math.floor(
    (end.getTime() - start.getTime()) / 60000,
  );
  if (source.type === "category") {
    return {
      start,
      end,
      durationMinutes,
      type: "category",
      currentLocationId: source.currentLocationId,
      prevLocationId,
      nextLocationId,
      categoryId: source.categoryId,
      isStrictCategory: source.isStrictCategory,
      trespassingStart:
        start.getTime() === source.start.getTime()
          ? source.trespassingStart
          : undefined,
      trespassingEnd:
        end.getTime() === source.end.getTime()
          ? source.trespassingEnd
          : undefined,
      isFinal:
        end.getTime() === source.end.getTime() ? source.isFinal : undefined,
    };
  }
  return {
    start,
    end,
    durationMinutes,
    type: "available",
    prevLocationId,
    nextLocationId,
  };
}

export function reserveSlotWithTravel(
  slots: Slot[],
  bufferTimeMinutes: number,
  start: Date,
  end: Date,
  eventId: string,
  plannerType: PlannerType,
  taskLocationId: string | null,
  travelBefore: number,
  travelAfter: number,
  prevLocationId: string | null,
  nextLocationId: string | null,
  reusableTravelStart?: Date | null,
  absorbableTravel?: TravelShardSpan | null,
  reclaimPrecedingGapTravel?: TravelShardSpan | null,
  recorder?: SchedulerRecorder | null,
  removableFollowingInbound?: TravelShardSpan | null,
  reroutableFollowingOutbound?: TravelShardSpan | null,
): { success: boolean } {
  // Operate on local typed views of the unified slots array. Items are shared
  // by reference, so in-place mutations propagate; only structural changes
  // (splice/push) need a merge step at the end.
  const availableSlots: PlaceableSlot[] = slots.filter(
    (s): s is PlaceableSlot => s.type === "available" || s.type === "category",
  );
  const occupiedSlots: (OccupiedSlot | TravelSlot)[] = slots.filter(
    (s): s is OccupiedSlot | TravelSlot =>
      s.type === "occupied" || s.type === "travel",
  );

  const bufferMs = bufferTimeMinutes * 60000;

  // Helper: extend the availSlot that abuts a removed travel back to the
  // travel's start. The availSlot is identified by exact-start match against
  // the travel's end (slots are placed flush). Guards against producing a
  // malformed slot if the math somehow inverts the bounds.
  function extendAvailSlotBackOverRemovedTravel(
    removedSpanStart: Date,
    removedSpanEnd: Date,
    newPrevLocationId: string | null,
  ): boolean {
    for (const availSlot of availableSlots) {
      if (availSlot.start.getTime() !== removedSpanEnd.getTime()) continue;
      if (removedSpanStart.getTime() >= availSlot.end.getTime()) return false;
      availSlot.start = removedSpanStart;
      availSlot.durationMinutes = Math.floor(
        (availSlot.end.getTime() - availSlot.start.getTime()) / 60000,
      );
      if (newPrevLocationId !== null) {
        availSlot.prevLocationId = newPrevLocationId;
      }
      return true;
    }
    return false;
  }

  if (absorbableTravel && taskLocationId) {
    // We already know the exact travel to absorb from selectBestSlot — no
    // heuristic re-search. Remove every shard by travelId, then extend the
    // abutting availSlot back over the freed region.
    const removed = removeTravelShards(
      occupiedSlots,
      absorbableTravel.travelId,
    );
    if (removed) {
      const ok = extendAvailSlotBackOverRemovedTravel(
        removed.spanStart,
        removed.spanEnd,
        taskLocationId,
      );
      if (ok) {
        recorder?.action(
          SM.reserveSlotWithTravel.absorbPrevTravelAfter(
            absorbableTravel.travelId,
            recorder.fmtDate(removed.spanStart),
            recorder.fmtDate(removed.spanEnd),
          ),
        );
      }
    }
  }

  if (reclaimPrecedingGapTravel) {
    const gapSpan = reclaimPrecedingGapTravel;
    const removed = removeTravelShards(occupiedSlots, gapSpan.travelId);
    if (removed) {
      recorder?.action(
        SM.reserveSlotWithTravel.reclaimGapTravel(
          gapSpan.travelId,
          recorder.fmtDate(removed.spanStart),
          recorder.fmtDate(removed.spanEnd),
        ),
      );
      extendAvailSlotBackOverRemovedTravel(
        removed.spanStart,
        removed.spanEnd,
        gapSpan.travelFromLocationId ?? null,
      );
    }
  }

  // Reroute a following outbound leg: the task's travel-after goes direct to
  // the leg's destination (nextLocationId already carries it), so the old leg
  // departing from the slot's stale boundary location is removed and the
  // abutting available slot extends FORWARD over the freed span — the tail
  // mirror of extendAvailSlotBackOverRemovedTravel. The extension target is
  // located BEFORE removal so a miss (unexpected fabric shape) leaves the leg
  // in place instead of tearing a hole in the fabric.
  if (reroutableFollowingOutbound) {
    const span = reroutableFollowingOutbound;
    const target = availableSlots.find(
      (s) =>
        s.type !== "category" &&
        s.end.getTime() === span.travelStart.getTime(),
    );
    if (target) {
      const removed = removeTravelShards(occupiedSlots, span.travelId);
      if (removed && removed.spanEnd.getTime() > target.end.getTime()) {
        target.end = removed.spanEnd;
        target.durationMinutes = Math.floor(
          (target.end.getTime() - target.start.getTime()) / 60000,
        );
        if (span.travelToLocationId) {
          target.nextLocationId = span.travelToLocationId;
        }
        recorder?.action(
          SM.reserveSlotWithTravel.reroutedFollowingOutbound(
            span.travelId,
            recorder.fmtDate(removed.spanStart),
            recorder.fmtDate(removed.spanEnd),
          ),
        );
      }
    }
  }

  // Travel is flush with its owning task — no buffer between them. The
  // single buffer that separates this unit from the next placement lives
  // at the tail of the reserved footprint.
  const travelBeforeEnd = start;
  const travelBeforeStart =
    travelBefore > 0 ? new Date(start.getTime() - travelBefore * 60000) : start;

  const fullStart = travelBefore > 0 ? travelBeforeStart : start;
  const taskReserveEnd = new Date(
    end.getTime() + travelAfter * 60000 + bufferMs,
  );

  const slotIndex = availableSlots.findIndex(
    (slot) =>
      slot.start.getTime() <= fullStart.getTime() &&
      slot.end.getTime() >= taskReserveEnd.getTime(),
  );

  if (slotIndex === -1) {
    recorder?.action(SM.reserveSlotWithTravel.splitSlotFailed);
    return { success: false };
  }

  const slot = availableSlots[slotIndex];
  const newSlots: TimeSlot[] = [];

  let travelAfterEnd: Date | null = null;
  let travelAfterStart: Date | null = null;

  if (travelAfter > 0 && nextLocationId) {
    travelAfterStart = end;
    travelAfterEnd = new Date(end.getTime() + travelAfter * 60000);
  }

  if (fullStart.getTime() > slot.start.getTime()) {
    newSlots.push(
      makeLeftover(
        slot,
        slot.start,
        fullStart,
        slot.prevLocationId ?? null,
        taskLocationId ?? slot.nextLocationId ?? null,
      ),
    );
    if (recorder) {
      recorder.action(
        SM.reserveSlotWithTravel.placedHeadLeftover(
          recorder.fmtDate(slot.start),
          recorder.fmtDate(fullStart),
        ),
      );
    }
  }

  let removedTravelAfterEnd: Date | null = null;

  if (travelBefore > 0 && prevLocationId && taskLocationId) {
    // Pre-existing travels to taskLocationId that end exactly at the task's
    // start are stale (static-pass preliminaries or prior-task travel-afters
    // pointing at this destination). Collect their travelIds by exact-position
    // match — slots are placed flush, so anything legitimately adjacent ends
    // exactly here. Multi-shard handled naturally because only the last shard
    // ends at task.start, and removeTravelShards then removes all shards by ID.
    const taskStartTime = start.getTime();
    const inboundIdsToRemove = new Set<string>();
    for (const occ of occupiedSlots) {
      if (!isTravelSlot(occ)) continue;
      if (occ.travelToLocationId !== taskLocationId) continue;
      if (occ.end.getTime() !== taskStartTime) continue;
      const travelId = occ.travelId ?? occ.eventId;
      if (travelId) inboundIdsToRemove.add(travelId);
    }
    for (const travelId of inboundIdsToRemove) {
      const removed = removeTravelShards(occupiedSlots, travelId);
      if (!removed) continue;
      if (
        !removedTravelAfterEnd ||
        removed.spanEnd.getTime() > removedTravelAfterEnd.getTime()
      ) {
        removedTravelAfterEnd = removed.spanEnd;
      }
      recorder?.action(
        SM.reserveSlotWithTravel.removedInboundTravel(
          travelId,
          recorder.fmtDate(removed.spanStart),
          recorder.fmtDate(removed.spanEnd),
        ),
      );
    }

    newSlots.push(
      createTravelSlot(
        travelBeforeStart,
        travelBeforeEnd,
        prevLocationId,
        taskLocationId,
        "inbound",
        uuidv4(),
      ),
    );
    if (recorder) {
      recorder.action(
        SM.reserveSlotWithTravel.placedInboundTravel(
          recorder.locName(prevLocationId),
          recorder.locName(taskLocationId),
          recorder.fmtDate(travelBeforeStart),
          recorder.fmtDate(travelBeforeEnd),
        ),
      );
    }
  }

  newSlots.push({
    start,
    end,
    durationMinutes: Math.floor((end.getTime() - start.getTime()) / 60000),
    type: "occupied",
    eventId,
    plannerType,
    eventType: EventType.planner,
  });
  if (recorder) {
    recorder.action(
      SM.reserveSlotWithTravel.placedOccupied(
        recorder.fmtDate(start),
        recorder.fmtDate(end),
      ),
    );
  }

  let reclaimedTravelEnd: Date | null = null;
  if (
    travelAfter === 0 &&
    taskLocationId &&
    nextLocationId &&
    taskLocationId === nextLocationId
  ) {
    // Removes a preliminary inbound travel that becomes redundant when the
    // task is already at the destination. Guards: (1) the travel's first
    // shard must start at slot.end + buffer within ADJACENT_TRAVEL_TOLERANCE
    // — without this, a 3h-wide search grabs unrelated travels (e.g. the
    // varmdo→gamla-stan return between Fun and a later Work category) and
    // the freed leftover ends up overlapping intervening category slots.
    // (2) skip self-travels (from===to) — those encode static-pass category
    // trespass / no-op transit and shouldn't be treated as reclaimable.
    const expectedTravelStartTime = slot.end.getTime() + bufferMs;
    const adjacencyMs =
      bufferMs + SCHEDULING_CONFIG.ADJACENT_TRAVEL_TOLERANCE_MS;

    const seenTravelIds = new Set<string>();
    for (const occ of occupiedSlots) {
      if (!isTravelSlot(occ)) continue;
      if (occ.travelToLocationId !== nextLocationId) continue;
      if (occ.travelType !== "preliminary") continue;
      if (occ.travelFromLocationId === occ.travelToLocationId) continue;
      const travelId = occ.travelId ?? occ.eventId;
      if (!travelId || seenTravelIds.has(travelId)) continue;
      seenTravelIds.add(travelId);

      if (
        Math.abs(occ.start.getTime() - expectedTravelStartTime) <= adjacencyMs
      ) {
        const removed = removeTravelShards(occupiedSlots, travelId);
        if (removed) {
          reclaimedTravelEnd = removed.spanEnd;
          recorder?.action(
            SM.reserveSlotWithTravel.reclaimedTrailingTravel(
              travelId,
              recorder.fmtDate(removed.spanStart),
              recorder.fmtDate(removed.spanEnd),
            ),
          );
          break;
        }
      }
    }
  }

  // Forward reclaim: selectBestSlot found an inbound to THIS task's location
  // abutting the slot end (the travel-before of a following same-location
  // placement whose origin leaked in as the slot's phantom nextLocationId).
  // The task already delivers the user to the shared location, so that leg is
  // redundant — remove it and let the free tail extend over it, carrying the
  // leg's true DESTINATION (our location) as the tail's nextLocation so the
  // phantom doesn't resurface for the next placement here.
  let removedFollowingInboundEnd: Date | null = null;
  let removedFollowingInboundDest: string | null = null;
  if (removableFollowingInbound) {
    const removed = removeTravelShards(
      occupiedSlots,
      removableFollowingInbound.travelId,
    );
    if (removed) {
      removedFollowingInboundEnd = removed.spanEnd;
      removedFollowingInboundDest =
        removableFollowingInbound.travelToLocationId ?? null;
      recorder?.action(
        SM.reserveSlotWithTravel.reclaimedTrailingTravel(
          removableFollowingInbound.travelId,
          recorder.fmtDate(removed.spanStart),
          recorder.fmtDate(removed.spanEnd),
        ),
      );
    }
  }

  // Buffer is enforced per-placement relative to slot boundaries (leading
  // via offsetToTaskStart, trailing via taskReserveEnd). The leftover-tail
  // starts flush with the unit's end; the next placement landing here will
  // own its own leading buffer, which provides exactly one buffer of
  // separation from this unit.
  const unitEnd = travelAfterEnd ?? end;
  const freeSlotStart = unitEnd;

  let freeSlotEnd: Date;
  if (reclaimedTravelEnd) {
    freeSlotEnd = reclaimedTravelEnd;
  } else if (removedFollowingInboundEnd) {
    freeSlotEnd = removedFollowingInboundEnd;
  } else if (removedTravelAfterEnd) {
    freeSlotEnd = removedTravelAfterEnd;
  } else if (reusableTravelStart) {
    freeSlotEnd = reusableTravelStart;
  } else {
    freeSlotEnd = slot.end;
  }

  const freeSlotPrevLocation: string | null = travelAfterEnd
    ? (nextLocationId ?? taskLocationId ?? slot.prevLocationId ?? null)
    : (taskLocationId ?? slot.prevLocationId ?? null);

  if (freeSlotEnd.getTime() > freeSlotStart.getTime()) {
    newSlots.push(
      makeLeftover(
        slot,
        freeSlotStart,
        freeSlotEnd,
        freeSlotPrevLocation,
        removedFollowingInboundDest ?? slot.nextLocationId ?? null,
      ),
    );
    if (recorder) {
      recorder.action(
        SM.reserveSlotWithTravel.placedFreeLeftover(
          recorder.fmtDate(freeSlotStart),
          recorder.fmtDate(freeSlotEnd),
          recorder.locName(freeSlotPrevLocation),
        ),
      );
    }
  }

  if (travelAfter > 0 && nextLocationId && travelAfterStart) {
    // Mirror of the inbound cleanup: pre-existing travels to nextLocationId
    // that end exactly at the matched slot's end are stale (preliminaries
    // pointing at whatever's right after our slot). Collect by travelId via
    // exact-position match; removeTravelShards handles multi-shard cleanup.
    const slotEndTime = slot.end.getTime();
    const outboundIdsToRemove = new Set<string>();
    for (const occ of occupiedSlots) {
      if (!isTravelSlot(occ)) continue;
      if (occ.travelToLocationId !== nextLocationId) continue;
      if (occ.end.getTime() !== slotEndTime) continue;
      const travelId = occ.travelId ?? occ.eventId;
      if (travelId) outboundIdsToRemove.add(travelId);
    }
    for (const travelId of outboundIdsToRemove) {
      const removed = removeTravelShards(occupiedSlots, travelId);
      if (!removed) continue;
      recorder?.action(
        SM.reserveSlotWithTravel.removedOutboundTravel(
          travelId,
          recorder.fmtDate(removed.spanStart),
          recorder.fmtDate(removed.spanEnd),
        ),
      );
    }
  }

  if (
    travelAfter > 0 &&
    travelAfterStart &&
    travelAfterEnd &&
    taskLocationId &&
    nextLocationId
  ) {
    newSlots.push(
      createTravelSlot(
        travelAfterStart,
        travelAfterEnd,
        taskLocationId,
        nextLocationId,
        "outbound",
        uuidv4(),
      ),
    );
    if (recorder) {
      recorder.action(
        SM.reserveSlotWithTravel.placedOutboundTravel(
          recorder.locName(taskLocationId),
          recorder.locName(nextLocationId),
          recorder.fmtDate(travelAfterStart),
          recorder.fmtDate(travelAfterEnd),
        ),
      );
    }
  }

  availableSlots.splice(
    slotIndex,
    1,
    ...newSlots.filter(
      (s): s is PlaceableSlot => s.type === "available" || s.type === "category",
    ),
  );
  occupiedSlots.push(
    ...newSlots.filter(
      (s): s is OccupiedSlot | TravelSlot =>
        s.type === "occupied" || s.type === "travel",
    ),
  );

  // Merge local views back into the unified slots array.
  slots.length = 0;
  const merged: Slot[] = [];
  merged.push(...availableSlots, ...occupiedSlots);
  merged.sort((a, b) => a.start.getTime() - b.start.getTime());
  slots.push(...merged);

  return { success: true };
}
