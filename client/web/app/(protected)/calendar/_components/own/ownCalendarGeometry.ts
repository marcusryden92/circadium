import { addDays, addMinutes, startOfDay } from "date-fns";
import {
  computeVisibleRange,
  enumerateDays,
  sliceEventIntoDays,
  minutesToPx,
  dateToMinutes,
  type FirstDay,
  type HitResult,
  type SegmentComparator,
  type TileGeometry,
} from "@circadium/shared/calendar-core/layout";
import {
  computeMoveDelta,
  computeCreateRange,
  type CommittedState,
  type DraggingState,
} from "@circadium/shared/calendar-core/interaction";
import type {
  CalendarEvent,
  CalendarRange,
} from "@circadium/shared/calendar-core/model";

// Geometry the FullCalendar surface was tuned to: 30-minute slots of 2.4rem
// (2.8rem on mobile), 5-minute snap, 15px minimum tile height, opened
// scrolled to 05:00. The rem is the root 16px, so an hour is 76.8 / 89.6px.
export const HOUR_HEIGHT_DESKTOP = 2 * 2.4 * 16;
export const HOUR_HEIGHT_MOBILE = 2 * 2.8 * 16;
export const SNAP_MINUTES = 5;
export const EVENT_MIN_HEIGHT = 15;
export const SCROLL_TIME_MINUTES = 5 * 60;
const MINUTES_PER_DAY = 24 * 60;

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

// FullCalendar's eventOrder "-duration,start": longest event first, then
// earliest. Duration is the whole event's, not the day slice's, so both halves
// of an overnight event sort the same way. Ties keep input order (stable sort),
// which is buildCalendarEvents' stream order.
export const compareSegments: SegmentComparator = (a, b) => {
  const durationA = a.event.end.getTime() - a.event.start.getTime();
  const durationB = b.event.end.getTime() - b.event.start.getTime();
  if (durationA !== durationB) return durationB - durationA;
  return a.event.start.getTime() - b.event.start.getTime();
};

export interface TileBox {
  top: number;
  height: number;
  // CSS percentages of the column's events area.
  left: number;
  right: number;
  zIndex: number;
}

// The placement fractions to CSS, the way FullCalendar draws them with its
// default slotEventOverlap: each tile's width doubled (capped at the column
// edge) so later levels overlap earlier ones, stacked by depth.
export function tileBox(tile: TileGeometry, minHeight = EVENT_MIN_HEIGHT): TileBox {
  const near = tile.left;
  const far = Math.min(1, near + tile.width * 2);
  return {
    top: tile.top,
    height: Math.max(tile.height, minHeight),
    left: near * 100,
    right: (1 - far) * 100,
    zIndex: tile.stackDepth + 1,
  };
}

// Whether a day slice holds the event's real start / end, which is where the
// matching resize handle belongs (an overnight event's first slice has no end
// handle, its continuation no start handle).
export function sliceEdges(
  event: Pick<CalendarEvent, "end">,
  slice: { day: Date; isOvernightContinuation: boolean },
): { isStart: boolean; isEnd: boolean } {
  return {
    isStart: !slice.isOvernightContinuation,
    isEnd: event.end.getTime() <= addDays(slice.day, 1).getTime(),
  };
}

export interface TimeSpan {
  start: Date;
  end: Date;
}

function hitDelta(startHit: HitResult, endHit: HitResult): number {
  const { dayOffset, minuteOffset } = computeMoveDelta(startHit, endHit);
  return dayOffset * MINUTES_PER_DAY + minuteOffset;
}

// A move shifts start and end by the hit delta, days included, so an event
// dragged to another column keeps its time-of-day offset from the pointer.
export function moveSpan(
  event: TimeSpan,
  startHit: HitResult,
  endHit: HitResult,
): TimeSpan {
  const delta = hitDelta(startHit, endHit);
  return {
    start: addMinutes(event.start, delta),
    end: addMinutes(event.end, delta),
  };
}

// A resize moves one edge by the hit delta (days included, like
// FullCalendar), never shrinking the event below one snap step.
export function resizeSpan(
  event: TimeSpan,
  startHit: HitResult,
  endHit: HitResult,
  edge: "start" | "end",
  snap = SNAP_MINUTES,
): TimeSpan {
  const delta = hitDelta(startHit, endHit);
  if (edge === "end") {
    const end = addMinutes(event.end, delta);
    const floor = addMinutes(event.start, snap);
    return { start: event.start, end: end < floor ? floor : end };
  }
  const start = addMinutes(event.start, delta);
  const ceiling = addMinutes(event.end, -snap);
  return { start: start > ceiling ? ceiling : start, end: event.end };
}

// A create gesture's range, or null for a zero-length press.
export function createSpan(
  startHit: HitResult,
  endHit: HitResult,
): TimeSpan | null {
  const range = computeCreateRange(startHit, endHit);
  if (range.endMinute <= range.startMinute) return null;
  return {
    start: addMinutes(startOfDay(range.day), range.startMinute),
    end: addMinutes(startOfDay(range.day), range.endMinute),
  };
}

export type DragIntent =
  | { type: "create"; span: TimeSpan }
  | { type: "move"; event: CalendarEvent; span: TimeSpan }
  | { type: "resize"; event: CalendarEvent; span: TimeSpan };

// What a drag in progress, or a finished one, amounts to. Null when it
// changes nothing (a press without movement), so a tap never writes.
export function dragIntent(
  state: Pick<DraggingState, "kind" | "event" | "startHit"> & {
    currentHit: HitResult;
  },
): DragIntent | null {
  const { kind, event, startHit, currentHit } = state;
  if (kind === "create") {
    const span = createSpan(startHit, currentHit);
    return span ? { type: "create", span } : null;
  }
  if (!event) return null;
  const span =
    kind === "move"
      ? moveSpan(event, startHit, currentHit)
      : resizeSpan(
          event,
          startHit,
          currentHit,
          kind === "resize-start" ? "start" : "end",
        );
  if (
    span.start.getTime() === event.start.getTime() &&
    span.end.getTime() === event.end.getTime()
  ) {
    return null;
  }
  return { type: kind === "move" ? "move" : "resize", event, span };
}

export function commitIntent(state: CommittedState): DragIntent | null {
  return dragIntent({ ...state, currentHit: state.endHit });
}

export interface PreviewSegment {
  dayIndex: number;
  top: number;
  height: number;
  isStart: boolean;
  isEnd: boolean;
}

// A span cut into the visible columns: the drag mirror, the create
// highlight, and any tile held at its drop position share it.
export function spanSegments(
  span: TimeSpan,
  range: CalendarRange,
  hourHeight: number,
): PreviewSegment[] {
  const days = enumerateDays(range);
  return sliceEventIntoDays(span.start, span.end, range).map((slice) => ({
    dayIndex: days.findIndex((d) => d.getTime() === slice.day.getTime()),
    top: minutesToPx(slice.startMinutes, hourHeight),
    height: minutesToPx(slice.endMinutes - slice.startMinutes, hourHeight),
    isStart: !slice.isOvernightContinuation,
    isEnd: span.end.getTime() <= addDays(slice.day, 1).getTime(),
  }));
}

// FullCalendar labels every hour of its 30-minute slats, vertically centered
// in the hour's first slot.
export function hourLabels(): { hour: number; label: string }[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
  }));
}
