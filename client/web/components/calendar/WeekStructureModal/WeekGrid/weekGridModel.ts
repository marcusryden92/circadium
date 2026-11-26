import { addDays } from "date-fns";
import type { HitResult } from "@circadium/shared/calendar-core/layout";
import type { AllowHook } from "@circadium/shared/calendar-core/interaction";
import type { CalendarRange } from "@circadium/shared/calendar-core/model";
import { rangeAllowed } from "@circadium/shared/calendar-core/edit";
import {
  createSpan,
  dragIntent,
  spanSegments,
  type DragIntent,
  type DragIntentInput,
  type PreviewSegment,
  type TimeSpan,
} from "@/components/calendar/timeGrid/timeGridGeometry";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { getWeekFirstDate } from "@/utils/calendarUtils";
import { REFERENCE_WEEK_DATE } from "../constants";
import { windowRangeOverlaps, type WorkingWindow } from "../timeWindow";
import type { WeekGridEvent } from "../eventSerializers";

// The reference week: seven abstract weekdays drawn on the dates of one fixed
// week (the week holding REFERENCE_WEEK_DATE, snapped to weekStartDay). Only
// the weekday and time-of-day of a date carry meaning; a January week keeps
// DST transitions out of the grid. Column i is weekday (weekStartDay + i) % 7.

// The FullCalendar grid this replaces: 30-minute slots of 2.2rem (2.6rem on
// mobile), 15-minute snap, opened scrolled to 06:00.
export const WEEK_GRID_SNAP_MINUTES = 15;
export const WEEK_GRID_SCROLL_MINUTES = 6 * 60;
export const WEEK_HOUR_HEIGHT_DESKTOP = 2 * 2.2 * 16;
export const WEEK_HOUR_HEIGHT_MOBILE = 2 * 2.6 * 16;

export type WeekGridMode = "templates" | "windows";

export function referenceWeekStart(weekStartDay: WeekDayIntegers): Date {
  return getWeekFirstDate(weekStartDay, REFERENCE_WEEK_DATE);
}

export function columnForWeekday(
  day: WeekDayIntegers,
  weekStartDay: WeekDayIntegers,
): number {
  return (day - weekStartDay + 7) % 7;
}

export function weekdayForColumn(
  column: number,
  weekStartDay: WeekDayIntegers,
): WeekDayIntegers {
  return ((weekStartDay + column) % 7) as WeekDayIntegers;
}

// The whole reference week, or the one day the mobile view shows.
export function weekGridRange(
  weekStartDay: WeekDayIntegers,
  dayIndex: number | null,
): CalendarRange {
  const weekStart = referenceWeekStart(weekStartDay);
  if (dayIndex === null) return { start: weekStart, end: addDays(weekStart, 7) };
  const start = addDays(weekStart, dayIndex);
  return { start, end: addDays(start, 1) };
}

// The reference week is a ring: a block running past the last column (a
// Sunday-night window in a Monday-first week) continues in the first one, and
// a move can push a start before the first column. Laying out each block a
// week earlier and later as well draws those parts in the right columns;
// the copies keep the block's id, so they resolve to the same block.
const RING_SHIFTS = [-7, 0, 7];

export function ringCopies<T extends TimeSpan>(item: T): T[] {
  return RING_SHIFTS.map((days) =>
    days === 0
      ? item
      : { ...item, start: addDays(item.start, days), end: addDays(item.end, days) },
  );
}

export function ringSegments(
  span: TimeSpan,
  range: CalendarRange,
  hourHeight: number,
): PreviewSegment[] {
  return ringCopies(span).flatMap((copy) =>
    spanSegments(copy, range, hourHeight).filter((s) => s.dayIndex >= 0),
  );
}

// A create gesture joins its two hits into one continuous range, across
// columns too, so an overnight block can be drawn by dragging from one
// evening into the next morning.
export const createSpanFromHits: (
  startHit: HitResult,
  endHit: HitResult,
) => TimeSpan | null = createSpan;

export function weekGridIntent(input: DragIntentInput): DragIntent | null {
  return dragIntent(input, WEEK_GRID_SNAP_MINUTES);
}

export interface WeekGridEditTarget {
  kind: "template" | "window";
  // The edited block's id; null for a block being drawn.
  id: string | null;
}

// Whether a block may land on `span`. Every block is capped at 24h so it
// cannot overrun its own next weekly occurrence; windows must never overlap
// (checked on the weekly ring, overnight wrap and the Sat/Sun seam
// included); templates may overlap by design, the engine warns about them.
export function weekGridSpanAllowed(
  span: TimeSpan,
  target: WeekGridEditTarget,
  windows: WorkingWindow[],
): boolean {
  if (!rangeAllowed(span.start, span.end)) return false;
  if (target.kind === "window") {
    return !windowRangeOverlaps(windows, span.start, span.end, target.id);
  }
  return true;
}

// The core drag machine's live allow hook for the reference week. It
// validates the exact span a release would commit (the same intent the
// commit computes), so the tint and the outcome can never disagree.
export function weekGridAllowHook(
  mode: WeekGridMode,
  windows: WorkingWindow[],
): AllowHook {
  return (_preview, event, kind, hits) => {
    const intent = weekGridIntent({
      kind,
      event,
      startHit: hits.startHit,
      currentHit: hits.currentHit,
    });
    if (!intent) return true;
    if (intent.type === "create") {
      return weekGridSpanAllowed(
        intent.span,
        { kind: mode === "windows" ? "window" : "template", id: null },
        windows,
      );
    }
    const block = intent.event as WeekGridEvent;
    return weekGridSpanAllowed(
      intent.span,
      { kind: block.gridKind, id: block.sourceId },
      windows,
    );
  };
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

// FullCalendar's 24h eventTimeFormat range.
export function timeRangeText(span: TimeSpan): string {
  return `${hhmm(span.start)} - ${hhmm(span.end)}`;
}
