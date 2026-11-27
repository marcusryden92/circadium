import { addDays, startOfDay } from "date-fns";
import type { CalendarRange } from "../model/calendarEvent";
import { pxToMinutes } from "./timeGrid";

const MINUTES_PER_DAY = 24 * 60;

export interface HitResult {
  /** The day column the hit lands in (midnight Date). */
  day: Date;
  /** Minutes from midnight (snapped if snapMinutes > 0). */
  minute: number;
}

/**
 * Map an (x, y) pixel coordinate to a day column + minute-of-day.
 *
 * @param x              - horizontal px relative to the grid's left edge
 * @param y              - vertical px relative to the grid's top edge
 * @param columnWidth    - width of each day column in px
 * @param hourHeight     - pixels per hour
 * @param visibleRange   - the visible date range
 * @param snapMin        - snap grid in minutes (0 = no snap)
 * @returns the hit, or null if the point is outside the grid
 */
export function hitTest(
  x: number,
  y: number,
  columnWidth: number,
  hourHeight: number,
  visibleRange: CalendarRange,
  snapMin = 0
): HitResult | null {
  if (x < 0 || y < 0 || columnWidth <= 0 || hourHeight <= 0) {
    return null;
  }

  const rangeStart = startOfDay(visibleRange.start);
  const rangeEnd = visibleRange.end;
  const totalDays = Math.round(
    (rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60_000)
  );

  const colIndex = Math.floor(x / columnWidth);
  if (colIndex < 0 || colIndex >= totalDays) {
    return null;
  }

  const day = addDays(rangeStart, colIndex);
  // The column's bottom edge is 24:00 and stays reachable so a range can end
  // at midnight; snapMinutes alone would cap at the last slot's start.
  const rawMinutes = Math.min(pxToMinutes(y, hourHeight), MINUTES_PER_DAY);
  const minute =
    snapMin > 0
      ? Math.min(Math.round(rawMinutes / snapMin) * snapMin, MINUTES_PER_DAY)
      : rawMinutes;

  return { day, minute };
}
