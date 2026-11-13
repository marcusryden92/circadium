import { Slot } from "../../models/TimeSlot";
import { lowerBoundSlotIndexByStart } from "../../utils/timeSlotUtils";

export function canPlaceStandaloneTravelBefore(
  slots: Slot[],
  bufferTimeMinutes: number,
  travelEnd: Date,
  travelMinutes: number,
): boolean {
  if (travelMinutes <= 0) return false;

  const travelEndMs = travelEnd.getTime();
  const travelStartMs = travelEndMs - travelMinutes * 60000;
  const bufferMs = bufferTimeMinutes * 60000;

  // Only slots with start <= travelStart + buffer qualify; walk backward from
  // the last such index. The slot fabric is a disjoint time partition, so once
  // a slot ends at or before travelStart, no earlier slot can reach travelEnd.
  const lastCandidate =
    lowerBoundSlotIndexByStart(slots, travelStartMs + bufferMs + 1) - 1;
  for (let i = lastCandidate; i >= 0; i--) {
    const slot = slots[i];
    if (slot.end.getTime() <= travelStartMs) break;
    if (slot.type === "available" && slot.end.getTime() >= travelEndMs) {
      return true;
    }
  }
  return false;
}
