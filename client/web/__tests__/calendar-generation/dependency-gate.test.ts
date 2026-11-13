import * as fs from "fs";
import * as path from "path";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  Queue,
  PlannerDependency,
} from "@/types/prisma";

// Dependencies: multi-predecessor prerequisite edges. A successor is bounded
// by the max end across ALL placed predecessors; a completed predecessor is
// transparent; an unready-goal predecessor schedules the successor unbounded
// with a LOUD message (unlike the queue's silent skip); pure budget
// exhaustion emits the "past the horizon" flavor instead of pretending the
// sequence broke.

const ROOT_GOAL_ID = "ce1a7c26-986e-478d-8fdf-8be5bc0ac68b";

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/completed-task-fixture.json"),
    "utf8",
  ),
) as {
  planner: Planner[];
  calendar: SimpleEvent[];
  templates: (Omit<EventTemplate, "startDay"> & { startDay: string })[];
  categories: Category[];
};

const WEEKDAY_INT: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const templates = FIXTURE.templates.map((t) => ({
  ...t,
  startDay: WEEKDAY_INT[t.startDay],
})) as unknown as EventTemplate[];

const TS = "2026-07-01T00:00:00.000Z";

const leafTemplate = FIXTURE.planner.find(
  (p) => p.plannerType === "task" && !p.completedEndTime,
)!;

function makeTask(id: string, overrides: Partial<Planner> = {}): Planner {
  return {
    ...leafTemplate,
    id,
    title: id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 30,
    deadline: null,
    sortOrder: 0,
    color: null,
    categoryId: null,
    completedStartTime: null,
    completedEndTime: null,
    earliestStartDate: null,
    ...overrides,
  };
}

function makeSmallGoal(rootId: string, leafCount = 2): Planner[] {
  const rows = [
    makeTask(rootId, {
      plannerType: "goal",
      deadline: "2026-08-30T00:00:00.000Z",
      duration: 60,
    }),
  ];
  for (let i = 1; i <= leafCount; i++) {
    rows.push(
      makeTask(`${rootId}-leaf-${i}`, { parentId: rootId, sortOrder: i * 1024 }),
    );
  }
  return rows;
}

function makeQueue(id: string, memberPlannerIds: string[]): Queue {
  return {
    id,
    title: id,
    sortOrder: 0,
    color: null,
    categoryId: null,
    userId: "1",
    createdAt: TS,
    updatedAt: TS,
    members: memberPlannerIds.map((plannerId, i) => ({
      id: `${id}-m${i}`,
      sortOrder: (i + 1) * 1024,
      queueId: id,
      plannerId,
      userId: "1",
      createdAt: TS,
      updatedAt: TS,
    })),
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
    userId: "1",
    createdAt: TS,
    updatedAt: TS,
  };
}

function run(
  planner: Planner[],
  dependencies: PlannerDependency[],
  queues: Queue[] = [],
  previousCalendar: SimpleEvent[] = [],
) {
  return generateCalendar("1", 1, templates, planner, previousCalendar, {
    bufferTimeMinutes: 10,
    categories: FIXTURE.categories,
    previousEngineMessages: [],
    queues,
    dependencies,
  });
}

const startMs = (e: SimpleEvent) => new Date(e.start).getTime();
const endMs = (e: SimpleEvent) => new Date(e.end).getTime();

let consoleSpies: jest.SpyInstance[] = [];

describe("dependency gate", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    jest.setSystemTime(new Date("2026-07-03T12:45:00.000Z"));
    consoleSpies = [
      jest.spyOn(console, "log").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
      jest.spyOn(console, "info").mockImplementation(() => {}),
    ];
  });
  afterAll(() => {
    consoleSpies.forEach((s) => s.mockRestore());
    jest.useRealTimers();
  });

  it("starts a two-predecessor goal after the LATER predecessor's end", () => {
    const a = makeTask("dep-a", { duration: 30 });
    const b = makeTask("dep-b", { duration: 120 });
    const goalRows = makeSmallGoal("successor-goal");
    const planner = [...FIXTURE.planner, a, b, ...goalRows];

    const { events } = run(planner, [
      makeDependency("dep-a", "successor-goal"),
      makeDependency("dep-b", "successor-goal"),
    ]);

    const eventA = events.find((e) => e.id === "dep-a")!;
    const eventB = events.find((e) => e.id === "dep-b")!;
    const leafEvents = events.filter((e) =>
      e.id.startsWith("successor-goal-leaf-"),
    );
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();
    expect(leafEvents).toHaveLength(2);
    const laterEnd = Math.max(endMs(eventA), endMs(eventB));
    for (const leaf of leafEvents) {
      expect(startMs(leaf)).toBeGreaterThanOrEqual(laterEnd);
    }
  });

  it("treats a completed predecessor as transparent", () => {
    const done = makeTask("dep-done", {
      completedStartTime: "2026-07-02T08:00:00.000Z",
      completedEndTime: "2026-07-02T09:00:00.000Z",
    });
    const b = makeTask("dep-b");
    const planner = [...FIXTURE.planner, done, b];

    const { events, messages } = run(planner, [
      makeDependency("dep-done", "dep-b"),
    ]);

    expect(events.find((e) => e.id === "dep-b")).toBeDefined();
    expect(messages.filter((m) => m.type === "DEPENDENCY_BROKEN")).toEqual([]);
  });

  it("schedules unbounded past an unready-goal predecessor, loudly", () => {
    const b = makeTask("dep-b");
    // The fixture's root goal is unready.
    const planner = [...FIXTURE.planner, b];

    const { events, messages } = run(planner, [
      makeDependency(ROOT_GOAL_ID, "dep-b"),
    ]);

    expect(events.find((e) => e.id === "dep-b")).toBeDefined();
    const broken = messages.filter((m) => m.type === "DEPENDENCY_BROKEN");
    expect(broken).toHaveLength(1);
    expect(broken[0].payload).toMatchObject({
      predecessorId: ROOT_GOAL_ID,
      successorId: "dep-b",
      cause: "unready",
    });
  });

  it("reports cause 'failed' for a permanently failed predecessor", () => {
    const tooLarge = makeTask("dep-too-large", { duration: 100000 });
    const b = makeTask("dep-b");
    const planner = [...FIXTURE.planner, tooLarge, b];

    const { events, messages } = run(planner, [
      makeDependency("dep-too-large", "dep-b"),
    ]);

    expect(events.find((e) => e.id === "dep-b")).toBeDefined();
    const broken = messages.filter((m) => m.type === "DEPENDENCY_BROKEN");
    expect(broken).toHaveLength(1);
    expect(broken[0].payload).toMatchObject({
      predecessorId: "dep-too-large",
      successorId: "dep-b",
      cause: "failed",
    });
    expect(
      messages.filter((m) => m.type === "SEQUENCE_PAST_HORIZON"),
    ).toEqual([]);
  });

  it("expands on demand to a far-future predecessor and bounds the successor after it", () => {
    // ~13 months out — past the old fixed expansion ceiling (~336 days), well
    // within the ~2-year horizon. The loop expands on demand until the far
    // predecessor places instead of giving up "past the horizon"; the successor
    // waits for it.
    const farStart = "2027-08-15T00:00:00.000Z";
    const farOut = makeTask("dep-far-out", { earliestStartDate: farStart });
    const b = makeTask("dep-b");
    const planner = [...FIXTURE.planner, farOut, b];

    const { events, messages } = run(planner, [
      makeDependency("dep-far-out", "dep-b"),
    ]);

    const farEvent = events.find((e) => e.id === "dep-far-out");
    const bEvent = events.find((e) => e.id === "dep-b");
    expect(farEvent).toBeDefined();
    expect(new Date(farEvent!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(farStart).getTime(),
    );
    expect(bEvent).toBeDefined();
    expect(new Date(bEvent!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(farEvent!.end).getTime(),
    );
    expect(
      messages.filter(
        (m) =>
          m.type === "SEQUENCE_PAST_HORIZON" || m.type === "DEPENDENCY_BROKEN",
      ),
    ).toEqual([]);
  });

  it("emits SEQUENCE_PAST_HORIZON when a predecessor sits beyond the max horizon", () => {
    // Beyond MAX_HORIZON_EXPANSIONS x HORIZON_CHUNK_DAYS (~2 years): the loop
    // expands to its ceiling without reaching the predecessor, then gives up —
    // the successor schedules unbounded with the "past the horizon" flavor.
    const farOut = makeTask("dep-unreachable", {
      earliestStartDate: "2029-08-01T00:00:00.000Z",
    });
    const b = makeTask("dep-b");
    const planner = [...FIXTURE.planner, farOut, b];

    const { events, messages } = run(planner, [
      makeDependency("dep-unreachable", "dep-b"),
    ]);

    expect(events.find((e) => e.id === "dep-b")).toBeDefined();
    expect(events.find((e) => e.id === "dep-unreachable")).toBeUndefined();
    const pastHorizon = messages.filter(
      (m) => m.type === "SEQUENCE_PAST_HORIZON",
    );
    expect(pastHorizon).toHaveLength(1);
    expect(pastHorizon[0].payload).toMatchObject({
      predecessorId: "dep-unreachable",
      successorId: "dep-b",
      source: "dependency",
    });
    expect(messages.filter((m) => m.type === "DEPENDENCY_BROKEN")).toEqual([]);
  });

  it("stalls a pipe at a member with an external dependency, FIFO preserved", () => {
    const a = makeTask("pipe-a");
    const b = makeTask("pipe-b");
    const c = makeTask("pipe-c");
    // External prerequisite: a ready goal with real work — B must wait for
    // its LAST leaf; C keeps waiting for B (never flows around the stall).
    const externalRows = makeSmallGoal("external-goal", 3);
    const planner = [...FIXTURE.planner, a, b, c, ...externalRows];

    const { events } = run(
      planner,
      [makeDependency("external-goal", "pipe-b")],
      [makeQueue("pipe", ["pipe-a", "pipe-b", "pipe-c"])],
    );

    const eventA = events.find((e) => e.id === "pipe-a")!;
    const eventB = events.find((e) => e.id === "pipe-b")!;
    const eventC = events.find((e) => e.id === "pipe-c")!;
    const externalLeafEnds = events
      .filter((e) => e.id.startsWith("external-goal-leaf-"))
      .map(endMs);
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();
    expect(eventC).toBeDefined();
    expect(externalLeafEnds).toHaveLength(3);

    expect(startMs(eventB)).toBeGreaterThanOrEqual(endMs(eventA));
    expect(startMs(eventB)).toBeGreaterThanOrEqual(
      Math.max(...externalLeafEnds),
    );
    expect(startMs(eventC)).toBeGreaterThanOrEqual(endMs(eventB));
  });

  it("re-emits identical events on an idle regen", () => {
    const a = makeTask("dep-a");
    const b = makeTask("dep-b");
    const goalRows = makeSmallGoal("successor-goal");
    const planner = [...FIXTURE.planner, a, b, ...goalRows];
    const dependencies = [
      makeDependency("dep-a", "successor-goal"),
      makeDependency("dep-b", "successor-goal"),
    ];

    const first = run(planner, dependencies);
    const second = run(planner, dependencies, [], first.events);

    const byId = (events: SimpleEvent[]) =>
      [...events].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(second.events)).toEqual(byId(first.events));
  });
});
