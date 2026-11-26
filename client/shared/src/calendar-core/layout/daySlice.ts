import { startOfDay, addDays } from "date-fns";
import type { CalendarRange } from "../model/calendarEvent";
import { wallMinutes } from "./wallClock";

const MINUTES_PER_DAY = 24 * 60;

/** A segment of an event within a single day column. */
export interface DaySlice {
  /** The day column this slice belongs to (midnight). */
  day: Date;
  /** Minutes from midnight at the start of the day. */
  startMinutes: number;
  /** Minutes from midnight at the start of the day. Always > startMinutes. */
  endMinutes: number;
  /** Whether this slice was produced by an overnight split. */
  isOvernightContinuation: boolean;
}

/**
 * Slice an event's time range across the day columns of a visible range.
 * An event that spans midnight is split into separate slices per day
 * (overnight split). Only days within the visible range produce slices.
 */
export function sliceEventIntoDays(
  eventStart: Date,
  eventEnd: Date,
  visibleRange: CalendarRange
): DaySlice[] {
  const slices: DaySlice[] = [];

  const rangeStartTime = visibleRange.start.getTime();
  const rangeEndTime = visibleRange.end.getTime();
  const evStartTime = eventStart.getTime();
  const evEndTime = eventEnd.getTime();

  if (evEndTime <= evStartTime || evEndTime <= rangeStartTime || evStartTime >= rangeEndTime) {
    return slices;
  }

  const clippedStart = new Date(Math.max(evStartTime, rangeStartTime));
  const clippedEnd = new Date(Math.min(evEndTime, rangeEndTime));

  let currentDayStart = startOfDay(clippedStart);
  const isFirstSlice = currentDayStart.getTime() === startOfDay(eventStart).getTime();

  let first = true;
  while (currentDayStart.getTime() < clippedEnd.getTime()) {
    const nextDayStart = addDays(currentDayStart, 1);
    const sliceStart = first ? clippedStart : currentDayStart;
    const sliceEnd = new Date(
      Math.min(nextDayStart.getTime(), clippedEnd.getTime())
    );

    // Wall-clock minutes, not elapsed ones: on a DST day the column still
    // shows 24 labelled hours (see wallClock.ts).
    const startMin =
      sliceStart.getTime() === currentDayStart.getTime()
        ? 0
        : wallMinutes(sliceStart);
    const endMin =
      sliceEnd.getTime() === nextDayStart.getTime()
        ? MINUTES_PER_DAY
        : wallMinutes(sliceEnd);

    if (endMin > startMin) {
      slices.push({
        day: currentDayStart,
        startMinutes: startMin,
        endMinutes: endMin,
        isOvernightContinuation: first ? !isFirstSlice : true,
      });
    }

    currentDayStart = nextDayStart;
    first = false;
  }

  return slices;
}
