/**
 * Task Validation
 *
 * Validates task inputs before scheduling.
 */

import { Planner } from "@/types/prisma";
import { SchedulingFailure } from "../../models/SchedulingModels";
import { SchedulingFailureReason } from "../../constants";

export function validateTask(
  task: Planner
): SchedulingFailure | null {
  if (!task.duration || task.duration <= 0) {
    return {
      taskId: task.id,
      taskTitle: task.title,
      reason: SchedulingFailureReason.INVALID_TASK,
      details: "Task duration is missing or invalid",
    };
  }
  return null;
}
