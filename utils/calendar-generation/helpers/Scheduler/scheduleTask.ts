/**
 * Schedule Task
 *
 * Orchestrates the 5-phase pipeline to schedule a single task:
 * validate -> find slots -> select best -> reserve -> build event
 */

import { Planner, SimpleEvent } from "@/types/prisma";
import { TimeSlotManager } from "../../core/TimeSlotManager";
import { TravelManager } from "../../core/TravelManager";
import { SchedulingStrategy } from "../../strategies/SchedulingStrategy";
import {
  ChunkSizing,
  SchedulingContext,
  SchedulingFailure,
} from "../../models/SchedulingModels";
import { validateTask } from "./validateTask";
import { findValidSlots } from "./findValidSlots";
import { selectBestSlot } from "./selectBestSlot";
import { reserveTaskSlot } from "./reserveTaskSlot";
import { buildTaskEvent } from "./buildTaskEvent";
import { SM } from "./schedulerMessages";

export function scheduleTask(
  task: Planner,
  slotManager: TimeSlotManager,
  travelManager: TravelManager,
  strategy: SchedulingStrategy,
  context: SchedulingContext,
  afterTime?: Date,
  sizing?: ChunkSizing,
): { success: boolean; event?: SimpleEvent; failure?: SchedulingFailure } {
  const recorder = context.schedulerRecorder;
  const taskLocationId = context.plannerLocationMap?.get(task.id) ?? null;
  const categoryConstraintId =
    context.plannerCategoryMap?.get(task.id) ?? task.categoryId ?? null;

  recorder?.beginTask(task, taskLocationId, categoryConstraintId);
  recorder?.decision(
    SM.scheduleTask.begin(
      task.title,
      task.duration,
      recorder.locName(taskLocationId),
      recorder.categoryName(categoryConstraintId),
    ),
    0,
  );

  // Phase 1: Validate task
  const validationError = validateTask(task);
  if (validationError) {
    recorder?.decision(
      SM.scheduleTask.validationFailed(validationError.reason),
      1,
    );
    recorder?.setOutcome({
      kind: "failed",
      reason: validationError.reason,
      details: validationError.details,
    });
    recorder?.endTask(slotManager.slots);
    return { success: false, failure: validationError };
  }

  // Phase 2: Find valid slots
  const slotsResult = findValidSlots(
    task,
    slotManager,
    context,
    afterTime,
    sizing?.minMinutes,
  );
  if ("failure" in slotsResult) {
    recorder?.decision(SM.findValidSlots.noFittingSlots(task.duration), 1);
    recorder?.setOutcome({
      kind: "failed",
      reason: slotsResult.failure.reason,
      details: slotsResult.failure.details,
    });
    recorder?.endTask(slotManager.slots);
    return { success: false, failure: slotsResult.failure };
  }

  recorder?.decision(
    SM.findValidSlots.foundFittingSlots(slotsResult.fittingSlots.length),
    1,
  );

  // Phase 3: Select best slot with travel calculation
  const selectionResult = selectBestSlot(
    task,
    slotsResult.validSlots,
    slotsResult.taskLocationId,
    slotManager,
    travelManager,
    strategy,
    context,
    sizing,
    slotsResult.effectiveAfter,
  );
  if ("failure" in selectionResult) {
    recorder?.setOutcome({
      kind: "failed",
      reason: selectionResult.failure.reason,
      details: selectionResult.failure.details,
    });
    recorder?.endTask(slotManager.slots);
    return { success: false, failure: selectionResult.failure };
  }

  // Phase 4: Reserve the slot with travel
  const reservationResult = reserveTaskSlot(
    task,
    selectionResult.selectedSlot,
    selectionResult.travelBefore,
    selectionResult.travelAfter,
    selectionResult.taskLocationId,
    selectionResult.reusableTravelStart,
    slotManager,
    travelManager,
    context,
    selectionResult.absorbableTravel,
    selectionResult.reclaimPrecedingGapTravel,
    selectionResult.slideIntoFreedTravel,
    selectionResult.grantedDurationMinutes,
    selectionResult.removableFollowingInbound,
  );
  if ("failure" in reservationResult) {
    recorder?.setOutcome({
      kind: "failed",
      reason: reservationResult.failure.reason,
      details: reservationResult.failure.details,
    });
    recorder?.endTask(slotManager.slots);
    return { success: false, failure: reservationResult.failure };
  }

  // Phase 5: Build the event
  const event = buildTaskEvent(
    task,
    reservationResult.taskStartDate,
    reservationResult.taskEndDate,
    context,
  );

  // Add to scheduled events (travel events added later by CalendarGenerator)
  context.scheduledEvents.push(event);

  recorder?.setOutcome({
    kind: "scheduled",
    start: reservationResult.taskStartDate,
    end: reservationResult.taskEndDate,
  });
  recorder?.endTask(slotManager.slots);

  return { success: true, event };
}
