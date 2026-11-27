import { addDays, addMinutes } from "date-fns";
import {
  enumerateDays,
  sliceEventIntoDays,
  minutesToPx,
  atWallMinute,
  shiftWall,
  type HitResult,
  type SegmentComparator,
  type TileGeometry,
} from "@circadium/shared/calendar-core/layout";
import {
  computeMoveDelta,
  type CommittedState,
  type DraggingState,
} from "@circadium/shared/calendar-core/interaction";
import type {
  CalendarEvent,
  CalendarRange,
} from "@circadium/shared/calendar-core/model";

// Renderer-generic geometry for the own time grids (the main calendar and the
// WeekStructure reference week): spans from hits, drag intents, tile boxes.
// Each grid passes its own snap; the default is the main calendar's.
export const DEFAULT_SNAP_MINUTES = 5;
export const EVENT_MIN_HEIGHT = 15;

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

// A move shifts start and end by the hit delta, days included, so an event
// dragged to another column keeps its time-of-day offset from the pointer.
// The delta is calendar days plus wall-clock minutes (FullCalendar's
// day-and-time duration), so a drag across a DST change keeps the clock time.
export function moveSpan(
  event: TimeSpan,
  startHit: HitResult,
  endHit: HitResult,
): TimeSpan {
  const { dayOffset, minuteOffset } = computeMoveDelta(startHit, endHit);
  return {
    start: shiftWall(event.start, dayOffset, minuteOffset),
    end: shiftWall(event.end, dayOffset, minuteOffset),
  };
}

// A resize moves one edge by the hit delta (days included, like
// FullCalendar), never shrinking the event below one snap step.
export function resizeSpan(
  event: TimeSpan,
  startHit: HitResult,
  endHit: HitResult,
  edge: "start" | "end",
  snap = DEFAULT_SNAP_MINUTES,
): TimeSpan {
  const { dayOffset, minuteOffset } = computeMoveDelta(startHit, endHit);
  if (edge === "end") {
    const end = shiftWall(event.end, dayOffset, minuteOffset);
    const floor = addMinutes(event.start, snap);
    return { start: event.start, end: end < floor ? floor : end };
  }
  const start = shiftWall(event.start, dayOffset, minuteOffset);
  const ceiling = addMinutes(event.end, -snap);
  return { start: start > ceiling ? ceiling : start, end: event.end };
}

// A create gesture's range, or null for a zero-length press. The two hits
// join into one continuous range, across columns too (FullCalendar's
// time-grid selection), so a drag from one evening into the next morning
// selects the overnight span.
export function createSpan(
  startHit: HitResult,
  endHit: HitResult,
): TimeSpan | null {
  const a = atWallMinute(startHit.day, startHit.minute);
  const b = atWallMinute(endHit.day, endHit.minute);
  if (a.getTime() === b.getTime()) return null;
  return a < b ? { start: a, end: b } : { start: b, end: a };
}

export type DragIntent =
  | { type: "create"; span: TimeSpan }
  | { type: "move"; event: CalendarEvent; span: TimeSpan }
  | { type: "resize"; event: CalendarEvent; span: TimeSpan };

export type DragIntentInput = Pick<DraggingState, "kind" | "event" | "startHit"> & {
  currentHit: HitResult;
};

// What a drag in progress, or a finished one, amounts to. Null when it
// changes nothing (a press without movement), so a tap never writes.
export function dragIntent(
  state: DragIntentInput,
  snap = DEFAULT_SNAP_MINUTES,
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
          snap,
        );
  if (
    span.start.getTime() === event.start.getTime() &&
    span.end.getTime() === event.end.getTime()
  ) {
    return null;
  }
  return { type: kind === "move" ? "move" : "resize", event, span };
}

export function commitIntent(
  state: CommittedState,
  snap = DEFAULT_SNAP_MINUTES,
): DragIntent | null {
  return dragIntent({ ...state, currentHit: state.endHit }, snap);
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
