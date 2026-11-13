import { addDays, format, getDay, startOfDay, subDays } from "date-fns";
import type {
  Habit,
  HabitItem,
  OccurrenceCompletion,
  Planner,
} from "@/types/prisma";
import {
  expandPlanOccurrences,
  isRecurrenceOccurrenceId,
  occurrenceKey,
  parsePlanRecurrence,
  parseRecurrenceExceptions,
  plannerHasFlexibleRecurrence,
  plannerIdFromEventId,
} from "@/utils/planRecurrence";
import { enumerateRecurrencePeriods } from "@/utils/recurringPeriods";
import { plannerCompletedEnd } from "@/utils/plannerCompletion";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// Tracker statistics: a habit derives its history from the completion signals
// of the repeating planner items assigned to it. Per-day cells feed the month
// grid; each completed occurrence of each tracked item counts as ONE instance
// on the day it completed (count inside the circle when several). Days where
// no tracked item has a concrete occurrence are marked not-expected so the
// grid can gray them out. Period-based consistency (rate/streaks) is graded
// only when the habit tracks exactly one flexibly recurring item — with
// several items there is no single honest cadence to grade against, so those
// habits show activity without a "missed" verdict.
//
// Per-item completion signal:
//   - flexibly recurring TASK  -> one completion per logged period (row on the
//     task id), counted on the day the logged window ended
//   - flexibly recurring GOAL  -> one completion per period whose EVERY
//     bottom-layer leaf is logged, counted on the day the last leaf's window
//     ended
//   - recurring PLAN           -> one completion per checked-off occurrence
//   - anything else (legacy links) -> its row-level completion day
//
// Per-item expected-day signal (which days CAN hold an instance):
//   - any completion day (it demonstrably held one)
//   - a recurring plan's occurrence days (fixed timestamps; deleted
//     exceptions skipped)
//   - a flexible item whose period spans exactly one local day (daily rules)
//     marks every period day — multi-day periods leave the day open until the
//     engine picks one
//   - the day of an engine-scheduled occurrence of a tracked flexible item
//     (covers today for weekly/monthly rules)

export type HabitPeriodStatus = "completed" | "missed" | "pending";

export interface HabitPeriodEntry {
  key: string;
  start: string;
  end: string;
  status: HabitPeriodStatus;
}

export interface HabitPeriodStats {
  completedCount: number;
  missedCount: number;
  pendingCount: number;
  /** completed / (completed + missed); 0 when no period has elapsed yet. */
  completionRate: number;
  /** Consecutive most-recent ELAPSED periods completed (pending doesn't break). */
  currentStreak: number;
  longestStreak: number;
  /** Every enumerated period, most-recent first. */
  history: HabitPeriodEntry[];
}

export interface HabitDayCell {
  /** Local day key (yyyy-MM-dd). */
  dayKey: string;
  date: Date;
  completedCount: number;
  /** Some tracked item has a concrete occurrence signal this day. */
  expected: boolean;
}

export interface HabitTrackerStats {
  /** Oldest -> newest, one cell per day in the window. */
  days: HabitDayCell[];
  /** Completions inside the day window. */
  totalCompletions: number;
  /** All-time completion count across tracked items. */
  allTimeCompletions: number;
  /** Non-null only when the habit tracks exactly one recurring item. */
  period: HabitPeriodStats | null;
}

export const HABIT_GRID_DAYS = 30;

function dayKeyOf(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function goalLeafIds(planners: Planner[], rootId: string): string[] {
  const childrenByParent = new Map<string, Planner[]>();
  for (const p of planners) {
    if (!p.parentId) continue;
    const list = childrenByParent.get(p.parentId);
    if (list) list.push(p);
    else childrenByParent.set(p.parentId, [p]);
  }
  const leaves: string[] = [];
  const seen = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    const children = childrenByParent.get(node.id);
    if (children && children.length) stack.push(...children);
    else leaves.push(node.id);
  }
  return leaves;
}

// Completion instants (ISO end of the logged/completed window) contributed by
// one tracked planner item.
function itemCompletionEnds(
  row: Planner,
  planners: Planner[],
  rowsByPlanner: Map<string, OccurrenceCompletion[]>,
  now: Date,
): string[] {
  if (row.plannerType === "plan") {
    return (rowsByPlanner.get(row.id) ?? []).map((r) => r.end);
  }
  if (plannerHasFlexibleRecurrence(row)) {
    if (row.plannerType === "goal") {
      const leaves = goalLeafIds(planners, row.id);
      if (leaves.length === 0) return [];
      const periods = enumerateRecurrencePeriods({ item: row, until: now });
      const ends: string[] = [];
      for (const period of periods) {
        let latest: string | null = null;
        let allLogged = true;
        for (const leafId of leaves) {
          const match = (rowsByPlanner.get(leafId) ?? []).find(
            (r) => r.occurrenceKey === period.key,
          );
          if (!match) {
            allLogged = false;
            break;
          }
          if (!latest || match.end > latest) latest = match.end;
        }
        if (allLogged && latest) ends.push(latest);
      }
      return ends;
    }
    return (rowsByPlanner.get(row.id) ?? []).map((r) => r.end);
  }
  const end = plannerCompletedEnd(row);
  return end ? [end] : [];
}

// Days inside the grid window on which this item has a concrete occurrence.
function itemExpectedDays(
  row: Planner,
  windowStart: Date,
  windowEnd: Date,
): string[] {
  if (row.plannerType === "plan") {
    if (!row.starts) return [];
    const rule = parsePlanRecurrence(row.recurrence);
    if (!rule) {
      const start = new Date(row.starts);
      return isNaN(start.getTime()) ? [] : [dayKeyOf(start)];
    }
    return expandPlanOccurrences({
      starts: row.starts,
      durationMinutes: row.duration,
      rule,
      exceptions: parseRecurrenceExceptions(row.recurrenceExceptions),
      windowEnd,
    })
      .filter((o) => o.start >= windowStart || o.end >= windowStart)
      .map((o) => dayKeyOf(o.start));
  }
  if (!plannerHasFlexibleRecurrence(row)) return [];
  const days: string[] = [];
  for (const period of enumerateRecurrencePeriods({
    item: row,
    until: windowEnd,
  })) {
    if (period.end <= windowStart) continue;
    // A period covering exactly one local day pins its occurrence to that day;
    // longer periods leave the day open (engine placement / completion decide).
    const lastCovered = new Date(period.end.getTime() - 1);
    if (dayKeyOf(lastCovered) === dayKeyOf(period.start)) {
      days.push(dayKeyOf(period.start));
    }
  }
  return days;
}

function periodStatsFor(
  row: Planner,
  planners: Planner[],
  rowsByPlanner: Map<string, OccurrenceCompletion[]>,
  now: Date,
): HabitPeriodStats {
  const leaves =
    row.plannerType === "goal" ? goalLeafIds(planners, row.id) : null;
  const periodCompleted = (key: string): boolean => {
    if (leaves) {
      if (leaves.length === 0) return false;
      return leaves.every((leafId) =>
        (rowsByPlanner.get(leafId) ?? []).some((r) => r.occurrenceKey === key),
      );
    }
    return (rowsByPlanner.get(row.id) ?? []).some(
      (r) => r.occurrenceKey === key,
    );
  };

  // Periods whose start is before now: every elapsed period plus the current
  // one. Future periods are excluded.
  const periods = enumerateRecurrencePeriods({ item: row, until: now });
  const entries: HabitPeriodEntry[] = periods.map((period) => {
    let status: HabitPeriodStatus;
    if (periodCompleted(period.key)) status = "completed";
    else if (period.end <= now) status = "missed";
    else status = "pending";
    return {
      key: period.key,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      status,
    };
  });

  const completedCount = entries.filter((e) => e.status === "completed").length;
  const missedCount = entries.filter((e) => e.status === "missed").length;
  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const elapsed = completedCount + missedCount;

  const elapsedEntries = entries.filter((e) => e.status !== "pending");
  let currentStreak = 0;
  for (let i = elapsedEntries.length - 1; i >= 0; i--) {
    if (elapsedEntries[i].status === "completed") currentStreak++;
    else break;
  }
  let longestStreak = 0;
  let run = 0;
  for (const entry of elapsedEntries) {
    if (entry.status === "completed") {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 0;
    }
  }

  return {
    completedCount,
    missedCount,
    pendingCount,
    completionRate: elapsed > 0 ? completedCount / elapsed : 0,
    currentStreak,
    longestStreak,
    history: [...entries].reverse(),
  };
}

export function computeHabitTrackerStats(args: {
  habit: Habit;
  habitItems: HabitItem[];
  planners: Planner[];
  completions: OccurrenceCompletion[];
  now: Date;
  /**
   * Engine-placed calendar events; occurrence placements of tracked flexible
   * items mark their day expected (weekly/monthly rules get their day from
   * where the engine put the block).
   */
  scheduledEvents?: { id: string; start: string }[];
  windowDays?: number;
}): HabitTrackerStats {
  const {
    habit,
    habitItems,
    planners,
    completions,
    now,
    scheduledEvents = [],
    windowDays = HABIT_GRID_DAYS,
  } = args;

  const plannerById = new Map(planners.map((p) => [p.id, p]));
  const trackedRows = habitItems
    .filter((i) => i.habitId === habit.id)
    .map((i) => plannerById.get(i.plannerId))
    .filter((p): p is Planner => !!p);
  const trackedRootIds = new Set(trackedRows.map((r) => r.id));

  const rowsByPlanner = new Map<string, OccurrenceCompletion[]>();
  for (const row of completions) {
    const list = rowsByPlanner.get(row.plannerId);
    if (list) list.push(row);
    else rowsByPlanner.set(row.plannerId, [row]);
  }

  const todayStart = startOfDay(now);
  const windowStart = subDays(todayStart, windowDays - 1);
  const windowEnd = addDays(todayStart, 1);

  const countsByDay = new Map<string, number>();
  const expectedDays = new Set<string>();
  let allTimeCompletions = 0;
  for (const row of trackedRows) {
    for (const endIso of itemCompletionEnds(row, planners, rowsByPlanner, now)) {
      const end = new Date(endIso);
      if (isNaN(end.getTime())) continue;
      allTimeCompletions++;
      const key = dayKeyOf(end);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
      expectedDays.add(key);
    }
    for (const key of itemExpectedDays(row, windowStart, windowEnd)) {
      expectedDays.add(key);
    }
  }

  // Engine-scheduled occurrences of tracked flexible items (the node may be a
  // leaf of a tracked goal — resolve through the parent chain).
  const resolvesToTracked = (nodeId: string): boolean => {
    let current = plannerById.get(nodeId);
    const guard = new Set<string>();
    while (current) {
      if (trackedRootIds.has(current.id)) return true;
      if (!current.parentId || guard.has(current.id)) return false;
      guard.add(current.id);
      current = plannerById.get(current.parentId);
    }
    return false;
  };
  for (const event of scheduledEvents) {
    if (!isRecurrenceOccurrenceId(event.id)) continue;
    if (!resolvesToTracked(plannerIdFromEventId(event.id))) continue;
    const start = new Date(event.start);
    if (isNaN(start.getTime())) continue;
    expectedDays.add(dayKeyOf(start));
  }

  const days: HabitDayCell[] = [];
  let totalCompletions = 0;
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = subDays(todayStart, i);
    const dayKey = dayKeyOf(date);
    const completedCount = countsByDay.get(dayKey) ?? 0;
    totalCompletions += completedCount;
    days.push({
      dayKey,
      date,
      completedCount,
      expected: expectedDays.has(dayKey),
    });
  }

  const recurringRows = trackedRows.filter(plannerHasFlexibleRecurrence);
  const period =
    recurringRows.length === 1 && trackedRows.length === 1
      ? periodStatsFor(recurringRows[0], planners, rowsByPlanner, now)
      : null;

  return { days, totalCompletions, allTimeCompletions, period };
}

// Lays the day window out as week rows for the month grid: cells padded to
// whole weeks aligned on the user's week start, oldest week first. Pad cells
// are null (rendered invisible).
export function habitGridWeeks(
  days: HabitDayCell[],
  weekStartDay: WeekDayIntegers,
): (HabitDayCell | null)[][] {
  if (days.length === 0) return [];
  const lead = (getDay(days[0].date) - weekStartDay + 7) % 7;
  const cells: (HabitDayCell | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (HabitDayCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// The occurrence key a plan check-off uses for a given occurrence start —
// shared by the calendar popover and any habit surface that wants to log one.
export function planCheckOffKey(start: Date): string {
  return occurrenceKey(start);
}
