/**
 * DateTimeService
 *
 * Centralized date and time operations with proper timezone handling.
 * Replaces scattered date manipulation logic with a consistent API.
 */

import { TIME_CONSTANTS, WEEKDAYS, WEEKDAY_NAMES } from "../constants";
import { WeekDayIntegers, WeekDayType } from "@/types/calendarTypes";

export class DateTimeService {
  private timezone: string;

  constructor(timezone: string = "UTC") {
    this.timezone = timezone;
  }

  /**
   * Get current date/time
   */
  now(): Date {
    return new Date();
  }

  /**
   * Check if two dates are on the same day (ignoring time)
   */
  areOnSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Check if two dates are in the same week
   */
  areInSameWeek(
    date1: Date,
    date2: Date,
    weekStartDay: WeekDayIntegers
  ): boolean {
    const week1Start = this.getWeekFirstDate(date1, weekStartDay);
    const week2Start = this.getWeekFirstDate(date2, weekStartDay);
    return this.areOnSameDay(week1Start, week2Start);
  }

  /**
   * Get the first date of the week
   */
  getWeekFirstDate(date: Date, weekStartDay: WeekDayIntegers): Date {
    const currentDay = date.getDay();
    const daysDifference = (currentDay - weekStartDay + 7) % 7;
    const firstDate = this.shiftDays(date, -daysDifference);
    firstDate.setHours(0, 0, 0, 0);
    return firstDate;
  }

  /**
   * Get the last date of the week
   */
  getWeekLastDate(date: Date, weekStartDay: WeekDayIntegers): Date {
    const firstDate = this.getWeekFirstDate(date, weekStartDay);
    return this.shiftDays(firstDate, 6);
  }

  /**
   * Get week boundaries [start, end]
   */
  getWeekBoundary(date: Date, weekStartDay: WeekDayIntegers): [Date, Date] {
    const start = this.getWeekFirstDate(date, weekStartDay);
    const end = this.getWeekLastDate(date, weekStartDay);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  /**
   * Shift a date by a number of days
   */
  shiftDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Shift a date by a number of minutes
   */
  shiftMinutes(date: Date, minutes: number): Date {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
  }

  /**
   * Set time (HH:MM) on a date
   */
  setTimeOnDate(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(":").map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  /**
   * Get time as HH:MM string
   */
  formatTime(date: Date): string {
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Calculate difference in minutes between two dates
   */
  getMinutesDifference(date1: Date, date2: Date): number {
    return Math.floor(
      Math.abs(date2.getTime() - date1.getTime()) / TIME_CONSTANTS.MS_PER_MINUTE
    );
  }

  /**
   * Calculate difference in days between two dates
   */
  getDaysDifference(date1: Date, date2: Date): number {
    const day1 = new Date(
      date1.getFullYear(),
      date1.getMonth(),
      date1.getDate()
    );
    const day2 = new Date(
      date2.getFullYear(),
      date2.getMonth(),
      date2.getDate()
    );
    const differenceMs = day2.getTime() - day1.getTime();
    return Math.floor(differenceMs / TIME_CONSTANTS.MS_PER_DAY);
  }

  /**
   * Get weekday string from a Date object
   */
  getWeekdayFromDate(date: Date): WeekDayType {
    return WEEKDAY_NAMES[date.getDay()] as WeekDayType;
  }

  /**
   * Get weekday integer from string
   */
  getWeekdayInteger(weekday: WeekDayType): WeekDayIntegers {
    return WEEKDAYS[weekday] as WeekDayIntegers;
  }

  /**
   * Start of day (00:00:00.000)
   */
  startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * End of day (23:59:59.999)
   */
  endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * Check if a date is in the past
   */
  isPast(date: Date): boolean {
    return date < this.now();
  }

  /**
   * Check if a date is in the future
   */
  isFuture(date: Date): boolean {
    return date > this.now();
  }

  /**
   * Check if a date is today
   */
  isToday(date: Date): boolean {
    return this.areOnSameDay(date, this.now());
  }

  /**
   * Floor a date to seconds since epoch (for efficient comparison)
   */
  floorToSeconds(date: Date): number {
    return Math.floor(date.getTime() / TIME_CONSTANTS.MS_PER_SECOND);
  }

  /**
   * Create ISO string from date
   */
  toISO(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parse ISO string to date
   */
  fromISO(isoString: string): Date {
    return new Date(isoString);
  }

  /**
   * Get duration in minutes between start and end
   */
  getDuration(start: Date | string, end: Date | string): number {
    const startDate = typeof start === "string" ? this.fromISO(start) : start;
    const endDate = typeof end === "string" ? this.fromISO(end) : end;
    return Math.round(
      (endDate.getTime() - startDate.getTime()) / TIME_CONSTANTS.MS_PER_MINUTE
    );
  }

  /**
   * Add duration (in minutes) to a date
   */
  addDuration(date: Date, durationMinutes: number): Date {
    return this.shiftMinutes(date, durationMinutes);
  }

  /**
   * Get calendar header date string (e.g., "Aug 1 - Aug 7, 2025")
   */
  getCalendarHeaderDateString(
    initialDate: Date,
    finalDate: Date,
    monthArray: string[]
  ): string {
    const initialDay = initialDate.getDate();
    const finalDay = finalDate.getDate();
    const initialMonth = initialDate.getMonth();
    const finalMonth = finalDate.getMonth();
    const initialYear = initialDate.getFullYear();
    const finalYear = finalDate.getFullYear();

    const initialMonthName = monthArray[initialMonth];
    const finalMonthName = monthArray[finalMonth];

    const isDifferentMonth = initialMonth !== finalMonth;
    const isDifferentYear = initialYear !== finalYear;

    let result = `${initialMonthName} ${initialDay}`;

    if (isDifferentMonth) {
      result += ` - ${finalMonthName} ${finalDay}`;
    } else {
      result += ` - ${finalDay}`;
    }

    result += `, ${initialYear}`;

    if (isDifferentYear) {
      result += ` - ${finalYear}`;
    }

    return result;
  }

  /**
   * Check if a specific time is within an event
   */
  isTimeInRange(time: Date, rangeStart: Date, rangeEnd: Date): boolean {
    const timeMs = time.getTime();
    return timeMs >= rangeStart.getTime() && timeMs < rangeEnd.getTime();
  }

  /**
   * Check if two time ranges overlap
   */
  doRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 < end2 && start2 < end1;
  }

  /**
   * Get a unique YYYY-MM-DD key for a date (used for day-keyed slot maps)
   */
  getDayKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

// Export singleton instance
export const dateTimeService = new DateTimeService();

export function getMinuteDifference(date1: Date, date2: Date): number {
  return Math.floor(Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60));
}

/** Convert a "HH:MM" string to total minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
