import { Planner } from "@/types/prisma";
import {
  startOfDay,
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
} from "date-fns";
import {
  parsePlanRecurrence,
  parseRecurrenceExceptions,
  occurrenceKey,
  type PlanRecurrenceRule,
} from "@/utils/planRecurrence";
import { parseEarliestStartDate } from "@/utils/allowedTimes";

// Shared period model for flexibly recurring items (tasks and goals carrying a
// recurrence rule — the retired habit type's scheduling model), used by BOTH
// the engine (expandRecurringItems) and the statistics layer so scheduling and
// counting can never disagree on which period is which. Keys are
// local-wall-clock (occurrenceKey) for DST stability. The grid is anchored to
// the item's IMMUTABLE createdAt and is deliberately independent of
// weekStartDay AND earliestStartDate: an OccurrenceCompletion is bound to its
// period key, so deriving that key from a mutable input would re-key every
// logged completion and re-schedule already-completed periods. weekly is thus
// a rolling 7-day window from the creation day, not a calendar Mon/Sun week.

export const DEFAULT_RECURRENCE_RULE: PlanRecurrenceRule = {
  freq: "weekly",
  interval: 1,
};

// How many periods a single enumeration returns — the window ending at `until`,
// so an ancient anchor never burns the budget on long-past periods before
// reaching the present.
const MAX_PERIODS = 400;

export function recurrenceRule(item: Planner): PlanRecurrenceRule {
  const parsed = parsePlanRecurrence(item.recurrence) ?? DEFAULT_RECURRENCE_RULE;
  return { ...parsed, interval: parsed.interval > 0 ? parsed.interval : 1 };
}

// nth period start, stepping by `interval` periods from the aligned anchor.
export function stepPeriod(
  anchor: Date,
  rule: PlanRecurrenceRule,
  n: number,
): Date {
  const amount = n * rule.interval;
  switch (rule.freq) {
    case "daily":
      return addDays(anchor, amount);
    case "weekly":
      return addWeeks(anchor, amount);
    case "monthly":
      return addMonths(anchor, amount);
  }
}

// The period-aligned grid origin an item's occurrences step from: its immutable
// createdAt snapped to the period boundary (day for daily/weekly, month for
// monthly). Null when unparseable. Deliberately ignores weekStartDay and
// earliestStartDate — see the module note on key stability.
export function recurrenceAnchor(item: Planner): Date | null {
  const raw = new Date(item.createdAt);
  if (isNaN(raw.getTime())) return null;
  return recurrenceRule(item).freq === "monthly"
    ? startOfMonth(raw)
    : startOfDay(raw);
}

// The largest period index n whose start is at or before `date` (never
// negative). Lets enumeration jump straight to the window near `until` instead
// of stepping from an ancient anchor.
function periodIndexAt(
  anchor: Date,
  rule: PlanRecurrenceRule,
  date: Date,
): number {
  if (date <= anchor) return 0;
  switch (rule.freq) {
    case "daily":
      return Math.floor(
        differenceInCalendarDays(date, anchor) / rule.interval,
      );
    case "weekly":
      return Math.floor(
        differenceInCalendarDays(date, anchor) / (7 * rule.interval),
      );
    case "monthly":
      return Math.floor(
        differenceInCalendarMonths(date, anchor) / rule.interval,
      );
  }
}

export interface RecurrencePeriod {
  key: string;
  start: Date;
  end: Date;
}

// Up to MAX_PERIODS periods whose START falls in [floor, until), where floor is
// the later of the enumeration window's lower edge and the item's earliest
// start. Anchored to `until`, so an item created years ago still surfaces its
// present-day periods (and past ones beyond the window are dropped, as they
// were under the old front-anchored cap).
export function enumerateRecurrencePeriods(args: {
  item: Planner;
  until: Date;
}): RecurrencePeriod[] {
  const { item, until } = args;
  const anchor = recurrenceAnchor(item);
  if (!anchor) return [];

  const rule = recurrenceRule(item);
  const ruleUntil = rule.until ? new Date(rule.until) : null;

  // "Delete just this occurrence" on a flexible item skips the whole period:
  // the calendar delete-scope flow writes a `deleted` recurrence exception
  // keyed by the period key, and the period vanishes from BOTH scheduling and
  // stats (a skipped period is neither pending nor missed). Moved exceptions
  // are meaningless here — the engine places freely inside the window.
  const skippedKeys = new Set(
    parseRecurrenceExceptions(item.recurrenceExceptions)
      .filter((e) => e.type === "deleted")
      .map((e) => e.key),
  );

  const endIndex = periodIndexAt(anchor, rule, until);
  let startIndex = Math.max(0, endIndex - MAX_PERIODS + 1);

  // Never enumerate periods before the item is allowed to start. This raises
  // the lower edge without touching any period's key (keys stay createdAt-
  // anchored), so editing earliestStartDate never re-keys a logged completion.
  const earliest = parseEarliestStartDate(item.earliestStartDate);
  if (earliest && earliest > anchor) {
    startIndex = Math.max(startIndex, periodIndexAt(anchor, rule, earliest));
  }

  const periods: RecurrencePeriod[] = [];
  // The +2 margin absorbs any calendar-diff rounding in periodIndexAt; the
  // `start >= until` break is the real terminator.
  for (let n = startIndex; n <= endIndex + 2; n++) {
    const start = stepPeriod(anchor, rule, n);
    if (start >= until) break;
    if (ruleUntil && start > ruleUntil) break;
    const key = occurrenceKey(start);
    if (skippedKeys.has(key)) continue;
    periods.push({
      key,
      start,
      end: stepPeriod(anchor, rule, n + 1),
    });
  }
  return periods;
}
