import { startOfDay, addDays } from "date-fns";
import type { CalendarRange } from "../model/calendarEvent";

/** Which day-of-week (0=Sunday) the visible window starts on. */
export type FirstDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface VisibleRangeOptions {
  /** Number of day columns to show. */
  dayCount: number;
  /** Day-of-week the week starts on (0=Sunday). */
  firstDay: FirstDay;
  /** The reference date (the view is anchored to the week containing it). */
  anchor: Date;
}

/**
 * Compute the visible range for a week-style view.
 * Snaps `anchor` back to its containing week's firstDay,
 * then extends for `dayCount` days.
 */
export function computeVisibleRange(
  options: VisibleRangeOptions
): CalendarRange {
  const anchorDay = startOfDay(options.anchor);
  const dow = anchorDay.getDay();
  const diff = (dow - options.firstDay + 7) % 7;
  const start = addDays(anchorDay, -diff);
  const end = addDays(start, options.dayCount);
  return { start, end };
}

/**
 * Enumerate each day in a visible range as an array of midnight Dates.
 */
export function enumerateDays(range: CalendarRange): Date[] {
  const days: Date[] = [];
  let current = startOfDay(range.start);
  const endTime = range.end.getTime();
  while (current.getTime() < endTime) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}
