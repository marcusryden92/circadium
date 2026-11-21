import { Slot } from "../../models/TimeSlot";

// Derive the trailing horizon of the slot array — the latest `end` across all
// slots, used as the render boundary for category wrapper events. Must be
// recomputed after every expansion (slotManager.slots is mutable), because
// the wrapper render horizon would otherwise freeze at the initial chunk
// while travels keep being generated for the expanded region, producing
// orphan travels with no surrounding wrappers.
export function deriveSchedulingHorizon(slots: Slot[], fallback: Date): Date {
  if (slots.length === 0) return fallback;
  let maxEnd = slots[0].end.getTime();
  for (let i = 1; i < slots.length; i++) {
    const t = slots[i].end.getTime();
    if (t > maxEnd) maxEnd = t;
  }
  return new Date(maxEnd);
}
