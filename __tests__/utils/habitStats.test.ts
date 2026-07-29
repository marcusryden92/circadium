import {
  computeHabitTrackerStats,
  habitGridWeeks,
} from "@/utils/habits/habitStats";
import type {
  Habit,
  HabitItem,
  OccurrenceCompletion,
  Planner,
} from "@/types/prisma";

// Tracker statistics derive from the completion signals of the items assigned
// to the habit. Period-based consistency (rate/streaks) uses the SAME period
// model the engine schedules (enumerateRecurrencePeriods) and is graded only
// for a single tracked recurring item; the month grid counts completions per
// local day across every tracked item.

const USER_ID = "u";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    userId: USER_ID,
    name: "Meditate",
    color: null,
    bucketId: null,
    sortOrder: 0,
    createdAt: "2026-01-05T08:00:00.000Z",
    updatedAt: "2026-01-05T08:00:00.000Z",
    ...overrides,
  };
}

function link(habitId: string, plannerId: string): HabitItem {
  return {
    id: `link-${habitId}-${plannerId}`,
    habitId,
    plannerId,
    userId: USER_ID,
    createdAt: "2026-01-05T08:00:00.000Z",
  };
}

function makePlanner(id: string, overrides: Partial<Planner> = {}): Planner {
  return {
    id,
    title: id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 30,
    deadline: null,
    starts: null,
    recurrence: JSON.stringify({ freq: "weekly", interval: 1 }),
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 5,
    userId: USER_ID,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: "2026-01-05T08:00:00.000Z", // a Monday
    updatedAt: "2026-01-05T08:00:00.000Z",
    ...overrides,
  };
}

function completion(
  plannerId: string,
  occurrenceKey: string,
  endIso?: string,
): OccurrenceCompletion {
  return {
    id: `c-${plannerId}-${occurrenceKey}`,
    plannerId,
    userId: USER_ID,
    occurrenceKey,
    start: endIso ?? `${occurrenceKey}:00.000Z`,
    end: endIso ?? `${occurrenceKey}:00.000Z`,
    createdAt: "2026-01-05T08:00:00.000Z",
  };
}

describe("computeHabitTrackerStats — single recurring item", () => {
  const habit = makeHabit();
  const task = makePlanner("task-1");
  const items = [link(habit.id, task.id)];

  it("counts completed / missed / pending and derives streaks + rate", () => {
    // Weekly, Monday-aligned. now = Mon Feb 2 12:00 -> periods W0..W4, W4
    // current.
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("task-1", "2026-01-05T00:00"), // W0 completed
      completion("task-1", "2026-01-12T00:00"), // W1 completed
      // W2 (2026-01-19) missed
      completion("task-1", "2026-01-26T00:00"), // W3 completed
      // W4 (2026-02-02) pending
    ];

    const stats = computeHabitTrackerStats({
      habit,
      habitItems: items,
      planners: [task],
      completions,
      now,
    });

    expect(stats.period).not.toBeNull();
    expect(stats.period!.completedCount).toBe(3);
    expect(stats.period!.missedCount).toBe(1);
    expect(stats.period!.pendingCount).toBe(1);
    expect(stats.period!.completionRate).toBeCloseTo(0.75);
    // Most recent elapsed period (W3) completed, but W2 before it missed.
    expect(stats.period!.currentStreak).toBe(1);
    // W0,W1 back-to-back is the longest run.
    expect(stats.period!.longestStreak).toBe(2);
    // History is most-recent first, one entry per enumerated period.
    expect(stats.period!.history).toHaveLength(5);
    expect(stats.period!.history[0].status).toBe("pending");
    expect(stats.period!.history[0].key).toBe("2026-02-02T00:00");
    expect(stats.allTimeCompletions).toBe(3);
  });

  it("is all-zero for a brand-new habit with only a pending period", () => {
    const now = new Date("2026-01-05T12:00:00.000Z");
    const stats = computeHabitTrackerStats({
      habit,
      habitItems: items,
      planners: [task],
      completions: [],
      now,
    });

    expect(stats.period!.completedCount).toBe(0);
    expect(stats.period!.missedCount).toBe(0);
    expect(stats.period!.pendingCount).toBe(1);
    expect(stats.period!.completionRate).toBe(0);
    expect(stats.period!.currentStreak).toBe(0);
    expect(stats.totalCompletions).toBe(0);
  });

  it("fills the day grid with completion counts on their end days", () => {
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("task-1", "2026-01-26T00:00", "2026-01-28T10:00:00.000Z"),
    ];
    const stats = computeHabitTrackerStats({
      habit,
      habitItems: items,
      planners: [task],
      completions,
      now,
    });
    const cell = stats.days.find((d) => d.dayKey === "2026-01-28");
    expect(cell?.completedCount).toBe(1);
    expect(stats.totalCompletions).toBe(1);
    expect(stats.days).toHaveLength(30);
    expect(stats.days[stats.days.length - 1].dayKey).toBe("2026-02-02");
  });
});

describe("computeHabitTrackerStats — item shapes", () => {
  it("a multi-item habit gets day counts but no period grading", () => {
    const habit = makeHabit();
    const taskA = makePlanner("task-a");
    const taskB = makePlanner("task-b");
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("task-a", "2026-01-26T00:00", "2026-02-01T09:00:00.000Z"),
      completion("task-b", "2026-01-26T00:00", "2026-02-01T18:00:00.000Z"),
    ];

    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, taskA.id), link(habit.id, taskB.id)],
      planners: [taskA, taskB],
      completions,
      now,
    });
    expect(stats.period).toBeNull();
    const cell = stats.days.find((d) => d.dayKey === "2026-02-01");
    expect(cell?.completedCount).toBe(2);
  });

  it("plan check-offs and one-off completions count on their days", () => {
    const habit = makeHabit();
    const plan = makePlanner("plan-1", {
      plannerType: "plan",
      recurrence: null,
      starts: "2026-01-27T18:00:00.000Z",
    });
    const oneOff = makePlanner("task-done", {
      recurrence: null,
      completedStartTime: "2026-01-29T10:00:00.000Z",
      completedEndTime: "2026-01-29T11:00:00.000Z",
    });
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("plan-1", "2026-01-27T18:00", "2026-01-27T19:00:00.000Z"),
    ];

    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, plan.id), link(habit.id, oneOff.id)],
      planners: [plan, oneOff],
      completions,
      now,
    });
    expect(stats.days.find((d) => d.dayKey === "2026-01-27")?.completedCount).toBe(1);
    expect(stats.days.find((d) => d.dayKey === "2026-01-29")?.completedCount).toBe(1);
  });

  it("a recurring goal's period completes only when EVERY leaf is logged", () => {
    const habit = makeHabit();
    const goal = makePlanner("goal-1", { plannerType: "goal" });
    const leafA = makePlanner("leaf-a", { parentId: "goal-1", recurrence: null });
    const leafB = makePlanner("leaf-b", { parentId: "goal-1", recurrence: null });
    const planners = [goal, leafA, leafB];
    const now = new Date("2026-01-19T12:00:00.000Z"); // W0 elapsed, W1 elapsed, W2 current

    // W0: both leaves logged -> completed on the later end day. W1: only one.
    const completions = [
      completion("leaf-a", "2026-01-05T00:00", "2026-01-06T10:00:00.000Z"),
      completion("leaf-b", "2026-01-05T00:00", "2026-01-07T10:00:00.000Z"),
      completion("leaf-a", "2026-01-12T00:00", "2026-01-13T10:00:00.000Z"),
    ];

    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, goal.id)],
      planners,
      completions,
      now,
    });

    expect(stats.period).not.toBeNull();
    expect(stats.period!.completedCount).toBe(1);
    expect(stats.period!.missedCount).toBe(1);
    expect(stats.period!.pendingCount).toBe(1);
    // The goal-period completion lands on the day the LAST leaf was logged.
    expect(stats.days.find((d) => d.dayKey === "2026-01-07")?.completedCount).toBe(1);
    expect(stats.days.find((d) => d.dayKey === "2026-01-06")?.completedCount).toBe(0);
  });

  it("marks expected days: completions yes, other days of a weekly rule no", () => {
    const habit = makeHabit();
    const task = makePlanner("task-1");
    const now = new Date("2026-02-02T12:00:00.000Z");
    const completions = [
      completion("task-1", "2026-01-26T00:00", "2026-01-28T10:00:00.000Z"),
    ];
    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, task.id)],
      planners: [task],
      completions,
      now,
    });
    // A weekly rule's period spans 7 days — the occurrence day is only known
    // where something concrete happened.
    expect(stats.days.find((d) => d.dayKey === "2026-01-28")?.expected).toBe(
      true,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-01-29")?.expected).toBe(
      false,
    );
  });

  it("a daily rule expects every covered day; skipped periods gray out", () => {
    const habit = makeHabit();
    const task = makePlanner("task-1", {
      recurrence: JSON.stringify({ freq: "daily", interval: 1 }),
      recurrenceExceptions: JSON.stringify([
        { type: "deleted", key: "2026-01-20T00:00" },
      ]),
    });
    const now = new Date("2026-02-02T12:00:00.000Z");
    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, task.id)],
      planners: [task],
      completions: [],
      now,
    });
    // Window opens Jan 4; the item was created Jan 5, so day one is off.
    expect(stats.days.find((d) => d.dayKey === "2026-01-04")?.expected).toBe(
      false,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-01-05")?.expected).toBe(
      true,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-02-02")?.expected).toBe(
      true,
    );
    // The deleted occurrence's day is not trackable.
    expect(stats.days.find((d) => d.dayKey === "2026-01-20")?.expected).toBe(
      false,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-01-21")?.expected).toBe(
      true,
    );
  });

  it("a recurring plan expects exactly its occurrence days", () => {
    const habit = makeHabit();
    const plan = makePlanner("plan-1", {
      plannerType: "plan",
      starts: "2026-01-06T18:00:00.000Z", // a Tuesday
      recurrence: JSON.stringify({ freq: "weekly", interval: 1 }),
    });
    const now = new Date("2026-02-02T12:00:00.000Z");
    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, plan.id)],
      planners: [plan],
      completions: [],
      now,
    });
    expect(stats.days.find((d) => d.dayKey === "2026-01-13")?.expected).toBe(
      true,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-01-27")?.expected).toBe(
      true,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-01-14")?.expected).toBe(
      false,
    );
  });

  it("an engine-scheduled occurrence marks its day expected", () => {
    const habit = makeHabit();
    const task = makePlanner("task-1");
    const now = new Date("2026-02-02T12:00:00.000Z");
    const stats = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, task.id)],
      planners: [task],
      completions: [],
      now,
      scheduledEvents: [
        { id: "task-1|2026-02-02T00:00", start: "2026-02-02T10:00:00.000Z" },
        // Chunk/segment ids never match the occurrence shape.
        { id: "task-1|chunk:1", start: "2026-01-30T10:00:00.000Z" },
      ],
    });
    expect(stats.days.find((d) => d.dayKey === "2026-02-02")?.expected).toBe(
      true,
    );
    expect(stats.days.find((d) => d.dayKey === "2026-01-30")?.expected).toBe(
      false,
    );
  });

  it("lays the window out as week rows aligned on the week start", () => {
    const habit = makeHabit();
    const task = makePlanner("task-1");
    const now = new Date("2026-02-02T12:00:00.000Z"); // a Monday
    const { days } = computeHabitTrackerStats({
      habit,
      habitItems: [link(habit.id, task.id)],
      planners: [task],
      completions: [],
      now,
    });

    // Window: Sun Jan 4 .. Mon Feb 2. Monday start -> 6 leading pads, 6 rows.
    const mondayWeeks = habitGridWeeks(days, 1);
    expect(mondayWeeks).toHaveLength(6);
    expect(mondayWeeks[0].slice(0, 6)).toEqual(Array(6).fill(null));
    expect(mondayWeeks[0][6]?.dayKey).toBe("2026-01-04");
    expect(mondayWeeks[5][0]?.dayKey).toBe("2026-02-02");
    expect(mondayWeeks[5].slice(1)).toEqual(Array(6).fill(null));

    // Sunday start -> no leading pad, 5 rows.
    const sundayWeeks = habitGridWeeks(days, 0);
    expect(sundayWeeks).toHaveLength(5);
    expect(sundayWeeks[0][0]?.dayKey).toBe("2026-01-04");
    expect(sundayWeeks[4][1]?.dayKey).toBe("2026-02-02");
    for (const week of sundayWeeks) expect(week).toHaveLength(7);
  });

  it("counts a completion regardless of earliestStartDate (key stability)", () => {
    // Biweekly. The period grid is anchored to the immutable createdAt, so
    // editing earliestStartDate (even into a different week) must not re-key
    // the log and strand the completion.
    const habit = makeHabit();
    const now = new Date("2026-02-09T12:00:00.000Z");
    const rows = [completion("task-1", "2026-01-19T00:00")];
    const base = makePlanner("task-1", {
      recurrence: JSON.stringify({ freq: "weekly", interval: 2 }),
    });
    const shifted = makePlanner("task-1", {
      recurrence: JSON.stringify({ freq: "weekly", interval: 2 }),
      earliestStartDate: "2026-01-12T00:00:00.000Z",
    });
    const items = [link(habit.id, "task-1")];

    expect(
      computeHabitTrackerStats({
        habit,
        habitItems: items,
        planners: [base],
        completions: rows,
        now,
      }).period!.completedCount,
    ).toBe(1);
    expect(
      computeHabitTrackerStats({
        habit,
        habitItems: items,
        planners: [shifted],
        completions: rows,
        now,
      }).period!.completedCount,
    ).toBe(1);
  });
});
