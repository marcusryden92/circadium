import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { serializeTaskSplitting, isChunkEventId } from "@/utils/taskSplitting";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type {
  EventTemplate,
  Planner,
  SimpleEvent,
  PlannerDependency,
} from "@/types/prisma";

// Precedence × the per-item scheduling features. The bound rides the same
// afterTime seam as goal-leaf chaining, and findValidSlots composes it with
// earliestStartDate (effectiveAfter = max), so these must all agree without
// any gate-side re-implementation. Hand-built minimal geometry (split-task /
// goal-day-cap precedent) — the assertions need controlled slot fabric.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const TS = FAKE_TODAY.toISOString();

const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  createdAt: TS,
  updatedAt: TS,
})) as unknown as EventTemplate[];

function makePlanner(id: string, overrides: Partial<Planner> = {}): Planner {
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
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeDependency(
  predecessorId: string,
  successorId: string,
): PlannerDependency {
  return {
    id: `dep-${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    userId: USER_ID,
    createdAt: TS,
    updatedAt: TS,
  };
}

function run(planners: Planner[], dependencies: PlannerDependency[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    injectTravelEvents: false,
    dependencies,
  });
}

const startMs = (e: SimpleEvent) => new Date(e.start).getTime();
const endMs = (e: SimpleEvent) => new Date(e.end).getTime();

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

describe("precedence composes with per-item constraints", () => {
  it("max wins between the bound and the successor's own earliest start", () => {
    const predecessor = makePlanner("pred", { duration: 60 });
    // Later than anything the predecessor produces this week.
    const lateStart = makePlanner("late-start", {
      earliestStartDate: "2026-01-15T00:00:00.000Z",
    });
    // Earlier than the predecessor's end — the bound wins.
    const earlyStart = makePlanner("early-start", {
      earliestStartDate: "2026-01-05T00:00:00.000Z",
    });

    const { events } = run(
      [predecessor, lateStart, earlyStart],
      [
        makeDependency("pred", "late-start"),
        makeDependency("pred", "early-start"),
      ],
    );

    const eventPred = events.find((e) => e.id === "pred")!;
    const eventLate = events.find((e) => e.id === "late-start")!;
    const eventEarly = events.find((e) => e.id === "early-start")!;
    expect(eventPred).toBeDefined();
    expect(eventLate).toBeDefined();
    expect(eventEarly).toBeDefined();

    expect(startMs(eventLate)).toBeGreaterThanOrEqual(
      new Date("2026-01-15T00:00:00.000Z").getTime(),
    );
    expect(startMs(eventEarly)).toBeGreaterThanOrEqual(endMs(eventPred));
  });

  it("bounds the successor to a split predecessor's LAST chunk", () => {
    const splitPred = makePlanner("split-pred", {
      duration: 300,
      splitting: serializeTaskSplitting({
        minMinutes: 45,
        maxMinutes: 120,
        maxMinutesPerDay: 120,
      }),
    });
    const successor = makePlanner("successor");

    const { events } = run(
      [splitPred, successor],
      [makeDependency("split-pred", "successor")],
    );

    const chunkEnds = events
      .filter(
        (e) =>
          isChunkEventId(e.id) && plannerIdFromEventId(e.id) === "split-pred",
      )
      .map(endMs);
    const eventSuccessor = events.find((e) => e.id === "successor")!;
    expect(chunkEnds.length).toBeGreaterThan(1);
    expect(eventSuccessor).toBeDefined();
    expect(startMs(eventSuccessor)).toBeGreaterThanOrEqual(
      Math.max(...chunkEnds),
    );
  });

  it("bounds the successor to a day-capped goal's last placed end", () => {
    const goal = makePlanner("capped-goal", {
      plannerType: "goal",
      duration: 180,
      deadline: "2026-02-01T00:00:00.000Z",
      maxMinutesPerDay: 60,
    });
    const leaves = [1, 2, 3].map((i) =>
      makePlanner(`capped-goal-leaf-${i}`, {
        parentId: "capped-goal",
        sortOrder: i * 1024,
        duration: 60,
      }),
    );
    const successor = makePlanner("successor");

    const { events } = run(
      [goal, ...leaves, successor],
      [makeDependency("capped-goal", "successor")],
    );

    const leafEvents = events.filter((e) =>
      e.id.startsWith("capped-goal-leaf-"),
    );
    const eventSuccessor = events.find((e) => e.id === "successor")!;
    expect(leafEvents).toHaveLength(3);
    expect(eventSuccessor).toBeDefined();

    // The cap spreads the subtree over three local days...
    const days = new Set(
      leafEvents.map((e) => new Date(e.start).toDateString()),
    );
    expect(days.size).toBe(3);
    // ...and the successor starts after the LAST of them.
    expect(startMs(eventSuccessor)).toBeGreaterThanOrEqual(
      Math.max(...leafEvents.map(endMs)),
    );
  });

  it("lands a bounded successor in its first allowed fragment at or after the bound", () => {
    const predecessor = makePlanner("pred", { duration: 480 });
    const successor = makePlanner("allowed-successor", {
      allowedTimes: serializeAllowedTimes({
        days: null,
        ranges: [{ startTime: "10:00", endTime: "14:00" }],
      }),
    });

    const { events } = run(
      [predecessor, successor],
      [makeDependency("pred", "allowed-successor")],
    );

    const eventPred = events.find((e) => e.id === "pred")!;
    const eventSuccessor = events.find((e) => e.id === "allowed-successor")!;
    expect(eventPred).toBeDefined();
    expect(eventSuccessor).toBeDefined();
    expect(startMs(eventSuccessor)).toBeGreaterThanOrEqual(endMs(eventPred));

    const start = new Date(eventSuccessor.start);
    const end = new Date(eventSuccessor.end);
    expect(start.getHours()).toBeGreaterThanOrEqual(10);
    expect(end.getHours() * 60 + end.getMinutes()).toBeLessThanOrEqual(
      14 * 60,
    );
  });
});
