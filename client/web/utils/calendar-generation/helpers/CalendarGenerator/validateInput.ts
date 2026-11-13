/**
 * Input Validation
 *
 * Validates calendar generation input and returns validation result
 */

import { validateGenerationInput } from "../CalendarValidator";
import { CalendarGenerationInput, SchedulingFailure } from "../../models/SchedulingModels";
import { SchedulingFailureReason } from "../../constants";

export function validateInput(input: CalendarGenerationInput): {
  isValid: boolean;
  failures: SchedulingFailure[];
  hasWarnings: boolean;
} {
  const validation = validateGenerationInput({
    userId: input.userId,
    weekStartDay: input.weekStartDay,
    templates: input.templates,
    planners: input.planners,
    previousCalendar: input.previousCalendar,
  });

  if (!validation.isValid) {
    console.error("Validation errors:", validation.errors);
    return {
      isValid: false,
      failures: validation.errors.map((error) => ({
        taskId: "validation",
        taskTitle: "Validation Error",
        reason: SchedulingFailureReason.INVALID_TASK,
        details: `${error.field}: ${error.message}`,
        context: { value: error.value },
      })),
      hasWarnings: false,
    };
  }

  if (validation.warnings.length > 0 && input.config?.enableLogging) {
    console.warn("Validation warnings:", validation.warnings);
  }

  return {
    isValid: true,
    failures: [],
    hasWarnings: validation.warnings.length > 0,
  };
}
