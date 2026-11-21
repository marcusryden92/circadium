import { PlaceableSlot, Slot } from "../../models/TimeSlot";
import { dateTimeService } from "../../utils/dateTimeService";

// Return all slots a task could land in for a given day — free time
// (AvailableSlot) and category interiors (CategorySlot).
export function getDaySlots(slots: Slot[], date: Date): PlaceableSlot[] {
  const dayStart = dateTimeService.startOfDay(date);
  const dayEnd = dateTimeService.endOfDay(date);
  return slots.filter(
    (slot): slot is PlaceableSlot =>
      (slot.type === "available" || slot.type === "category") &&
      slot.start < dayEnd &&
      slot.end > dayStart,
  );
}

export function getDayAvailableMinutes(slots: Slot[], date: Date): number {
  const daySlots = getDaySlots(slots, date);
  return daySlots.reduce((total, slot) => total + slot.durationMinutes, 0);
}
