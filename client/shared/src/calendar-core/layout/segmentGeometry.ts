import type { CalendarEvent } from "../model/calendarEvent";
import type { CalendarRange } from "../model/calendarEvent";
import type { DaySlice } from "./daySlice";
import type { SegRect } from "./placement/types";
import { sliceEventIntoDays } from "./daySlice";
import { minutesToPx } from "./timeGrid";
import { computeFgSegPlacements } from "./placement/placement";

/** A day segment carrying a back-reference to its source event. */
export interface EventDaySegment extends DaySlice {
  event: CalendarEvent;
}

/** Fully positioned tile geometry for rendering. */
export interface TileGeometry {
  event: CalendarEvent;
  day: Date;
  /** Top offset in px from the column's 00:00 line. */
  top: number;
  /** Height in px. */
  height: number;
  /** Left offset as a 0-1 fraction of column width. */
  left: number;
  /** Width as a 0-1 fraction of column width. */
  width: number;
  /** Nesting level in the overlap web (0 = leftmost); renderers stack by it. */
  stackDepth: number;
  /**
   * Levels from this tile to the deepest one stacked to its right, itself
   * included (a tile with nothing forward of it is 1).
   */
  stackForward: number;
  isOvernightContinuation: boolean;
}

/**
 * Comparator type for ordering segments before placement. The placement
 * algorithm uses input order to break ties, so the caller controls
 * the visual stacking by sorting with this before calling layoutDay.
 */
export type SegmentComparator = (
  a: EventDaySegment,
  b: EventDaySegment
) => number;

/**
 * Slice events into day columns, then run the overlap placement for each day.
 *
 * @param events      - all CalendarEvents for the visible range
 * @param range       - the visible date range
 * @param hourHeight  - pixels per hour
 * @param comparator  - ordering for overlap placement (replaces FullCalendar's
 *                      hardcoded '-duration,start' — the caller owns the sort)
 * @param eventMinHeight - minimum segment height in px (default 0)
 */
export function layoutEvents(
  events: CalendarEvent[],
  range: CalendarRange,
  hourHeight: number,
  comparator: SegmentComparator,
  eventMinHeight = 0
): TileGeometry[] {
  const segsByDay = new Map<number, EventDaySegment[]>();

  for (const event of events) {
    const slices = sliceEventIntoDays(event.start, event.end, range);
    for (const slice of slices) {
      const dayKey = slice.day.getTime();
      let bucket = segsByDay.get(dayKey);
      if (!bucket) {
        bucket = [];
        segsByDay.set(dayKey, bucket);
      }
      bucket.push({ ...slice, event });
    }
  }

  const tiles: TileGeometry[] = [];

  for (const [, daySegs] of segsByDay) {
    daySegs.sort(comparator);
    const { segPlacements } = computeFgSegPlacements(
      daySegs,
      hourHeight,
      null,
      null,
      eventMinHeight
    );

    for (const { seg, rect } of segPlacements) {
      if (!rect) continue;
      tiles.push(segRectToTile(seg, rect, hourHeight));
    }
  }

  return tiles;
}

/**
 * Layout a single day's segments. Useful when the caller has already sliced.
 */
export function layoutDay(
  segs: EventDaySegment[],
  hourHeight: number,
  eventMinHeight = 0
): TileGeometry[] {
  const { segPlacements } = computeFgSegPlacements(
    segs,
    hourHeight,
    null,
    null,
    eventMinHeight
  );

  const tiles: TileGeometry[] = [];
  for (const { seg, rect } of segPlacements) {
    if (!rect) continue;
    tiles.push(segRectToTile(seg, rect, hourHeight));
  }
  return tiles;
}

function segRectToTile(
  seg: EventDaySegment,
  rect: SegRect,
  hourHeight: number
): TileGeometry {
  return {
    event: seg.event,
    day: seg.day,
    top: minutesToPx(seg.startMinutes, hourHeight),
    height: minutesToPx(seg.endMinutes - seg.startMinutes, hourHeight),
    left: rect.levelCoord,
    width: rect.thickness,
    stackDepth: rect.stackDepth,
    stackForward: rect.stackForward,
    isOvernightContinuation: seg.isOvernightContinuation,
  };
}
