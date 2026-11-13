import { Planner, EventTemplate, SimpleEvent } from "@/types/prisma";
import type { ValidationResult, ValidationError } from "./types";
import { validatePlanners } from "./validatePlanners";
import { validateTemplates } from "./validateTemplates";

export function validateGenerationInput(input: {
  userId?: string;
  weekStartDay?: number;
  templates?: EventTemplate[];
  planners?: Planner[];
  previousCalendar?: SimpleEvent[];
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!input.userId) {
    errors.push({ field: "userId", message: "User ID is required" });
  }

  if (input.weekStartDay === undefined) {
    errors.push({
      field: "weekStartDay",
      message: "Week start day is required",
    });
  } else if (input.weekStartDay < 0 || input.weekStartDay > 6) {
    errors.push({
      field: "weekStartDay",
      message: "Week start day must be between 0 and 6",
      value: input.weekStartDay,
    });
  }

  if (input.templates) {
    const templateResult = validateTemplates(input.templates);
    errors.push(...templateResult.errors);
    warnings.push(...templateResult.warnings);
  }

  if (input.planners) {
    const plannerResult = validatePlanners(input.planners);
    errors.push(...plannerResult.errors);
    warnings.push(...plannerResult.warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
