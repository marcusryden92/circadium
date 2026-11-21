import { occurrenceKey } from "@/utils/planRecurrence";

// Upcoming rule occurrences of a weekly category window: local dates matching
// `day` at `startTime`, walking forward from `from`. Occurrences whose key is
// in `excludeKeys` (already excepted) are skipped but still count toward the
// walk, so the list stays `count` long as exceptions accumulate.
export function upcomingWindowOccurrences(
  window: { day: number; startTime: string },
  from: Date,
  count: number,
  excludeKeys?: ReadonlySet<string>,
): Date[] {
  const [hours, minutes] = window.startTime.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return [];

  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const daysUntil = (window.day - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + daysUntil);

  const occurrences: Date[] = [];
  const maxSteps = count + (excludeKeys?.size ?? 0) + 2;
  for (let step = 0; occurrences.length < count && step < maxSteps; step++) {
    const start = new Date(cursor);
    start.setHours(hours, minutes, 0, 0);
    if (start >= from && !excludeKeys?.has(occurrenceKey(start))) {
      occurrences.push(start);
    }
    // setDate stays wall-clock aligned across DST (see
    // expandCategoryWindowPeriods for the failure mode of a UTC stride).
    cursor.setDate(cursor.getDate() + 7);
  }
  return occurrences;
}
