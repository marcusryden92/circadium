import type { WeekDayIntegers } from "../contracts";

// Clamp an arbitrary number into a valid weekday (0=Sunday .. 6=Saturday),
// defaulting to Monday for anything out of range or non-integral.
export const normalizeWeekStartDay = (value: number): WeekDayIntegers =>
  Number.isInteger(value) && value >= 0 && value <= 6
    ? (value as WeekDayIntegers)
    : 1;

// The seven weekdays in display order for a given week start day.
export const orderedWeekDays = (
  weekStartDay: WeekDayIntegers,
): WeekDayIntegers[] =>
  Array.from(
    { length: 7 },
    (_, i) => ((weekStartDay + i) % 7) as WeekDayIntegers,
  );
