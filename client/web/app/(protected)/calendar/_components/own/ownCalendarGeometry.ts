import { addDays, startOfDay } from "date-fns";
import {
  computeVisibleRange,
  enumerateDays,
  minutesToPx,
  dateToMinutes,
  type FirstDay,
} from "@circadium/shared/calendar-core/layout";
import type { CalendarRange } from "@circadium/shared/calendar-core/model";

// Geometry the FullCalendar surface was tuned to: 30-minute slots of 2.4rem
// (2.8rem on mobile), 5-minute snap, opened scrolled to 05:00. The rem is the
// root 16px, so an hour is 76.8 / 89.6px.
export const HOUR_HEIGHT_DESKTOP = 2 * 2.4 * 16;
export const HOUR_HEIGHT_MOBILE = 2 * 2.8 * 16;
export const SNAP_MINUTES = 5;
export const SCROLL_TIME_MINUTES = 5 * 60;

export type OwnViewType = "week" | "threeDay";

// Mobile swaps the 7-day week for a 3-day window, as the FullCalendar surface
// does: seven ~45px columns on a phone are unreadable and untappable.
export function selectViewType(isMobile: boolean): OwnViewType {
  return isMobile ? "threeDay" : "week";
}

export function viewDayCount(view: OwnViewType): number {
  return view === "week" ? 7 : 3;
}

// The week view snaps to the week containing the anchor; the 3-day view
// starts on the anchor day itself (the page re-anchors it to today on mobile).
export function viewRange(
  view: OwnViewType,
  anchor: Date,
  weekStartDay: number,
): CalendarRange {
  if (view === "week") {
    return computeVisibleRange({
      anchor,
      firstDay: weekStartDay as FirstDay,
      dayCount: 7,
    });
  }
  const start = startOfDay(anchor);
  return { start, end: addDays(start, 3) };
}

export function rangeDays(range: CalendarRange): Date[] {
  return enumerateDays(range);
}

// The column index a date falls in, or -1 outside the range.
export function dayIndexForDate(range: CalendarRange, date: Date): number {
  const days = enumerateDays(range);
  const target = startOfDay(date).getTime();
  return days.findIndex((d) => d.getTime() === target);
}

export function hourHeightFor(isMobile: boolean): number {
  return isMobile ? HOUR_HEIGHT_MOBILE : HOUR_HEIGHT_DESKTOP;
}

export interface NowLinePosition {
  dayIndex: number;
  top: number;
}

export function nowLinePosition(
  now: Date,
  range: CalendarRange,
  hourHeight: number,
): NowLinePosition | null {
  const dayIndex = dayIndexForDate(range, now);
  if (dayIndex < 0) return null;
  return { dayIndex, top: minutesToPx(dateToMinutes(now), hourHeight) };
}
