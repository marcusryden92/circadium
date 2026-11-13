import type { Category, CategoryTimeWindow } from "@/types/prisma";
import {
  occurrenceKey,
  occurrenceKeyToDate,
  parseRecurrenceExceptions,
  PlanOccurrenceException,
} from "@/utils/planRecurrence";
import { hhmmToMinutes } from "../../utils/dateTimeService";
import { expandSlotForDay } from "./expandSlotForDay";

// One concrete weekly occurrence of a category time window with any
// per-occurrence exception (CategoryTimeWindow.recurrenceExceptions) already
// applied. start/end are the actual bounds — a moved occurrence carries its
// override; originalStart is the rule-derived start, which the CategoryEvent
// id and the exception key both derive from.
//
// Every consumer of window geometry (the slot fabric, CategoryEvent
// materialization, wrapper recovery) must expand through this helper so they
// agree on which occurrences exist.
export type CategoryWindowPeriod = {
  start: Date;
  end: Date;
  originalStart: Date;
  categoryId: string;
  categoryTimeWindowId: string;
  locationId: string | null;
  isStrict: boolean;
};

// Window rows are immutable everywhere (Redux updates replace, structured
// clone into the worker mints fresh objects per run), so parsed exceptions
// can memoize on row identity.
const exceptionsMemo = new WeakMap<
  CategoryTimeWindow,
  PlanOccurrenceException[]
>();

function exceptionsFor(window: CategoryTimeWindow): PlanOccurrenceException[] {
  let parsed = exceptionsMemo.get(window);
  if (!parsed) {
    parsed = parseRecurrenceExceptions(window.recurrenceExceptions);
    exceptionsMemo.set(window, parsed);
  }
  return parsed;
}

function windowDurationMs(window: CategoryTimeWindow): number {
  const startMin = hhmmToMinutes(window.startTime);
  let endMin = hhmmToMinutes(window.endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  return (endMin - startMin) * 60000;
}

// Expands every window of the given categories into concrete periods
// overlapping [rangeStart, rangeEnd). Two passes per window:
//
// 1. Vacate — walk the weekly rule; any occurrence whose key matches an
//    exception (moved OR deleted) is dropped from its original slot.
// 2. Re-emit — each moved exception is emitted at its override start, guarded
//    by the range that CONTAINS the override rather than the range iterating
//    the original day. Chunked horizon expansion would otherwise drop an
//    occurrence moved across the seam (original day in one chunk, override in
//    another) or emit it twice. Same rule as template masksToIntervals.
//
// Periods carry full occurrence bounds — consumers clip to their own extent.
// Like the walks this replaces, occurrences anchored before rangeStart are
// not chased backward (a previous-day overnight occurrence bleeding into the
// range does not emit).
export function expandCategoryWindowPeriods(
  categories: Category[],
  rangeStart: Date,
  rangeEnd: Date,
): CategoryWindowPeriod[] {
  const periods: CategoryWindowPeriod[] = [];

  for (const category of categories) {
    for (const window of category.timeSlots) {
      const exceptions = exceptionsFor(window);
      const base = {
        categoryId: category.id,
        categoryTimeWindowId: window.id,
        locationId: category.locationId ?? null,
        isStrict: category.isStrict,
      };

      const searchBase = new Date(rangeStart);
      searchBase.setHours(0, 0, 0, 0);
      const daysUntil = (window.day - searchBase.getDay() + 7) % 7;
      searchBase.setDate(searchBase.getDate() + daysUntil);

      while (searchBase <= rangeEnd) {
        const period = expandSlotForDay(window, searchBase);
        if (period && period.end > rangeStart && period.start < rangeEnd) {
          const key = occurrenceKey(period.start);
          if (!exceptions.some((e) => e.key === key)) {
            periods.push({
              start: period.start,
              end: period.end,
              originalStart: period.start,
              ...base,
            });
          }
        }

        // setDate stays wall-clock aligned across DST; a fixed UTC stride
        // (getTime + MS_PER_WEEK) drifts the local day-of-week by an hour
        // either side of a DST boundary and can skip the target day-of-week
        // entirely on the fall-back side.
        searchBase.setDate(searchBase.getDate() + 7);
      }

      for (const exception of exceptions) {
        if (exception.type !== "moved") continue;
        const start = new Date(exception.newStart);
        if (isNaN(start.getTime())) continue;
        if (start < rangeStart || start >= rangeEnd) continue;
        periods.push({
          start,
          end: new Date(start.getTime() + windowDurationMs(window)),
          originalStart: occurrenceKeyToDate(exception.key),
          ...base,
        });
      }
    }
  }

  return periods.sort((a, b) => a.start.getTime() - b.start.getTime());
}
