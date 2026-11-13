import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { dayKeyLocal, serializeTaskSplitting } from "@/utils/taskSplitting";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";

// Goal daily cap: a goal root with maxMinutesPerDay has its whole subtree
// metered against one per-day ledger — plain leaves spread across days, a
// split leaf composes the goal budget with its own, an oversized leaf places
// whole with a GOAL_DAY_CAP_RELAXED row, completed history seeds the ledger,
// and an idle regen re-emits identical events.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";

const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  createdAt: FAKE_TODAY.toISOString(),
  updatedAt: FAKE_TODAY.toISOString(),
})) as unknown as EventTemplate[];

function makePlanner(id: string, overrides: Partial<Planner>): Planner {
  const ts = FAKE_TODAY.toISOString();
  return {
    id,
    title: id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: null,
    recurrence: null,
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
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function run(planners: Planner[], previousCalendar: SimpleEvent[] = []) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, previousCalendar, {
    categories: [],
    injectTravelEvents: false,
  });
}

function eventMinutes(e: SimpleEvent): number {
  return Math.round(
    (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000,
  );
}

function subtreeEvents(
  events: SimpleEvent[],
  leafIds: string[],
): SimpleEvent[] {
  const ids = new Set(leafIds);
  return events.filter((e) => ids.has(plannerIdFromEventId(e.id)));
}

function minutesPerDay(events: SimpleEvent[]): Map<string, number> {
  const perDay = new Map<string, number>();
  for (const e of events) {
    const key = dayKeyLocal(new Date(e.start));
    perDay.set(key, (perDay.get(key) ?? 0) + eventMinutes(e));
  }
  return perDay;
}

let consoleSpies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  jest.setSystemTime(FAKE_TODAY);
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "info").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  jest.useRealTimers();
});

describe("goal daily cap", () => {
  it("spreads plain leaves so no day exceeds the cap, preserving leaf order", () => {
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 120,
    });
    const leaves = ["leaf-1", "leaf-2", "leaf-3"].map((id, i) =>
      makePlanner(id, {
        parentId: "goal",
        duration: 60,
        sortOrder: (i + 1) * 1024,
      }),
    );

    const { events, messages } = run([goal, ...leaves]);

    const placed = subtreeEvents(events, ["leaf-1", "leaf-2", "leaf-3"]);
    expect(placed).toHaveLength(3);
    expect(placed.reduce((sum, e) => sum + eventMinutes(e), 0)).toBe(180);

    const perDay = minutesPerDay(placed);
    perDay.forEach((minutes) => {
      expect(minutes).toBeLessThanOrEqual(120);
    });
    expect(perDay.size).toBeGreaterThanOrEqual(2);

    const byId = new Map(placed.map((e) => [e.id, e]));
    expect(new Date(byId.get("leaf-2")!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.get("leaf-1")!.end).getTime(),
    );
    expect(new Date(byId.get("leaf-3")!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.get("leaf-2")!.end).getTime(),
    );

    expect(messages.filter((m) => m.type === "GOAL_DAY_CAP_RELAXED")).toEqual(
      [],
    );
  });

  it("composes a split leaf's own day cap with the goal cap and shares the ledger with plain siblings", () => {
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 60,
    });
    const splitLeaf = makePlanner("split-leaf", {
      parentId: "goal",
      duration: 180,
      sortOrder: 1024,
      splitting: serializeTaskSplitting({
        minMinutes: 30,
        maxMinutes: 60,
        maxMinutesPerDay: 90,
      }),
    });
    const sibling = makePlanner("sibling", {
      parentId: "goal",
      duration: 60,
      sortOrder: 2048,
    });

    const { events } = run([goal, splitLeaf, sibling]);

    const placed = subtreeEvents(events, ["split-leaf", "sibling"]);
    expect(placed.reduce((sum, e) => sum + eventMinutes(e), 0)).toBe(240);

    // The goal cap (60) wins over the split leaf's own cap (90), and the
    // plain sibling counts against the same per-day ledger.
    const perDay = minutesPerDay(placed);
    perDay.forEach((minutes) => {
      expect(minutes).toBeLessThanOrEqual(60);
    });
    expect(perDay.size).toBeGreaterThanOrEqual(4);
  });

  it("places an oversized leaf whole and surfaces the compromise while siblings stay capped", () => {
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 60,
    });
    const big = makePlanner("big", {
      parentId: "goal",
      duration: 180,
      sortOrder: 1024,
    });
    const smalls = ["small-1", "small-2"].map((id, i) =>
      makePlanner(id, {
        parentId: "goal",
        duration: 60,
        sortOrder: (i + 2) * 1024,
      }),
    );

    const { events, messages } = run([goal, big, ...smalls]);

    const placed = subtreeEvents(events, ["big", "small-1", "small-2"]);
    expect(placed).toHaveLength(3);
    const bigEvent = placed.find((e) => e.id === "big")!;
    expect(eventMinutes(bigEvent)).toBe(180);

    // Every day except the oversized block's stays within the cap.
    const others = placed.filter((e) => e.id !== "big");
    const perDay = minutesPerDay(others);
    const bigDay = dayKeyLocal(new Date(bigEvent.start));
    perDay.forEach((minutes, day) => {
      expect(minutes).toBeLessThanOrEqual(60);
      expect(day).not.toBe(bigDay);
    });

    const relaxed = messages.filter((m) => m.type === "GOAL_DAY_CAP_RELAXED");
    expect(relaxed).toHaveLength(1);
    expect(relaxed[0].payload).toMatchObject({
      plannerId: "goal",
      kind: "oversizedLeaf",
      affectedCount: 1,
      totalMinutes: 180,
      capMinutes: 60,
    });
  });

  it("seeds the ledger from a leaf completed today so siblings avoid the spent day", () => {
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 120,
    });
    const done = makePlanner("done-leaf", {
      parentId: "goal",
      duration: 90,
      sortOrder: 1024,
      completedStartTime: new Date("2026-01-05T06:00:00").toISOString(),
      completedEndTime: new Date("2026-01-05T07:30:00").toISOString(),
    });
    const todo = makePlanner("todo-leaf", {
      parentId: "goal",
      duration: 60,
      sortOrder: 2048,
    });

    const { events } = run([goal, done, todo]);

    const completedEvent = events.find(
      (e) => plannerIdFromEventId(e.id) === "done-leaf",
    );
    expect(completedEvent).toBeDefined();

    // 90 of today's 120 minutes are already spent — a 60-minute sibling
    // cannot fit today and must land on a later day.
    const todoEvent = events.find((e) => e.id === "todo-leaf");
    expect(todoEvent).toBeDefined();
    expect(dayKeyLocal(new Date(todoEvent!.start))).not.toBe(
      dayKeyLocal(FAKE_TODAY),
    );
  });

  it("re-emits identical events on an idle regen", () => {
    const goal = makePlanner("goal", {
      plannerType: "goal",
      duration: 0,
      maxMinutesPerDay: 120,
    });
    const leaves = ["leaf-1", "leaf-2", "leaf-3"].map((id, i) =>
      makePlanner(id, {
        parentId: "goal",
        duration: 60,
        sortOrder: (i + 1) * 1024,
      }),
    );
    const planners = [goal, ...leaves];

    const first = run(planners);
    const second = run(planners, first.events);

    const snapshot = (events: SimpleEvent[]) =>
      subtreeEvents(events, ["leaf-1", "leaf-2", "leaf-3"])
        .map((e) => ({ id: e.id, start: e.start, end: e.end }))
        .sort((a, b) => a.id.localeCompare(b.id));

    expect(snapshot(second.events)).toEqual(snapshot(first.events));
  });
});
