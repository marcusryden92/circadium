import { Slot, TravelSlot } from "../../../models/TimeSlot";
import { findTravelShardSpan } from "../../../utils/timeSlotUtils";

export type PrevTravelMatch = {
  travel: TravelSlot;
  travelIndex: number;
  availableIndex: number | null;
};

// Locate the prev Travel slot for the absorb-and-replan cascade. Handles
// both placeAtSlotStart variants — the Travel may be at slots[i-1] directly,
// or at slots[i-2] across a transparent prev Available leftover.
export function findPrevTravelForAvailable(
  slots: Slot[],
  i: number,
): PrevTravelMatch | null {
  if (i < 1) return null;
  const immediate = slots[i - 1];

  // Case 1: slots[i-1] is Travel (or last shard of a span). Span-aware:
  // walk back to the span's first shard so absorb operations cover all
  // shards belonging to one logical travel.
  if (immediate.type === "travel") {
    const span = findTravelShardSpan(slots, i - 1);
    if (!span) return null;
    const firstShard = span.shards[0];
    const availableIndex =
      span.startIdx > 0 && slots[span.startIdx - 1].type === "available"
        ? span.startIdx - 1
        : null;
    return {
      travel: firstShard,
      travelIndex: span.startIdx,
      availableIndex,
    };
  }

  // Case 2: slots[i-1] is Available leftover with Travel span behind it.
  if (immediate.type === "available" && i >= 2) {
    const before = slots[i - 2];
    if (before.type === "travel") {
      const span = findTravelShardSpan(slots, i - 2);
      if (!span) return null;
      return {
        travel: span.shards[0],
        travelIndex: span.startIdx,
        availableIndex: i - 1,
      };
    }
  }
  return null;
}

// Find the first slot at or after startIdx that has a meaningful destination
// location. Available slots return their nextLocationId (the location the
// user is heading toward, not the location they're coming from — that would
// be the just-bypassed cat). Category and Occupied slots return their own
// location. Stops at the first hard-stop boundary.
export function nextPinnedLocation(
  slots: Slot[],
  startIdx: number,
): string | null {
  for (let k = startIdx; k < slots.length; k++) {
    const s = slots[k];
    if (s.type === "category") return s.currentLocationId;
    if (s.type === "occupied") {
      if (s.locationId) return s.locationId;
      continue;
    }
    if (s.type === "available") {
      if (s.nextLocationId) return s.nextLocationId;
      continue;
    }
    if (s.type === "travel") return s.travelToLocationId;
  }
  return null;
}
