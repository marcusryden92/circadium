import { wallMinutes } from "./wallClock";

/** Pixels-per-hour drives all vertical geometry. */
export interface TimeGridMetrics {
  /** Pixels per hour in the time grid. */
  hourHeight: number;
}

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** Total pixel height of a full 24-hour day column. */
export function dayColumnHeight(hourHeight: number): number {
  return hourHeight * HOURS_PER_DAY;
}

/** Convert minutes-from-midnight to a y pixel offset. */
export function minutesToPx(
  minutes: number,
  hourHeight: number
): number {
  return (minutes / MINUTES_PER_HOUR) * hourHeight;
}

/** Convert a y pixel offset to minutes-from-midnight. */
export function pxToMinutes(
  px: number,
  hourHeight: number
): number {
  return (px / hourHeight) * MINUTES_PER_HOUR;
}

/**
 * Snap a minute value to the nearest grid increment.
 * @param minutes     - raw minutes from midnight
 * @param snapMinutes - grid size (e.g. 5 for 5-minute snap)
 * @returns the snapped minute value, clamped to [0, 1440)
 */
export function snapMinutes(
  minutes: number,
  snapMinutes: number
): number {
  if (snapMinutes <= 0) return minutes;
  const snapped = Math.round(minutes / snapMinutes) * snapMinutes;
  return Math.max(0, Math.min(snapped, HOURS_PER_DAY * MINUTES_PER_HOUR - snapMinutes));
}

/**
 * Snap a pixel offset to the nearest grid increment, returning snapped minutes.
 */
export function snapPx(
  px: number,
  hourHeight: number,
  snapMin: number
): number {
  return snapMinutes(pxToMinutes(px, hourHeight), snapMin);
}

/**
 * Convert a Date to its minutes-from-midnight in local time.
 */
export function dateToMinutes(date: Date): number {
  return wallMinutes(date);
}
