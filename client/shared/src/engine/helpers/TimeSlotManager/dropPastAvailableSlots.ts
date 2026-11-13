import { Slot } from "../../models/TimeSlot";

// Drop Available slots whose end is at or before `now`. Travel/Occupied/Category
// slots are kept regardless — past Travels and Occupieds remain part of the
// rendered history; past Categories anchor wrapper rendering. Only Available
// holes in the past are pruned so the scheduler can't place tasks behind the
// current moment.
export function dropPastAvailableSlots(slots: Slot[], now: Date): Slot[] {
  const nowMs = now.getTime();
  return slots.filter(
    (s) => s.type !== "available" || s.end.getTime() > nowMs,
  );
}
