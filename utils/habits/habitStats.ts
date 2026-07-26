import { Planner, HabitCompletion } from "@/types/prisma";
import { enumerateHabitPeriods } from "./habitPeriods";

// Derives a habit's consistency stats from its recurrence + the completion log,
// using the SAME period model the engine schedules against (enumerateHabitPeriods)
// so "which periods exist" never disagrees. A period is completed if the log has
// a row for it, missed if it has fully elapsed with no row, or pending if it is
// the current (not-yet-ended) period.

export type HabitPeriodStatus = "completed" | "missed" | "pending";

export interface HabitPeriodEntry {
  key: string;
  start: string;
  end: string;
  status: HabitPeriodStatus;
  completion?: { start: string; end: string };
}

export interface HabitStats {
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

export function computeHabitStats(args: {
  habit: Planner;
  completions: HabitCompletion[];
  now: Date;
}): HabitStats {
  const { habit, completions, now } = args;

  const completionByKey = new Map(
    completions
      .filter((c) => c.plannerId === habit.id)
      .map((c) => [c.occurrenceKey, c]),
  );

  // Periods whose start is before now: every elapsed period plus the current
  // one (its start <= now). Future periods are excluded.
  const periods = enumerateHabitPeriods({ habit, until: now });

  const entries: HabitPeriodEntry[] = periods.map((period) => {
    const completion = completionByKey.get(period.key);
    let status: HabitPeriodStatus;
    if (completion) status = "completed";
    else if (period.end <= now) status = "missed";
    else status = "pending";
    return {
      key: period.key,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      status,
      completion: completion
        ? { start: completion.start, end: completion.end }
        : undefined,
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
