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
import { dateTimeService } from "../../utils/dateTimeService";

export function findValidSlots(
  task: Planner,
  slotManager: TimeSlotManager,
  context: SchedulingContext,
  afterTime?: Date,
  fitDurationMinutes?: number,
  searchWindowDays?: number | null,
): FindValidSlotsResult | { failure: SchedulingFailure; windowCoversFabric: boolean } {
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

  // One rung of the slot-search window ladder (see scheduleTask): a bounded
  // scan of `searchWindowDays` days from the effective earliest start, or the
  // whole built fabric when null. The caller escalates NEAR -> WIDE ->
  // uncapped so a nearer usable slot always wins over a farther one (past ~two
  // weeks the earliest-slot score saturates and location-grouping alone would
  // pick the winner), and escalates on SELECTION failure too — a non-empty
  // window can still be entirely unusable (capacity + travel, day budgets),
  // and horizon expansion never changes an inner window's content, so failing
  // NO_SLOTS there would starve forever. windowCoversFabric reports when this
  // rung already reached past the last built slot — a wider rung would return
  // a byte-identical set, so the caller stops escalating. The placement
  // cutoff bounds the scan either way.
  const days = searchWindowDays === undefined ? null : searchWindowDays;
  const fittingSlots = findAllFittingSlots(
    slotManager.slots,
    slotManager.bufferTimeMinutes,
    fitMinutes,
    effectiveAfter,
    days ?? undefined,
    hasWindowConstraint ? eligibleCategoryIds : undefined,
    context.placementCutoffDate,
    constraints?.allowedTimes,
    constraints?.placementWindowEnd,
  );

  const slots = slotManager.slots;
  const lastSlotStartMs =
    slots.length > 0 ? slots[slots.length - 1].start.getTime() : 0;
  const windowCoversFabric =
    days === null ||
    dateTimeService.shiftDays(effectiveAfter, days).getTime() > lastSlotStartMs;

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
      windowCoversFabric,
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
    windowCoversFabric,
  };
}
