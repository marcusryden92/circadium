import type { HabitCompletion } from "@/types/prisma";
import type { HabitCompletionInput } from "@/utils/calendar-generation/models/SchedulingModels";

// Stored HabitCompletion rows -> the compact shape the engine consumes. Derived
// fresh per engine run (like deriveExternalBusyEvents) so a just-logged
// completion takes effect on the next regen with no reload.
export function deriveHabitCompletions(
  rows: HabitCompletion[],
): HabitCompletionInput[] {
  return rows.map((row) => ({
    plannerId: row.plannerId,
    occurrenceKey: row.occurrenceKey,
    start: row.start,
    end: row.end,
  }));
}
