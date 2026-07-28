/**
 * EarliestSlotStrategy
 *
 * Simple strategy that prefers earlier time slots.
 * Acts as a baseline for other strategies to compete against.
 *
 * Score is based on how early in the scheduling window the slot is:
 * - Slots today score highest
 * - Slots further in the future score lower
 */

import { Planner } from "@/types/prisma";
import { PlaceableSlot } from "../models/TimeSlot";
import { SchedulingContext } from "../models/SchedulingModels";
import { SchedulingStrategy } from "./SchedulingStrategy";

export class EarliestSlotStrategy implements SchedulingStrategy {
  readonly name = "earliestSlot";

  /**
   * Score a slot based on how early it is.
   * Earlier slots get higher scores.
   *
   * @param task - The task (ignored - scoring is task-independent)
   * @param slot - The time slot to score
   * @param context - Scheduling context with current date
   * @returns Score from 0.0 to 1.0 (higher = earlier = better)
   */
  score(_task: Planner, slot: PlaceableSlot, context: SchedulingContext): number {
    const now = context.currentDate;
    const slotStart = slot.start;

    // Days from now to slot; a slot already underway scores like day 0.
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysFromNow = Math.max(
      0,
      (slotStart.getTime() - now.getTime()) / msPerDay,
    );

    // Hyperbolic decay that never reaches zero, so earliness keeps
    // discriminating across the whole search range (a linear cutoff went to
    // exactly 0 past two weeks, degenerating far-horizon placement to array
    // order). Day 0 = 1.0, day 7 = 0.5, day 28 = 0.2, day 90 ~ 0.072.
    // The half-life constant is the tuning knob: larger = flatter = more
    // willing to defer.
    const halfLifeDays = 7;
    return 1 / (1 + daysFromNow / halfLifeDays);
  }
}
