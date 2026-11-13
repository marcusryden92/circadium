import type {
  AvailableSlot,
  CategorySlot,
  PlaceableSlot,
  TimeSlot,
  TravelSlot,
} from "../models/TimeSlot";
import { PlannerType, EventType } from "@/types/prisma";

export function getDurationMinutes(slot: TimeSlot): number {
  return Math.floor((slot.end.getTime() - slot.start.getTime()) / (1000 * 60));
}

export function canFitDuration(
  slot: TimeSlot,
  requiredMinutes: number,
): boolean {
  return (
    (slot.type === "available" || slot.type === "category") &&
    slot.durationMinutes >= requiredMinutes
  );
}

export function doSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
  return slot1.start < slot2.end && slot2.start < slot1.end;
}

// First index whose slot.start >= timeMs, relying on the array's sorted-by-
// start invariant. Lets time-window lookups skip straight to the relevant
// region instead of scanning from index 0.
export function lowerBoundSlotIndexByStart(
  slots: TimeSlot[],
  timeMs: number,
): number {
  let lo = 0;
  let hi = slots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (slots[mid].start.getTime() < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function splitSlot(
  slot: TimeSlot,
  splitTime: Date,
): [TimeSlot | null, TimeSlot | null] {
  if (splitTime <= slot.start || splitTime >= slot.end) {
    return [slot, null];
  }

  const beforeDuration = Math.floor(
    (splitTime.getTime() - slot.start.getTime()) / (1000 * 60),
  );
  const afterDuration = Math.floor(
    (slot.end.getTime() - splitTime.getTime()) / (1000 * 60),
  );

  if (slot.type === "available") {
    return [
      {
        start: slot.start,
        end: splitTime,
        durationMinutes: beforeDuration,
        type: "available",
        prevLocationId: slot.prevLocationId,
        nextLocationId: slot.nextLocationId,
      },
      {
        start: splitTime,
        end: slot.end,
        durationMinutes: afterDuration,
        type: "available",
        prevLocationId: slot.prevLocationId,
        nextLocationId: slot.nextLocationId,
      },
    ];
  }

  if (slot.type === "category") {
    return [
      {
        start: slot.start,
        end: splitTime,
        durationMinutes: beforeDuration,
        type: "category",
        currentLocationId: slot.currentLocationId,
        prevLocationId: slot.prevLocationId,
        nextLocationId: slot.nextLocationId,
        categoryId: slot.categoryId,
        isStrictCategory: slot.isStrictCategory,
        trespassingStart: slot.trespassingStart,
      },
      {
        start: splitTime,
        end: slot.end,
        durationMinutes: afterDuration,
        type: "category",
        currentLocationId: slot.currentLocationId,
        prevLocationId: slot.prevLocationId,
        nextLocationId: slot.nextLocationId,
        categoryId: slot.categoryId,
        isStrictCategory: slot.isStrictCategory,
        trespassingEnd: slot.trespassingEnd,
        isFinal: slot.isFinal,
      },
    ];
  }

  if (slot.type === "travel") {
    return [
      {
        start: slot.start,
        end: splitTime,
        durationMinutes: beforeDuration,
        type: "travel",
        eventId: slot.eventId,
        eventType: EventType.travel,
        travelFromLocationId: slot.travelFromLocationId,
        travelToLocationId: slot.travelToLocationId,
        travelType: slot.travelType,
        insufficientTravel: slot.insufficientTravel,
        requiredTravelMinutes: slot.requiredTravelMinutes,
        categoryId: slot.categoryId,
        isStrictCategory: slot.isStrictCategory,
      },
      {
        start: splitTime,
        end: slot.end,
        durationMinutes: afterDuration,
        type: "travel",
        eventId: slot.eventId,
        eventType: EventType.travel,
        travelFromLocationId: slot.travelFromLocationId,
        travelToLocationId: slot.travelToLocationId,
        travelType: slot.travelType,
        insufficientTravel: slot.insufficientTravel,
        requiredTravelMinutes: slot.requiredTravelMinutes,
        categoryId: slot.categoryId,
        isStrictCategory: slot.isStrictCategory,
      },
    ];
  }

  return [
    {
      start: slot.start,
      end: splitTime,
      durationMinutes: beforeDuration,
      type: "occupied",
      eventId: slot.eventId,
      eventType: slot.eventType,
      plannerType: slot.plannerType,
    },
    {
      start: splitTime,
      end: slot.end,
      durationMinutes: afterDuration,
      type: "occupied",
      eventId: slot.eventId,
      eventType: slot.eventType,
      plannerType: slot.plannerType,
    },
  ];
}

// Slice an occupied event out of a placeable slot, preserving the slot's
// type (available vs. category) on the surrounding leftovers. Category
// leftovers keep currentLocationId / categoryId so the dispatcher still sees
// them as inside the category.
export function occupySlot(
  slot: PlaceableSlot,
  start: Date,
  end: Date,
  eventId: string,
  eventType: Exclude<EventType, "travel" | "category">,
  plannerType: PlannerType,
  locationId?: string | null,
): TimeSlot[] {
  const result: TimeSlot[] = [];

  const afterSlotPrevLocation = locationId ?? slot.prevLocationId ?? null;

  if (start > slot.start) {
    result.push(
      makePlaceableLeftover(
        slot,
        slot.start,
        start,
        slot.prevLocationId ?? null,
        locationId ?? null,
      ),
    );
  }

  result.push({
    start,
    end,
    durationMinutes: Math.floor(
      (end.getTime() - start.getTime()) / (1000 * 60),
    ),
    type: "occupied",
    eventId,
    eventType,
    plannerType,
  });

  if (end < slot.end) {
    result.push(
      makePlaceableLeftover(
        slot,
        end,
        slot.end,
        afterSlotPrevLocation,
        slot.nextLocationId ?? null,
      ),
    );
  }

  return result;
}

function makePlaceableLeftover(
  source: PlaceableSlot,
  start: Date,
  end: Date,
  prevLocationId: string | null,
  nextLocationId: string | null,
): AvailableSlot | CategorySlot {
  const durationMinutes = Math.floor(
    (end.getTime() - start.getTime()) / (1000 * 60),
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
      // Boundary flags only carry over to the fragment that still touches
      // the original boundary.
      trespassingStart:
        start.getTime() === source.start.getTime()
          ? source.trespassingStart
          : undefined,
      trespassingEnd:
        end.getTime() === source.end.getTime()
          ? source.trespassingEnd
          : undefined,
      // isFinal applies to whichever fragment still ends at the original
      // slot's end — that's the "tail" piece of a slot at the array's end.
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

export function createTravelSlot(
  start: Date,
  end: Date,
  fromLocationId: string | null,
  toLocationId: string | null,
  travelType: "preliminary" | "inbound" | "outbound",
  eventId: string,
  options?: {
    insufficientTravel?: boolean;
    requiredTravelMinutes?: number;
    overconstrained?: boolean;
    categoryId?: string | null;
    isStrictCategory?: boolean;
  },
): TravelSlot {
  return {
    start,
    end,
    durationMinutes: Math.floor(
      (end.getTime() - start.getTime()) / (1000 * 60),
    ),
    type: "travel",
    eventId,
    eventType: EventType.travel,
    travelType,
    travelFromLocationId: fromLocationId,
    travelToLocationId: toLocationId,
    insufficientTravel: options?.insufficientTravel ?? false,
    requiredTravelMinutes: options?.requiredTravelMinutes ?? 0,
    overconstrained: options?.overconstrained,
    categoryId: options?.categoryId,
    isStrictCategory: options?.isStrictCategory,
  };
}

// ---------------------------------------------------------------------------
// Shard model
//
// A single logical travel can consume time from multiple source slots
// (e.g. a bleed-across-prev-current-next eats portions of three sources).
// Instead of fusing those eaten regions into a single Travel slot that
// loses the underlying identity, we produce N shards — one per source
// piece — that share a travelId and render as one travel block
// downstream. Each shard carries the originating source's identity so
// unplanning can restore the eaten fragments.
// ---------------------------------------------------------------------------

export type ShardSource =
  | {
      type: "available";
      start: Date;
      end: Date;
      originalSourceStart: Date;
      originalSourceEnd: Date;
      originalPrevLocationId: string | null;
      originalNextLocationId: string | null;
    }
  | {
      type: "category";
      start: Date;
      end: Date;
      originalSourceStart: Date;
      originalSourceEnd: Date;
      originalCategoryId: string;
      originalLocationId: string | null;
      originalIsStrictCategory: boolean;
    };

export function createTravelShards(
  sources: ShardSource[],
  travelId: string,
  fromLocationId: string | null,
  toLocationId: string | null,
  travelType: "preliminary" | "inbound" | "outbound",
  options?: {
    insufficientTravel?: boolean;
    requiredTravelMinutes?: number;
    overconstrained?: boolean;
    categoryId?: string | null;
    isStrictCategory?: boolean;
  },
): TravelSlot[] {
  return sources.map((src) => {
    const base: TravelSlot = {
      start: src.start,
      end: src.end,
      durationMinutes: Math.floor(
        (src.end.getTime() - src.start.getTime()) / (1000 * 60),
      ),
      type: "travel",
      eventId: travelId,
      eventType: EventType.travel,
      travelType,
      travelFromLocationId: fromLocationId,
      travelToLocationId: toLocationId,
      insufficientTravel: options?.insufficientTravel ?? false,
      requiredTravelMinutes: options?.requiredTravelMinutes ?? 0,
      overconstrained: options?.overconstrained,
      categoryId: options?.categoryId,
      isStrictCategory: options?.isStrictCategory,
      travelId,
      originalType: src.type,
      originalSourceStart: src.originalSourceStart,
      originalSourceEnd: src.originalSourceEnd,
    };
    if (src.type === "category") {
      base.originalCategoryId = src.originalCategoryId;
      base.originalLocationId = src.originalLocationId;
      base.originalIsStrictCategory = src.originalIsStrictCategory;
    } else {
      base.originalPrevLocationId = src.originalPrevLocationId;
      base.originalNextLocationId = src.originalNextLocationId;
    }
    return base;
  });
}

// Build a ShardSource for an available slot fragment that this travel will
// cover. originalSource* default to the fragment's own boundaries — caller
// passes the full original slot's boundaries when the fragment is a piece of
// a larger surviving source.
export function shardSourceFromAvailable(
  source: AvailableSlot,
  pieceStart: Date,
  pieceEnd: Date,
): ShardSource {
  return {
    type: "available",
    start: pieceStart,
    end: pieceEnd,
    originalSourceStart: source.start,
    originalSourceEnd: source.end,
    originalPrevLocationId: source.prevLocationId ?? null,
    originalNextLocationId: source.nextLocationId ?? null,
  };
}

export function shardSourceFromCategory(
  source: CategorySlot,
  pieceStart: Date,
  pieceEnd: Date,
): ShardSource {
  return {
    type: "category",
    start: pieceStart,
    end: pieceEnd,
    originalSourceStart: source.start,
    originalSourceEnd: source.end,
    originalCategoryId: source.categoryId,
    originalLocationId: source.currentLocationId,
    originalIsStrictCategory: source.isStrictCategory,
  };
}

// Build a ShardSource list from a region of absorbed slots, intersected with
// the new travel's [start, end] geometry. Each absorbed Available/Category
// contributes a fresh source; each absorbed Travel inherits its own source
// info so chained absorbs preserve the original underlying identity.
//
// Slices whose intersection with [travelStart, travelEnd] is empty are
// skipped — the new travel doesn't cover them and they shouldn't appear in
// its source list.
export function collectShardSources(
  absorbed: TimeSlot[],
  travelStart: Date,
  travelEnd: Date,
): ShardSource[] {
  const sources: ShardSource[] = [];
  for (const slot of absorbed) {
    const pieceStartMs = Math.max(
      slot.start.getTime(),
      travelStart.getTime(),
    );
    const pieceEndMs = Math.min(slot.end.getTime(), travelEnd.getTime());
    if (pieceStartMs >= pieceEndMs) continue;
    const pieceStart = new Date(pieceStartMs);
    const pieceEnd = new Date(pieceEndMs);

    if (slot.type === "available") {
      sources.push(shardSourceFromAvailable(slot, pieceStart, pieceEnd));
    } else if (slot.type === "category") {
      sources.push(shardSourceFromCategory(slot, pieceStart, pieceEnd));
    } else if (slot.type === "travel") {
      // Inherit source from the existing shard so re-absorbs preserve the
      // underlying Available/Category identity.
      if (slot.originalType === "available") {
        sources.push({
          type: "available",
          start: pieceStart,
          end: pieceEnd,
          originalSourceStart: slot.originalSourceStart ?? slot.start,
          originalSourceEnd: slot.originalSourceEnd ?? slot.end,
          originalPrevLocationId: slot.originalPrevLocationId ?? null,
          originalNextLocationId: slot.originalNextLocationId ?? null,
        });
      } else if (slot.originalType === "category" && slot.originalCategoryId) {
        sources.push({
          type: "category",
          start: pieceStart,
          end: pieceEnd,
          originalSourceStart: slot.originalSourceStart ?? slot.start,
          originalSourceEnd: slot.originalSourceEnd ?? slot.end,
          originalCategoryId: slot.originalCategoryId,
          originalLocationId: slot.originalLocationId ?? null,
          originalIsStrictCategory: slot.originalIsStrictCategory ?? false,
        });
      }
      // Legacy travel with no shard info contributes no source — geometry
      // is preserved but the underlying identity is lost (best-effort).
    }
    // Occupied isn't absorbable and is filtered out implicitly.
  }
  return sources;
}

export type TravelShardSpan = {
  travelId: string;
  startIdx: number;
  endIdx: number;          // inclusive
  shards: TravelSlot[];
  // Aggregate geometry for the whole logical travel.
  travelStart: Date;
  travelEnd: Date;
  travelFromLocationId: string | null;
  travelToLocationId: string | null;
};

// Remove every shard belonging to a travel from the slot array and restore
// the source fragments those shards consumed. Returns true if anything was
// unplanned. The restoration uses each shard's recorded originalType +
// identity to reconstruct an Available or Category fragment at the shard's
// current geometry; adjacent same-source fragments get merged afterwards so
// the array shape matches what it would have been if the travel were never
// placed.
//
// Caveats:
//   - For chained absorbs, each shard already inherits its original-source
//     identity (via collectShardSources), so unplan restores back to the
//     deepest underlying source.
//   - Trespass markers and isFinal flags on neighbouring survivors are NOT
//     re-derived here; that's the caller's job if needed.
export function unplanTravel(slots: TimeSlot[], travelId: string): boolean {
  let removed = false;
  for (let idx = slots.length - 1; idx >= 0; idx--) {
    const slot = slots[idx];
    if (slot.type !== "travel") continue;
    if ((slot.travelId ?? slot.eventId) !== travelId) continue;

    const restored = restoreShardSource(slot);
    if (restored) {
      slots.splice(idx, 1, restored);
    } else {
      slots.splice(idx, 1);
    }
    removed = true;
  }
  if (removed) mergeAdjacentSiblings(slots);
  return removed;
}

/**
 * Restore the portion of an absorbed slot region back to the original
 * character of each absorbed slot, clipped to the [start, end] range.
 *
 * Used by cascades that place a shorter-than-region travel: the head and/or
 * tail outside the new travel's geometry get reconstructed from their
 * sources rather than collapsed into generic free time.
 *
 * Sources:
 *   - Available slot in the absorb → Available fragment.
 *   - Category slot in the absorb → Category fragment (preserves categoryId,
 *     currentLocationId, isStrictCategory).
 *   - Travel shard in the absorb → unpacks via originalType/originalSource*
 *     metadata to the underlying Available or Category fragment.
 *
 * The fragments preserve their original prev/next pointers. Callers wiring
 * the fragments into the slot array may need to override the outermost
 * fragment's prev or next so the boundary with the new travel makes sense
 * (typically setting head.last.next = travel.from, tail.first.prev =
 * travel.to).
 */
export function restoreAbsorbedRange(
  absorbed: TimeSlot[],
  start: Date,
  end: Date,
): (AvailableSlot | CategorySlot)[] {
  const out: (AvailableSlot | CategorySlot)[] = [];
  const startMs = start.getTime();
  const endMs = end.getTime();
  for (const slot of absorbed) {
    const pieceStartMs = Math.max(slot.start.getTime(), startMs);
    const pieceEndMs = Math.min(slot.end.getTime(), endMs);
    if (pieceStartMs >= pieceEndMs) continue;
    const pieceStart = new Date(pieceStartMs);
    const pieceEnd = new Date(pieceEndMs);
    const fragment = buildRestoredFragment(slot, pieceStart, pieceEnd);
    if (fragment) out.push(fragment);
  }
  return out;
}

function buildRestoredFragment(
  slot: TimeSlot,
  start: Date,
  end: Date,
): AvailableSlot | CategorySlot | null {
  const duration = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (duration <= 0) return null;
  if (slot.type === "available") {
    return {
      type: "available",
      start,
      end,
      durationMinutes: duration,
      prevLocationId: slot.prevLocationId ?? null,
      nextLocationId: slot.nextLocationId ?? null,
    };
  }
  if (slot.type === "category") {
    return {
      ...slot,
      start,
      end,
      durationMinutes: duration,
    };
  }
  if (slot.type === "travel") {
    if (slot.originalType === "available") {
      return {
        type: "available",
        start,
        end,
        durationMinutes: duration,
        prevLocationId: slot.originalPrevLocationId ?? null,
        nextLocationId: slot.originalNextLocationId ?? null,
      };
    }
    if (slot.originalType === "category" && slot.originalCategoryId) {
      return {
        type: "category",
        start,
        end,
        durationMinutes: duration,
        currentLocationId: slot.originalLocationId ?? null,
        prevLocationId: slot.originalLocationId ?? null,
        nextLocationId: slot.originalLocationId ?? null,
        categoryId: slot.originalCategoryId,
        isStrictCategory: slot.originalIsStrictCategory ?? false,
      };
    }
    // Legacy shard with no source metadata — best-effort reclaim to keep
    // the timeline contiguous (no gaps in slots[]). The location pointers
    // come from the travel's from/to which is a reasonable approximation.
    if (slot.categoryId) {
      return {
        type: "category",
        start,
        end,
        durationMinutes: duration,
        currentLocationId: null,
        prevLocationId: slot.travelFromLocationId,
        nextLocationId: slot.travelToLocationId,
        categoryId: slot.categoryId,
        isStrictCategory: slot.isStrictCategory ?? false,
      };
    }
    return {
      type: "available",
      start,
      end,
      durationMinutes: duration,
      prevLocationId: slot.travelFromLocationId,
      nextLocationId: slot.travelToLocationId,
    };
  }
  return null;
}

function restoreShardSource(
  shard: TravelSlot,
): AvailableSlot | CategorySlot | null {
  if (shard.originalType === "available") {
    return {
      type: "available",
      start: shard.start,
      end: shard.end,
      durationMinutes: shard.durationMinutes,
      prevLocationId: shard.originalPrevLocationId ?? null,
      nextLocationId: shard.originalNextLocationId ?? null,
    };
  }
  if (shard.originalType === "category" && shard.originalCategoryId) {
    return {
      type: "category",
      start: shard.start,
      end: shard.end,
      durationMinutes: shard.durationMinutes,
      currentLocationId: shard.originalLocationId ?? null,
      prevLocationId: shard.originalLocationId ?? null,
      nextLocationId: shard.originalLocationId ?? null,
      categoryId: shard.originalCategoryId,
      isStrictCategory: shard.originalIsStrictCategory ?? false,
    };
  }
  // Legacy shard with no shard fields — best-effort: reclaim using existing
  // helper (was-category if categoryId present, else available).
  return reclaimTravelSlot(shard);
}

// Merge contiguous Available or Category fragments that share identity into
// one slot. Two Available fragments merge when their boundaries touch.
// Two Category fragments merge when boundaries touch AND categoryIds match.
function mergeAdjacentSiblings(slots: TimeSlot[]): void {
  let i = 0;
  while (i < slots.length - 1) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a.end.getTime() !== b.start.getTime()) {
      i++;
      continue;
    }
    if (a.type === "available" && b.type === "available") {
      slots.splice(i, 2, {
        type: "available",
        start: a.start,
        end: b.end,
        durationMinutes: Math.floor(
          (b.end.getTime() - a.start.getTime()) / 60000,
        ),
        prevLocationId: a.prevLocationId,
        nextLocationId: b.nextLocationId,
      });
      continue;
    }
    if (
      a.type === "category" &&
      b.type === "category" &&
      a.categoryId === b.categoryId
    ) {
      slots.splice(i, 2, {
        ...a,
        end: b.end,
        durationMinutes: Math.floor(
          (b.end.getTime() - a.start.getTime()) / 60000,
        ),
        nextLocationId: b.nextLocationId,
      });
      continue;
    }
    i++;
  }
}

// Locate the contiguous run of travel shards that contains slots[idx]. Walks
// outward from idx as long as the neighbour is also a travel slot sharing
// the same travelId. For legacy travels (no travelId) it falls back to
// identity-by-eventId so any single-slot travel still counts as a "span of
// one." Returns null if slots[idx] isn't a travel slot.
export function findTravelShardSpan(
  slots: TimeSlot[],
  idx: number,
): TravelShardSpan | null {
  if (idx < 0 || idx >= slots.length) return null;
  const center = slots[idx];
  if (center.type !== "travel") return null;

  const key = center.travelId ?? center.eventId;
  let startIdx = idx;
  let endIdx = idx;

  while (startIdx > 0) {
    const prev = slots[startIdx - 1];
    if (prev.type !== "travel") break;
    const prevKey = prev.travelId ?? prev.eventId;
    if (prevKey !== key) break;
    startIdx--;
  }
  while (endIdx < slots.length - 1) {
    const next = slots[endIdx + 1];
    if (next.type !== "travel") break;
    const nextKey = next.travelId ?? next.eventId;
    if (nextKey !== key) break;
    endIdx++;
  }

  const shards = slots.slice(startIdx, endIdx + 1) as TravelSlot[];
  return {
    travelId: key,
    startIdx,
    endIdx,
    shards,
    travelStart: shards[0].start,
    travelEnd: shards[shards.length - 1].end,
    travelFromLocationId: shards[0].travelFromLocationId,
    travelToLocationId: shards[shards.length - 1].travelToLocationId,
  };
}

// Locate the travel span containing slots[idx] and remove every shard in it
// from the array. Returns the resolved span (pre-removal) for callers that
// need the span's aggregate geometry to compute downstream side effects
// (e.g. recovering the freed time range). Returns null if slots[idx] isn't
// a travel slot.
//
// Use this in scheduling code that wants to "absorb" or "reclaim" a logical
// travel — splice(idx, 1) would only remove one shard of a multi-shard
// travel, leaving the others orphaned.
export function removeTravelSpanAt(
  slots: TimeSlot[],
  idx: number,
): TravelShardSpan | null {
  const span = findTravelShardSpan(slots, idx);
  if (!span) return null;
  slots.splice(span.startIdx, span.endIdx - span.startIdx + 1);
  return span;
}

// Stale-index-safe removal. Use when a span was located earlier (e.g. by
// the scheduler's selectBestSlot pass) but the slots array may have been
// mutated in the interim. Looks up the span fresh by travelId and removes
// it. Returns the resolved span (pre-removal) or null if no shard with
// the given travelId is present.
export function removeTravelSpanByTravelId(
  slots: TimeSlot[],
  travelId: string,
): TravelShardSpan | null {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.type !== "travel") continue;
    const key = slot.travelId ?? slot.eventId;
    if (key !== travelId) continue;
    return removeTravelSpanAt(slots, i);
  }
  return null;
}

export function isTravelSlot(slot: TimeSlot): slot is TravelSlot {
  return slot.type === "travel";
}

// Convert a travel slot back to its placeable form. If the travel was carved
// out of a category interior, the reclaimed slot stays a CategorySlot so the
// dispatcher's category-edge logic remains consistent.
export function reclaimTravelSlot(
  travelSlot: TravelSlot,
): AvailableSlot | CategorySlot {
  if (travelSlot.categoryId) {
    return {
      start: travelSlot.start,
      end: travelSlot.end,
      durationMinutes: travelSlot.durationMinutes,
      type: "category",
      currentLocationId: null,
      prevLocationId: travelSlot.travelFromLocationId,
      nextLocationId: travelSlot.travelToLocationId,
      categoryId: travelSlot.categoryId,
      isStrictCategory: travelSlot.isStrictCategory ?? false,
    };
  }
  return {
    start: travelSlot.start,
    end: travelSlot.end,
    durationMinutes: travelSlot.durationMinutes,
    type: "available",
    prevLocationId: travelSlot.travelFromLocationId,
    nextLocationId: travelSlot.travelToLocationId,
  };
}
