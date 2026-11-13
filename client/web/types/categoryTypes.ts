import type { WeekDayIntegers } from "./calendarTypes";

export interface CategoryTimeWindow {
  /** Day of the week (0=Sunday, 1=Monday, ... 6=Saturday). One row per weekday. */
  day: WeekDayIntegers;
  /** Start time in HH:MM format (24-hour) */
  startTime: string;
  /** End time in HH:MM format (24-hour); if <= startTime the slot spans midnight */
  endTime: string;
}
