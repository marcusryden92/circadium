import type { WeekDayIntegers } from "@/types/calendarTypes";

// Local working type. Newly-drawn drafts can hold categoryId === null until
// the user picks a category; drafts are dropped on save.
export type WorkingWindow = {
  id: string;
  day: WeekDayIntegers;
  startTime: string;
  endTime: string;
  categoryId: string | null;
  recurrenceExceptions: string | null;
};

export function timeFromDate(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function endTimeFromDate(date: Date): string {
  if (date.getHours() === 0 && date.getMinutes() === 0) return "23:59";
  return timeFromDate(date);
}

export function dateToWeekDay(date: Date): WeekDayIntegers {
  return date.getDay() as WeekDayIntegers;
}

export function durationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

export function addMinutesToHHMM(hhmm: string, addMinutes: number): string {
  const total = timeToMinutes(hhmm) + addMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const WEEK_MINUTES = 7 * 24 * 60;

// A window's occupied span in absolute minutes-of-week [start, end). An
// overnight window (endTime <= startTime, e.g. 23:00-07:00) wraps past
// midnight, so end runs beyond the start day. The "23:59" value is an
// end-of-day sentinel — a within-day window ending exactly at midnight.
function windowWeekSpan(
  day: WeekDayIntegers,
  startTime: string,
  endTime: string,
): [number, number] {
  const startMin = timeToMinutes(startTime);
  let endMin = endTime === "23:59" ? 24 * 60 : timeToMinutes(endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  const start = day * 24 * 60 + startMin;
  return [start, start + (endMin - startMin)];
}

export function windowRangeOverlaps(
  windows: WorkingWindow[],
  start: Date,
  end: Date,
  excludeWindowId: string | null,
): boolean {
  const candStart =
    dateToWeekDay(start) * 24 * 60 + start.getHours() * 60 + start.getMinutes();
  const candEnd = candStart + durationMinutes(start, end);
  for (const w of windows) {
    if (w.id === excludeWindowId) continue;
    const [ws, we] = windowWeekSpan(w.day, w.startTime, w.endTime);
    // Compare on the weekly ring: an overnight window at the Sat/Sun seam
    // collides with early-Sunday candidates, so test the window shifted by a
    // whole week on either side too (each span is < a week, so ±1 covers it).
    for (const shift of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
      if (candStart < we + shift && ws + shift < candEnd) return true;
    }
  }
  return false;
}
