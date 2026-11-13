import type { OccurrenceCompletion, Planner } from "@/types/prisma";
import {
  buildRecurringInstances,
  manualCompletionWindow,
} from "@/utils/recurringInstances";

// Fixed "now" so the createdAt-anchored daily grid is deterministic: an item
// created Jan 1 has periods Jan 1..Jan 5 (current) at this instant.
const NOW = new Date("2026-01-05T12:00:00");

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
    recurrence: JSON.stringify({ freq: "daily", interval: 1 }),
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
    userId: "u",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: "2026-01-01T09:00:00",
    updatedAt: "2026-01-01T09:00:00",
    ...overrides,
  } as Planner;
}

function comp(
  plannerId: string,
  occurrenceKey: string,
  end: string,
): OccurrenceCompletion {
  return {
    id: `${plannerId}-${occurrenceKey}`,
    plannerId,
    userId: "u",
    occurrenceKey,
    start: end,
    end,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as OccurrenceCompletion;
}

const K = (d: number) => `2026-01-0${d}T00:00`;

describe("buildRecurringInstances", () => {
  it("grades a daily task's periods most-recent-first", () => {
    const task = makePlanner("t");
    const completions = [comp("t", K(3), "2026-01-03T10:30:00.000Z")];

    const instances = buildRecurringInstances({
      item: task,
      planners: [task],
      completions,
      now: NOW,
    });

    expect(instances.map((i) => i.key)).toEqual([
      K(5),
      K(4),
      K(3),
      K(2),
      K(1),
    ]);
    expect(instances.map((i) => i.status)).toEqual([
      "pending", // current period, still open
      "missed",
      "completed",
      "missed",
      "missed",
    ]);
    const done = instances.find((i) => i.key === K(3))!;
    expect(done.completedAt?.toISOString()).toBe("2026-01-03T10:30:00.000Z");
    expect(done.doneLeaves).toBe(1);
    expect(done.totalLeaves).toBe(1);
  });

  it("honors the limit (most recent N)", () => {
    const task = makePlanner("t");
    const instances = buildRecurringInstances({
      item: task,
      planners: [task],
      completions: [],
      now: NOW,
      limit: 2,
    });
    expect(instances.map((i) => i.key)).toEqual([K(5), K(4)]);
  });

  it("includes upcoming periods within the horizon, current-first then history", () => {
    const task = makePlanner("t");
    const completions = [comp("t", K(3), "2026-01-03T10:30:00.000Z")];

    const instances = buildRecurringInstances({
      item: task,
      planners: [task],
      completions,
      now: NOW,
      horizonDays: 2,
    });

    // Current + future ascending, then elapsed periods descending.
    expect(instances.map((i) => i.key)).toEqual([
      K(5),
      K(6),
      K(7),
      K(4),
      K(3),
      K(2),
      K(1),
    ]);
    expect(instances.map((i) => i.status)).toEqual([
      "pending", // current period, still open
      "upcoming",
      "upcoming",
      "missed",
      "completed",
      "missed",
      "missed",
    ]);
  });

  it("surfaces a freshly created recurring goal's upcoming instances (calendar parity)", () => {
    const goal = makePlanner("g", {
      plannerType: "goal",
      createdAt: "2026-01-05T08:00:00",
      updatedAt: "2026-01-05T08:00:00",
    });
    const leafA = makePlanner("a", { parentId: "g", recurrence: null });

    const instances = buildRecurringInstances({
      item: goal,
      planners: [goal, leafA],
      completions: [],
      now: NOW,
      horizonDays: 3,
    });

    // Before the horizon fix this returned only the current period (one row)
    // while the calendar showed several forecast tiles.
    expect(instances.map((i) => i.key)).toEqual([K(5), K(6), K(7), K(8)]);
    expect(instances.map((i) => i.status)).toEqual([
      "pending",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("completes a goal period only when every leaf is logged", () => {
    const goal = makePlanner("g", { plannerType: "goal" });
    const leafA = makePlanner("a", {
      parentId: "g",
      recurrence: null,
    });
    const leafB = makePlanner("b", {
      parentId: "g",
      recurrence: null,
    });
    const planners = [goal, leafA, leafB];

    const onlyA = buildRecurringInstances({
      item: goal,
      planners,
      completions: [comp("a", K(3), "2026-01-03T09:00:00.000Z")],
      now: NOW,
    });
    const partial = onlyA.find((i) => i.key === K(3))!;
    expect(partial.status).toBe("missed");
    expect(partial.doneLeaves).toBe(1);
    expect(partial.totalLeaves).toBe(2);

    const both = buildRecurringInstances({
      item: goal,
      planners,
      completions: [
        comp("a", K(3), "2026-01-03T09:00:00.000Z"),
        comp("b", K(3), "2026-01-03T10:00:00.000Z"),
      ],
      now: NOW,
    });
    const full = both.find((i) => i.key === K(3))!;
    expect(full.status).toBe("completed");
    expect(full.completedAt?.toISOString()).toBe("2026-01-03T10:00:00.000Z");
  });

  it("returns nothing for a non-recurring item", () => {
    const task = makePlanner("t", { recurrence: null });
    expect(
      buildRecurringInstances({
        item: task,
        planners: [task],
        completions: [],
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("manualCompletionWindow", () => {
  it("ends at now for the open period, back-dated by the duration", () => {
    const period = {
      start: new Date("2026-01-05T00:00:00"),
      end: new Date("2026-01-06T00:00:00"),
    };
    const { start, end } = manualCompletionWindow(period, 30, NOW);
    expect(new Date(end).getTime()).toBe(NOW.getTime());
    expect(new Date(start).getTime()).toBe(NOW.getTime() - 30 * 60_000);
  });

  it("ends at the period close for an elapsed period", () => {
    const period = {
      start: new Date("2026-01-03T00:00:00"),
      end: new Date("2026-01-04T00:00:00"),
    };
    const { start, end } = manualCompletionWindow(period, 45, NOW);
    expect(new Date(end).getTime()).toBe(period.end.getTime());
    expect(new Date(start).getTime()).toBe(
      period.end.getTime() - 45 * 60_000,
    );
  });
});
