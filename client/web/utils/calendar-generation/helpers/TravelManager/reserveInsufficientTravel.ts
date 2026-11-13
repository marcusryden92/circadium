import { AvailableSlot, Slot } from "../../models/TimeSlot";
import { createTravelSlot } from "../../utils/timeSlotUtils";
import { v4 as uuidv4 } from "uuid";

export function reserveInsufficientTravelBefore(
  slots: Slot[],
  bufferTimeMinutes: number,
  travelEnd: Date,
  requiredTravelMinutes: number,
  fromLocationId: string,
  toLocationId: string,
): { success: boolean } {
  const travelEndMs = travelEnd.getTime();
  const bufferMs = bufferTimeMinutes * 60000;

  const slotIdx = slots.findIndex(
    (s) => s.type === "available" && s.end.getTime() >= travelEndMs,
  );
  if (slotIdx === -1) return { success: false };

  const slot = slots[slotIdx] as AvailableSlot;
  const travelStart = new Date(slot.start.getTime() - bufferMs);
  const travelStartMs = travelStart.getTime();

  if (travelStartMs >= travelEndMs) return { success: false };

  const replacements: Slot[] = [
    createTravelSlot(
      travelStart,
      travelEnd,
      fromLocationId,
      toLocationId,
      "inbound",
      uuidv4(),
      { insufficientTravel: true, requiredTravelMinutes },
    ),
  ];

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

export function reserveInsufficientTravelAfter(
  slots: Slot[],
  bufferTimeMinutes: number,
  travelStart: Date,
  requiredTravelMinutes: number,
  fromLocationId: string,
  toLocationId: string,
): { success: boolean } {
  const travelStartMs = travelStart.getTime();
  const bufferMs = bufferTimeMinutes * 60000;

  const slotIdx = slots.findIndex(
    (s) =>
      s.type === "available" &&
      s.start.getTime() - bufferMs <= travelStartMs &&
      s.end.getTime() > travelStartMs,
  );
  if (slotIdx === -1) return { success: false };

  const slot = slots[slotIdx] as AvailableSlot;
  const travelEnd = slot.end;
  const travelEndMs = travelEnd.getTime();

  if (travelStartMs >= travelEndMs) return { success: false };

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
  replacements.push(
    createTravelSlot(
      travelStart,
      travelEnd,
      fromLocationId,
      toLocationId,
      "outbound",
      uuidv4(),
      { insufficientTravel: true, requiredTravelMinutes },
    ),
  );

  slots.splice(slotIdx, 1, ...replacements);
  return { success: true };
}
