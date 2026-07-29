import type { OccurrenceCompletion } from "@/types/prisma";
import type { OccurrenceCompletionInput } from "@/utils/calendar-generation/models/SchedulingModels";

// Stored OccurrenceCompletion rows -> the compact shape the engine consumes.
// Derived fresh per engine run (like deriveExternalBusyEvents) so a just-logged
// completion takes effect on the next regen with no reload.
export function deriveOccurrenceCompletions(
  rows: OccurrenceCompletion[],
): OccurrenceCompletionInput[] {
  return rows.map((row) => ({
    plannerId: row.plannerId,
    occurrenceKey: row.occurrenceKey,
    start: row.start,
    end: row.end,
  }));
}
