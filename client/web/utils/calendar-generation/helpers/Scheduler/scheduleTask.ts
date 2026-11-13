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
  SlotSelectionResult,
} from "../../models/SchedulingModels";
import { SCHEDULING_CONFIG, SchedulingFailureReason } from "../../constants";
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

  // Phases 2+3: find candidate slots, then select one, escalating through the
  // search-window ladder. A rung whose candidates are geometrically absent OR
  // all rejected at selection (capacity + travel, day budgets) hands off to
  // the next wider rung — a non-empty inner window can still be entirely
  // unusable, and horizon expansion never changes its content, so failing
  // NO_SLOTS there would starve forever. The bounded rungs keep the fallback
  // as near as possible (past ~two weeks the earliest-slot score saturates,
  // and an uncapped scan would let location-grouping alone pick a slot months
  // beyond the nearest fit). A rung whose window already covered the whole
  // built fabric ends the ladder — wider scans would be byte-identical.
  const windowLadder: (number | null)[] = [
    SCHEDULING_CONFIG.SLOT_SEARCH_NEAR_WINDOW_DAYS,
    SCHEDULING_CONFIG.SLOT_SEARCH_WIDE_WINDOW_DAYS,
    null,
  ];
  let selection: SlotSelectionResult | undefined;
  let lastFailure: SchedulingFailure | undefined;
  for (const windowDays of windowLadder) {
    const slotsResult = findValidSlots(
      task,
      slotManager,
      context,
      afterTime,
      sizing?.minMinutes,
      windowDays,
    );
    if ("failure" in slotsResult) {
      recorder?.decision(SM.findValidSlots.noFittingSlots(task.duration), 1);
      lastFailure = slotsResult.failure;
      if (slotsResult.windowCoversFabric) break;
      continue;
    }

    recorder?.decision(
      SM.findValidSlots.foundFittingSlots(slotsResult.fittingSlots.length),
      1,
    );

    const attempt = selectBestSlot(
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
    if (!("failure" in attempt)) {
      selection = attempt;
      break;
    }
    lastFailure = attempt.failure;
    if (slotsResult.windowCoversFabric) break;
  }
  if (!selection) {
    const failure = lastFailure ?? {
      taskId: task.id,
      taskTitle: task.title,
      reason: SchedulingFailureReason.NO_SLOTS,
      details: "No usable slot found",
    };
    recorder?.setOutcome({
      kind: "failed",
      reason: failure.reason,
      details: failure.details,
    });
    recorder?.endTask(slotManager.slots);
    return { success: false, failure };
  }
  const selectionResult = selection;

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
    selectionResult.reroutableFollowingOutbound,
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
