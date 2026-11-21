import { AvailableSlot, Slot } from "../../models/TimeSlot";
import { createTravelSlot } from "../../utils/timeSlotUtils";
import { v4 as uuidv4 } from "uuid";

export function reserveStandaloneTravelBefore(
  slots: Slot[],
  bufferTimeMinutes: number,
  travelEnd: Date,
  travelMinutes: number,
  fromLocationId: string,
  toLocationId: string,
  force: boolean = false,
): { success: boolean } {
  const travelEndMs = travelEnd.getTime();
  const travelStart = new Date(travelEndMs - travelMinutes * 60000);
  const travelStartMs = travelStart.getTime();

  const travelSlot = createTravelSlot(
    travelStart,
    travelEnd,
    fromLocationId,
    toLocationId,
    "inbound",
    uuidv4(),
  );

  if (force) {
    // Force mode: travel goes in regardless. Trim any overlapping available
    // slots so they don't conflict.
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (s.type !== "available") continue;
      const sStartMs = s.start.getTime();
      const sEndMs = s.end.getTime();
      if (sEndMs <= travelStartMs || sStartMs >= travelEndMs) continue;

      const replacements: AvailableSlot[] = [];
      if (sStartMs < travelStartMs) {
        replacements.push({
          ...s,
          end: travelStart,
          durationMinutes: Math.floor((travelStartMs - sStartMs) / 60000),
        });
      }
      if (sEndMs > travelEndMs) {
        replacements.push({
          ...s,
          start: travelEnd,
          durationMinutes: Math.floor((sEndMs - travelEndMs) / 60000),
          prevLocationId: toLocationId,
        });
      }
      slots.splice(i, 1, ...replacements);
    }
    insertSlotSorted(slots, travelSlot);
    return { success: true };
  }

  const bufferMs = bufferTimeMinutes * 60000;
  const slotIdx = slots.findIndex(
    (s) =>
      s.type === "available" &&
      s.start.getTime() - bufferMs <= travelStartMs &&
      s.end.getTime() >= travelEndMs,
  );
  if (slotIdx === -1) return { success: false };

  const slot = slots[slotIdx] as AvailableSlot;
  const replacements: Slot[] = [];

  if (travelStartMs > slot.start.getTime()) {
    replacements.push({
      start: slot.start,
      end: travelStart,
      durationMinutes: Math.floor(
        (travelStartMs - slot.start.getTime()) / 60000,
      ),
      type: "available",
      prevLocationId: slot.prevLocationId,
      nextLocationId: fromLocationId,
    });
  }
  replacements.push(travelSlot);
  if (slot.end.getTime() > travelEndMs) {
    replacements.push({
      start: travelEnd,
      end: slot.end,
      durationMinutes: Math.floor((slot.end.getTime() - travelEndMs) / 60000),
      type: "available",
      prevLocationId: toLocationId,
      nextLocationId: slot.nextLocationId,
    });
  }
  slots.splice(slotIdx, 1, ...replacements);
  return { success: true };
}

function insertSlotSorted(slots: Slot[], slot: Slot): void {
  const targetMs = slot.start.getTime();
  const idx = slots.findIndex((s) => s.start.getTime() > targetMs);
  if (idx === -1) {
    slots.push(slot);
  } else {
    slots.splice(idx, 0, slot);
  }
}
