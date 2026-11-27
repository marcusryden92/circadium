import type { EventTemplate, WeekDayIntegers } from "../contracts";
import { dateTimeService } from "./dateTimeService";
import type { WorkingWindow } from "./timeWindow";

// EventTemplate.startDay arrives as either a WeekDayType string ("monday",...)
// from Prisma or as a WeekDayIntegers from local handlers — normalize here.
const WEEKDAY_STRING_TO_INT: Record<string, WeekDayIntegers> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function startDayAsInt(tpl: EventTemplate): WeekDayIntegers {
  const raw = tpl.startDay as unknown;
  if (typeof raw === "number") return raw as WeekDayIntegers;
  if (typeof raw === "string" && raw in WEEKDAY_STRING_TO_INT) {
    return WEEKDAY_STRING_TO_INT[raw];
  }
  return 1;
}

export function windowRangeToDates(
  day: WeekDayIntegers,
  startTime: string,
  endTime: string,
  weekStart: Date,
  weekStartDay: WeekDayIntegers,
): [Date, Date] {
  const offset = (day - weekStartDay + 7) % 7;
  const baseDate = dateTimeService.shiftDays(weekStart, offset);
  const start = dateTimeService.setTimeOnDate(baseDate, startTime);
  let end: Date;
  if (endTime === "23:59") {
    // End-of-day sentinel: the within-day window reaches midnight.
    end = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + 1,
    );
  } else {
    end = dateTimeService.setTimeOnDate(baseDate, endTime);
    // Overnight window (endTime <= startTime): the end lands the next day.
    if (end.getTime() <= start.getTime()) {
      end = new Date(end);
      end.setDate(end.getDate() + 1);
    }
  }
  return [start, end];
}

// Change detection for the WeekStructureModal's working copies. A template or
// window signature folds the fields the modal lets the user edit; a row whose
// signature is absent from the initial set (or whose id has disappeared) is a
// change. startDay is normalized so a string/int representation swap is not
// counted as an edit.
export function templateSignature(t: EventTemplate): string {
  return JSON.stringify([
    t.id,
    t.title,
    startDayAsInt(t),
    t.startTime,
    t.duration,
    t.color,
    t.locationId ?? null,
    t.recurrenceExceptions ?? null,
  ]);
}

export function windowSignature(w: WorkingWindow): string {
  return JSON.stringify([
    w.id,
    w.day,
    w.startTime,
    w.endTime,
    w.categoryId,
    w.recurrenceExceptions ?? null,
  ]);
}

export function countWeekStructureChanges(
  tplsInitial: EventTemplate[],
  tplsWorking: EventTemplate[],
  winsInitial: WorkingWindow[],
  winsWorking: WorkingWindow[],
): number {
  const tplSet = new Set(tplsInitial.map(templateSignature));
  let n = 0;
  for (const t of tplsWorking) if (!tplSet.has(templateSignature(t))) n++;
  for (const t of tplsInitial)
    if (!tplsWorking.find((w) => w.id === t.id)) n++;
  const winSet = new Set(winsInitial.map(windowSignature));
  for (const w of winsWorking) if (!winSet.has(windowSignature(w))) n++;
  for (const w of winsInitial)
    if (!winsWorking.find((x) => x.id === w.id)) n++;
  return n;
}

// Per-row save-time equality on the editable fields (ids already match at the
// call site, so they are excluded).
export function templateUnchanged(prev: EventTemplate, t: EventTemplate): boolean {
  return (
    prev.title === t.title &&
    startDayAsInt(prev) === startDayAsInt(t) &&
    prev.startTime === t.startTime &&
    prev.duration === t.duration &&
    prev.color === t.color &&
    (prev.locationId ?? null) === (t.locationId ?? null) &&
    (prev.recurrenceExceptions ?? null) === (t.recurrenceExceptions ?? null)
  );
}

export function windowUnchanged(orig: WorkingWindow, w: WorkingWindow): boolean {
  return (
    orig.day === w.day &&
    orig.startTime === w.startTime &&
    orig.endTime === w.endTime &&
    orig.categoryId === w.categoryId &&
    (orig.recurrenceExceptions ?? null) === (w.recurrenceExceptions ?? null)
  );
}

// Categories that gain a window this save (added, or an existing window
// reassigned into them) — used to auto-enable useTimeWindows only for those,
// never for a category that merely still has a window.
export function categoriesGainingWindows(
  winsWorking: WorkingWindow[],
  winsInitial: WorkingWindow[],
): Set<string> {
  const initialMap = new Map(winsInitial.map((w) => [w.id, w]));
  const gaining = new Set<string>();
  for (const w of winsWorking) {
    if (!w.categoryId) continue;
    const before = initialMap.get(w.id);
    if (!before || before.categoryId !== w.categoryId) {
      gaining.add(w.categoryId);
    }
  }
  return gaining;
}
