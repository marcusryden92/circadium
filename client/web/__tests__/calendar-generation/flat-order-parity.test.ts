import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import { serializeTaskSplitting } from "@/utils/taskSplitting";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  Queue,
  SimpleEvent,
} from "@/types/prisma";

// Behavior-parity guards for the flat-order scheduler: properties the old
// goal-at-a-time candidate walk provided that the leaf-Kahn loop must keep.
// Each test discriminates against a concrete regression: constrained items
// losing first pick, split partial passes dropping their chain end, zero-leaf
// queue members resolving unbounded, and a root task's own duration vanishing
// behind its children.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const MONDAY = 1;

const makeSleepTemplates = (
  startTime: string,
  duration: number,
): EventTemplate[] =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    id: `sleep-${d}`,
    title: "Sleep",
    startDay: d,
    startTime,
    duration,
    userId: USER_ID,
    color: null,
    locationId: null,
    createdAt: FAKE_TODAY.toISOString(),
    updatedAt: FAKE_TODAY.toISOString(),
  })) as unknown as EventTemplate[];

// Free 06:00-22:00 daily — the detour-splice harness fabric.
const SLEEP_TEMPLATES = makeSleepTemplates("22:00", 480);

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

const startMs = (e: SimpleEvent) => new Date(e.start).getTime();
const endMs = (e: SimpleEvent) => new Date(e.end).getTime();

function eventFor(events: SimpleEvent[], leafId: string): SimpleEvent {
  const e = events.find((ev) => plannerIdFromEventId(ev.id) === leafId);
  if (!e) throw new Error(`no event for ${leafId}`);
  return e;
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

describe("flat-order parity", () => {
  it("gives a category-constrained item first pick over higher-scored unconstrained work", () => {
    // Placement starts five minutes before the only soft window, so the
    // window's start is the earliest usable slot for both tasks. The
    // unconstrained higher-priority task would grab it if it picked first,
    // leaving the constrained task nowhere to go this week — the constrained
    // tier must pick first.
    jest.setSystemTime(new Date("2026-01-05T09:55:00"));
    const templates = makeSleepTemplates("22:00", 720); // free 10:00-22:00
    const windowRow: CategoryTimeWindow = {
      id: "win-1",
      day: MONDAY,
      startTime: "10:00",
      endTime: "12:00",
      recurrenceExceptions: null,
      categoryId: "cat-deep",
      userId: USER_ID,
    };
    const category: Category = {
      id: "cat-deep",
      name: "Deep work",
      icon: null,
      color: null,
      sortOrder: 0,
      useTimeWindows: true,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: null,
      parentId: null,
      userId: USER_ID,
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
      timeSlots: [windowRow],
    };

    const constrained = makePlanner("constrained", {
      duration: 100,
      priority: 1,
      categoryId: "cat-deep",
    });
    const unconstrained = makePlanner("unconstrained", {
      duration: 60,
      priority: 7,
    });

    const { events } = generateCalendar(
      USER_ID,
      1,
      templates,
      [constrained, unconstrained],
      [],
      { categories: [category], injectTravelEvents: false },
    );

    const placed = eventFor(events, "constrained");
    const start = new Date(placed.start);
    // Inside THIS Monday's window — not bumped to next week by the
    // unconstrained task taking the window first.
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(5);
    expect(start.getHours()).toBe(10);
    expect(new Date(placed.end).getHours()).toBeLessThanOrEqual(12);
  });

  it("chains a successor after a split leaf's earlier-pass chunks when the leaf later fails permanently", () => {
    // Goal chain A -> P(split) -> B. P's allowed 80-minute daily block hosts
    // exactly one 60-minute chunk; the 90-minute remainder then exceeds the
    // allowed-block ceiling and fails TOO_LARGE on the next pass. B must
    // chain after the PLACED chunk's end, not after A alone — the
    // pass-through end accumulates partial placements across passes.
    const goal = makePlanner("goal", { plannerType: "goal", duration: 0 });
    const a = makePlanner("a", {
      parentId: "goal",
      duration: 60,
      sortOrder: 1024,
    });
    const split = makePlanner("p-split", {
      parentId: "goal",
      duration: 150,
      sortOrder: 2048,
      splitting: serializeTaskSplitting({
        minMinutes: 60,
        maxMinutes: 60,
        maxMinutesPerDay: null,
      }),
      allowedTimes: serializeAllowedTimes({
        days: null,
        ranges: [{ startTime: "10:00", endTime: "11:20" }],
      }),
    });
    // Small enough to fit the morning gap between A's end and the split
    // task's allowed block — where a dropped chain end would let it land.
    const b = makePlanner("b", {
      parentId: "goal",
      duration: 30,
      sortOrder: 3072,
    });

    const { events } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [goal, a, split, b],
      [],
      { categories: [], injectTravelEvents: false },
    );

    const chunks = events.filter(
      (e) => plannerIdFromEventId(e.id) === "p-split",
    );
    expect(chunks.length).toBeGreaterThan(0);
    // Chunks inherit the task's allowed times (the constraints map is copied
    // for the chunk's composite id) — every chunk sits inside 10:00-11:20.
    for (const chunk of chunks) {
      const s = new Date(chunk.start);
      const e = new Date(chunk.end);
      expect(s.getHours() * 60 + s.getMinutes()).toBeGreaterThanOrEqual(600);
      expect(e.getHours() * 60 + e.getMinutes()).toBeLessThanOrEqual(680);
    }
    expect(startMs(eventFor(events, "b"))).toBeGreaterThanOrEqual(
      Math.max(...chunks.map(endMs)),
    );
  });

  it("bounds a queue successor behind a member whose leaves are all completed", () => {
    // Queue [A, B, C] where B is a ready goal whose only leaf is already
    // completed. B resolves through the gate carrying A's end forward — C
    // must not jump the queue just because B had nothing left to place.
    const a = makePlanner("a", { duration: 60, priority: 1 });
    const bGoal = makePlanner("b-goal", { plannerType: "goal", duration: 0 });
    const bLeaf = makePlanner("b-leaf", {
      parentId: "b-goal",
      duration: 60,
      sortOrder: 1024,
      completedStartTime: "2026-01-02T10:00:00.000Z",
      completedEndTime: "2026-01-02T11:00:00.000Z",
    });
    const c = makePlanner("c", { duration: 60, priority: 7 });

    const queue: Queue = {
      id: "pipe",
      title: "pipe",
      sortOrder: 0,
      color: null,
      categoryId: null,
      userId: USER_ID,
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
      members: ["a", "b-goal", "c"].map((plannerId, i) => ({
        id: `m-${plannerId}`,
        sortOrder: (i + 1) * 1024,
        queueId: "pipe",
        plannerId,
        userId: USER_ID,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      })),
    };

    const { events } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [a, bGoal, bLeaf, c],
      [],
      { categories: [], injectTravelEvents: false, queues: [queue] },
    );

    expect(startMs(eventFor(events, "c"))).toBeGreaterThanOrEqual(
      endMs(eventFor(events, "a")),
    );
  });

  it("places a root task's own duration alongside its independent children", () => {
    // A root task with children is still its own block of work; the children
    // are separate candidates (tasks under a non-goal root), not a bottom
    // layer replacing the parent.
    const parent = makePlanner("parent", { duration: 90 });
    const c1 = makePlanner("c1", {
      parentId: "parent",
      duration: 60,
      sortOrder: 1024,
    });
    const c2 = makePlanner("c2", {
      parentId: "parent",
      duration: 30,
      sortOrder: 2048,
    });

    const { events } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [parent, c1, c2],
      [],
      { categories: [], injectTravelEvents: false },
    );

    const parentEvent = eventFor(events, "parent");
    expect((endMs(parentEvent) - startMs(parentEvent)) / 60000).toBe(90);
    expect(eventFor(events, "c1")).toBeDefined();
    expect(eventFor(events, "c2")).toBeDefined();
    expect(
      events.filter((e) => plannerIdFromEventId(e.id) === "parent"),
    ).toHaveLength(1);
  });
});
