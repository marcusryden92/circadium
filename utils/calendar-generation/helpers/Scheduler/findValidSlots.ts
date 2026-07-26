/**
 * Find Valid Slots
 *
 * Resolves task location, finds fitting slots, and filters by category constraints.
 */

import { Planner } from "@/types/prisma";
import { TimeSlotManager } from "../../core/TimeSlotManager";
import {
  SchedulingContext,
  SchedulingFailure,
  FindValidSlotsResult,
} from "../../models/SchedulingModels";
import { SchedulingFailureReason } from "../../constants";
import { findAllFittingSlots } from "../TimeSlotManager/findAllFittingSlots";

export function findValidSlots(
  task: Planner,
  slotManager: TimeSlotManager,
  context: SchedulingContext,
  afterTime?: Date,
  fitDurationMinutes?: number,
): FindValidSlotsResult | { failure: SchedulingFailure } {
  const taskLocationId = context.plannerLocationMap?.get(task.id) ?? null;
  // Chunked placements fit-test at the chunk minimum, not the full duration.
  const fitMinutes = fitDurationMinutes ?? task.duration;

  // Scheduling constraints (own + inherited): an earliest start date rides the
  // same afterTime seam goal-leaf chaining uses; allowed times are applied as
  // interval clipping inside findAllFittingSlots.
  const constraints = context.plannerConstraintsMap?.get(task.id);
  let effectiveAfter = afterTime || context.currentDate;
  if (constraints?.earliestStart && constraints.earliestStart > effectiveAfter) {
    effectiveAfter = constraints.earliestStart;
  }

  // Resolve effective category from parent chain via pre-built map
  const effectiveCategoryId =
    context.plannerCategoryMap?.get(task.id) ?? task.categoryId;

  // Categories whose windows this task's items may occupy: its own effective
  // category plus any non-confined ancestor it cascades into. The task is only
  // actually window-constrained when at least one of those bears windows (is in
  // context.categories, the window-bearing set) — otherwise it schedules freely
  // in Available time, same as an uncategorized task.
  const eligibleCategoryIds = effectiveCategoryId
    ? context.categoryEligibilityMap?.get(effectiveCategoryId)
    : undefined;
  const hasWindowConstraint =
    !!eligibleCategoryIds &&
    !!context.categories &&
    Array.from(eligibleCategoryIds).some((id) => context.categories!.has(id));

  const constraintForTask =
    effectiveCategoryId && context.categories
      ? context.categories.get(effectiveCategoryId) || undefined
      : undefined;

  // Find all slots that can fit the base requirement (duration + buffer)
  const fittingSlots = findAllFittingSlots(
    slotManager.slots,
    slotManager.bufferTimeMinutes,
    fitMinutes,
    effectiveAfter,
    undefined,
    hasWindowConstraint ? eligibleCategoryIds : undefined,
    context.placementCutoffDate,
    constraints?.allowedTimes,
    constraints?.placementWindowEnd,
  );

  if (fittingSlots.length === 0) {
    const constraintNote = constraints?.allowedTimes.length
      ? " within its allowed times"
      : "";
    return {
      failure: {
        taskId: task.id,
        taskTitle: task.title,
        reason: SchedulingFailureReason.NO_SLOTS,
        details: `No available time slots found for ${fitMinutes} minutes${constraintNote}`,
      },
    };
  }

  // findAllFittingSlots already filters by category membership via
  // categoryConstraint; the post-filter from the old AvailableSlot model is no
  // longer needed.
  return {
    validSlots: fittingSlots,
    fittingSlots,
    taskLocationId,
    constraintForTask,
    effectiveAfter,
  };
}
