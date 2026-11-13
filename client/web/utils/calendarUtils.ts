/**
 * Calendar Utilities
 *
 * Backward-compatible exports. New code should use dateTimeService from
 * calendar-generation/utils/dateTimeService instead.
 */

import { WeekDayIntegers, WeekDayType } from "@/types/calendarTypes";
import { SimpleEvent } from "@/types/prisma";
import { EventInput } from "@fullcalendar/core/index.js";
import { RRule, Weekday } from "rrule";
import { format } from "date-fns";
import { dateTimeService } from "./calendar-generation/utils/dateTimeService";
import { startOfDay } from "./dateUtils";

// Re-export from dateTimeService for backward compatibility
export const getWeekdayFromDate = (date: Date): WeekDayType =>
  dateTimeService.getWeekdayFromDate(date);

// FullCalendar's default is 1000ms; 300ms keeps scroll-flicks scrolling
// (movement cancels the pending drag) while beating iOS's ~500ms system
// long-press gestures. Shared by the main calendar and the WeekStructureModal.
export const CALENDAR_LONG_PRESS_DELAY_MS = 300;

// Apply a "HH:MM" picker value onto an existing date, keeping its day.
export const timeOnDate = (base: Date, hhmm: string): Date => {
  const [h, m] = hhmm.split(":").map(Number);
  const next = new Date(base);
  next.setHours(h, m, 0, 0);
  return next;
};

const WEEKDAY_NAME_BY_INT: readonly WeekDayType[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const WEEKDAY_INT_BY_NAME: Record<WeekDayType, WeekDayIntegers> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const weekdayToInt = (d: WeekDayType): WeekDayIntegers =>
  WEEKDAY_INT_BY_NAME[d];

export const intToWeekday = (i: WeekDayIntegers): WeekDayType =>
  WEEKDAY_NAME_BY_INT[i];

export const normalizeWeekStartDay = (value: number): WeekDayIntegers =>
  Number.isInteger(value) && value >= 0 && value <= 6
    ? (value as WeekDayIntegers)
    : 1;

export const orderedWeekDays = (
  weekStartDay: WeekDayIntegers,
): WeekDayIntegers[] =>
  Array.from(
    { length: 7 },
    (_, i) => ((weekStartDay + i) % 7) as WeekDayIntegers,
  );

export const shiftDate = (date: Date, days: number): Date =>
  dateTimeService.shiftDays(date, days);

export const setTimeOnDate = (date: Date, time: string): Date =>
  dateTimeService.setTimeOnDate(date, time);

export const getDateOfThisWeeksMonday = (
  todaysDate: Date,
): Date | undefined => {
  if (!todaysDate) {
    console.warn("todaysDate is undefined in getDateOfThisWeeksMonday.");
    return undefined;
  }
  const dayOfWeek = todaysDate.getDay();
  const daysToMonday = (dayOfWeek + 6) % 7;
  return dateTimeService.shiftDays(todaysDate, -daysToMonday);
};

export const getWeekFirstDate = (
  weekStartDay: WeekDayIntegers,
  todaysDate: Date,
): Date => dateTimeService.getWeekFirstDate(todaysDate, weekStartDay);

export const floorMinutes = (date: Date | string): number =>
  dateTimeService.floorToSeconds(
    typeof date === "string" ? new Date(date) : date,
  );

export const getDuration = (start: Date | string, end: Date | string): number =>
  dateTimeService.getDuration(start, end);

export const formatTime = (date: Date): string =>
  dateTimeService.formatTime(date);

export function getRRuleDayTypeFromIndex(day: number): Weekday {
  const rruleWeekdays = [
    RRule.SU,
    RRule.MO,
    RRule.TU,
    RRule.WE,
    RRule.TH,
    RRule.FR,
    RRule.SA,
  ];
  return rruleWeekdays[day];
}

export const transformEventsForFullCalendar = (
  events: SimpleEvent[],
): EventInput[] => {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    duration: event.duration ?? undefined,
    rrule: event.rrule
      ? (JSON.parse(event.rrule) as Record<string, unknown>)
      : undefined,
    backgroundColor: event.backgroundColor,
    borderColor: event.borderColor,
    editable: true,
    extendedProps: {
      ...event.extendedProps,
      backgroundColor: event.backgroundColor,
    },
  }));
};

// Bucket calendar events into per-day groups, preserving input order within
// each day. Day key is YYYY-MM-DD in local time, and `date` is the day-start
// Date so callers can format it without re-parsing. Used by per-item schedule
// views and dashboard "upcoming" lists.
export type EventDayBucket = {
  dayKey: string;
  date: Date;
  events: SimpleEvent[];
};

export function bucketEventsByDay(events: SimpleEvent[]): EventDayBucket[] {
  const map = new Map<string, EventDayBucket>();
  for (const e of events) {
    const date = new Date(e.start);
    const dayKey = format(date, "yyyy-MM-dd");
    const bucket = map.get(dayKey);
    if (bucket) {
      bucket.events.push(e);
    } else {
      map.set(dayKey, { dayKey, date: startOfDay(date), events: [e] });
    }
  }
  return Array.from(map.values());
}

export function getCalendarHeaderDateString(
  initialDate: Date,
  finalDate: Date,
  monthArray: string[],
): string {
  return dateTimeService.getCalendarHeaderDateString(
    initialDate,
    finalDate,
    monthArray,
  );
}
