/**
 * FitTightnessStrategy
 *
 * Scores how snugly the task fills the slot (fill ratio: duration over slot
 * minutes). selectBestSlot accepts the first slot that fits, and nothing else
 * scores wasted headroom — without this a 30-minute task shatters a four-hour
 * gap while a 35-minute gap the same day goes unused. Weighted to break ties
 * among same-day slots, never to override a full day of earliness.
 *
 * Sized placements are excluded: a split chunk's grant and a habit's flexible
 * block genuinely want headroom to grow into, so a tightness bonus would
 * fight them. They return a constant — rank-neutral across one task's slots.
 */

import { Planner, PlannerType } from "@/types/prisma";
import { PlaceableSlot } from "../models/TimeSlot";
import { SchedulingStrategy } from "./SchedulingStrategy";
import { isChunkEventId } from "../../taskSplitting";

const NEUTRAL_SCORE = 0.5;

export class FitTightnessStrategy implements SchedulingStrategy {
  readonly name = "fitTightness";

  score(task: Planner, slot: PlaceableSlot): number {
    if (task.plannerType === PlannerType.habit || isChunkEventId(task.id)) {
      return NEUTRAL_SCORE;
    }
    if (slot.durationMinutes <= 0 || task.duration <= 0) {
      return NEUTRAL_SCORE;
    }
    return Math.min(1, task.duration / slot.durationMinutes);
  }
}
