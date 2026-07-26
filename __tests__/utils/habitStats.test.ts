import { computeHabitStats } from "@/utils/habits/habitStats";
import type { Planner, HabitCompletion } from "@/types/prisma";

// Habit statistics derive from the recurrence + completion log against the same
// period model the engine schedules (enumerateHabitPeriods), so counts, streaks
// and rate line up with what actually got placed and completed.

function makeHabit(overrides: Partial<Planner> = {}): Planner {
  return {
    id: "habit-1",
    plannerType: "habit",
    recurrence: JSON.stringify({ freq: "weekly", interval: 1 }),
    earliestStartDate: null,
    createdAt: "2026-01-05T08:00:00.000Z", // a Monday
    ...overrides,
  } as unknown as Planner;
}

function completion(occurrenceKey: string): HabitCompletion {
  return {
    id: `c-${occurrenceKey}`,
    plannerId: "habit-1",
    userId: "u",
    occurrenceKey,
    start: `${occurrenceKey}:00.000Z`,
    end: `${occurrenceKey}:00.000Z`,
    createdAt: "2026-01-05T08:00:00.000Z",
  } as HabitCompletion;
}

describe("computeHabitStats", () => {
  it("counts completed / missed / pending and derives streaks + rate", () => {
    // Weekly, Monday-aligned. now = Mon Feb 2 12:00 → periods W0..W4, W4 current.
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("2026-01-05T00:00"), // W0 completed
      completion("2026-01-12T00:00"), // W1 completed
      // W2 (2026-01-19) missed
      completion("2026-01-26T00:00"), // W3 completed
      // W4 (2026-02-02) pending
    ];

    const stats = computeHabitStats({
      habit: makeHabit(),
      completions,
      now,
    });

    expect(stats.completedCount).toBe(3);
    expect(stats.missedCount).toBe(1);
    expect(stats.pendingCount).toBe(1);
    expect(stats.completionRate).toBeCloseTo(0.75);
    // Most recent elapsed period (W3) completed, but W2 before it missed.
    expect(stats.currentStreak).toBe(1);
    // W0,W1 back-to-back is the longest run.
    expect(stats.longestStreak).toBe(2);
    // History is most-recent first, one entry per enumerated period.
    expect(stats.history).toHaveLength(5);
    expect(stats.history[0].status).toBe("pending");
    expect(stats.history[0].key).toBe("2026-02-02T00:00");
  });

  it("is all-zero for a brand-new habit with only a pending period", () => {
    const now = new Date("2026-01-05T12:00:00.000Z");
    const stats = computeHabitStats({
      habit: makeHabit(),
      completions: [],
      now,
    });

    expect(stats.completedCount).toBe(0);
    expect(stats.missedCount).toBe(0);
    expect(stats.pendingCount).toBe(1);
    expect(stats.completionRate).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
  });

  it("counts an unbroken run as the current streak", () => {
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("2026-01-05T00:00"),
      completion("2026-01-12T00:00"),
      completion("2026-01-19T00:00"),
      completion("2026-01-26T00:00"),
    ];
    const stats = computeHabitStats({
      habit: makeHabit(),
      completions,
      now,
    });
    // Four elapsed periods all completed (W4 pending doesn't break it).
    expect(stats.currentStreak).toBe(4);
    expect(stats.longestStreak).toBe(4);
    expect(stats.completionRate).toBe(1);
  });

  it("counts a completion regardless of earliestStartDate (regression #7)", () => {
    // Biweekly. The period grid is anchored to the immutable createdAt, so
    // editing earliestStartDate (even into a different week) must not re-key
    // the log and strand the completion.
    const now = new Date("2026-02-09T12:00:00.000Z");
    const rows = [completion("2026-01-19T00:00")]; // biweekly period 1
    const base = makeHabit({
      recurrence: JSON.stringify({ freq: "weekly", interval: 2 }),
    });
    const shifted = makeHabit({
      recurrence: JSON.stringify({ freq: "weekly", interval: 2 }),
      earliestStartDate: "2026-01-12T00:00:00.000Z", // a week after createdAt
    });

    expect(computeHabitStats({ habit: base, completions: rows, now }).completedCount).toBe(1);
    expect(computeHabitStats({ habit: shifted, completions: rows, now }).completedCount).toBe(1);
  });

  it("surfaces present-day history for a >400-day-old daily habit (regression #2)", () => {
    const now = new Date("2026-02-02T12:00:00.000Z");
    const old = makeHabit({
      recurrence: JSON.stringify({ freq: "daily", interval: 1 }),
      createdAt: "2024-11-01T08:00:00.000Z",
    });

    const stats = computeHabitStats({ habit: old, completions: [], now });
    expect(stats.history.length).toBeGreaterThan(0);
    const mostRecentEnd = new Date(stats.history[0].end);
    const daysStale = (now.getTime() - mostRecentEnd.getTime()) / 86400000;
    expect(daysStale).toBeLessThan(2);
  });
});
