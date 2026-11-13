import { Planner, PlannerType } from "@/types/prisma";
import { TIME_CONSTANTS } from "../../constants";
import type { ValidationResult, ValidationError } from "./types";

export function validatePlanner(planner: Planner): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!planner.id) {
    errors.push({ field: "id", message: "Planner ID is required" });
  }

  if (!planner.title || planner.title.trim() === "") {
    errors.push({ field: "title", message: "Title is required" });
  }

  if (!planner.plannerType) {
    errors.push({ field: "plannerType", message: "Item type is required" });
  }

  if (!planner.userId) {
    errors.push({ field: "userId", message: "User ID is required" });
  }

  if (planner.plannerType !== PlannerType.goal) {
    if (planner.duration === undefined || planner.duration === null) {
      errors.push({ field: "duration", message: "Duration is required" });
    } else if (planner.duration <= 0) {
      // A zero-duration task/plan is a warning, not an error: the scheduler
      // skips it with a loud INVALID_TASK failure and buildPlanEvents
      // null-guards plans. A hard error here would blank the entire calendar
      // — a goal retyped to task keeps its duration of 0.
      warnings.push(
        `"${planner.title}" has no duration and will not be scheduled`,
      );
    } else if (planner.duration > TIME_CONSTANTS.MINUTES_PER_WEEK) {
      warnings.push(
        `Task "${planner.title}" duration (${planner.duration} min) exceeds one week`,
      );
    }
  } else {
    if (
      typeof planner.duration === "number" &&
      planner.duration > TIME_CONSTANTS.MINUTES_PER_WEEK
    ) {
      warnings.push(
        `Goal "${planner.title}" duration (${planner.duration} min) exceeds one week`,
      );
    }
  }

  if (planner.deadline) {
    const deadline = new Date(planner.deadline);
    if (isNaN(deadline.getTime())) {
      errors.push({
        field: "deadline",
        message: "Invalid deadline date",
        value: planner.deadline,
      });
    } else if (deadline < new Date()) {
      warnings.push(`Task "${planner.title}" has a deadline in the past`);
    }
  }

  if (planner.priority !== undefined && planner.priority < 0) {
    errors.push({
      field: "priority",
      message: "Priority cannot be negative",
      value: planner.priority,
    });
  }

  if (planner.plannerType === PlannerType.plan) {
    // A start-less plan is a warning, not an error: buildPlanEvents null-guards
    // it (nothing renders until the user sets a time), and a single hard error
    // here would blank the entire calendar. Triaged plans drafted without a
    // time (e.g. the onboarding brain-dump) rely on this.
    if (!planner.starts) {
      warnings.push(`Plan "${planner.title}" has no start time yet`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePlanners(planners: Planner[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < planners.length; i++) {
    const result = validatePlanner(planners[i]);
    if (!result.isValid) {
      result.errors.forEach((error) => {
        allErrors.push({
          ...error,
          field: `planners[${i}].${error.field}`,
        });
      });
    }
    allWarnings.push(...result.warnings);
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
