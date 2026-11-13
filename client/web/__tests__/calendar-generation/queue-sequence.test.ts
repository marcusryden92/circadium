import * as fs from "fs";
import * as path from "path";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { serializeTaskSplitting } from "@/utils/taskSplitting";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  Queue,
} from "@/types/prisma";

// Queues (pipes): members schedule in order, each bounded to start after the
// previous member's last placed end. Transparency: completed members and
// unready-goal members are chained through silently. A permanently failed
// member breaks the chain loudly (QUEUE_SEQUENCE_BROKEN) while later members
// still place.

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

// A small, ready goal with two sequential leaves — the fixture's big goal
// stays unready and inert in these runs.
function makeSmallGoal(rootId: string): Planner[] {
  return [
    makeTask(rootId, {
      plannerType: "goal",
      deadline: "2026-08-30T00:00:00.000Z",
      duration: 60,
    }),
    makeTask(`${rootId}-leaf-1`, { parentId: rootId, sortOrder: 1024 }),
    makeTask(`${rootId}-leaf-2`, { parentId: rootId, sortOrder: 2048 }),
  ];
}

function makeQueue(
  id: string,
  memberPlannerIds: string[],
  categoryId: string | null = null,
): Queue {
  return {
    id,
    title: id,
    sortOrder: 0,
    color: null,
    categoryId,
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

function run(
  planner: Planner[],
  queues: Queue[],
  previousCalendar: SimpleEvent[] = [],
) {
  return generateCalendar("1", 1, templates, planner, previousCalendar, {
    bufferTimeMinutes: 10,
    categories: FIXTURE.categories,
    previousEngineMessages: [],
    queues,
  });
}

const startMs = (e: SimpleEvent) => new Date(e.start).getTime();
const endMs = (e: SimpleEvent) => new Date(e.end).getTime();

let consoleSpies: jest.SpyInstance[] = [];

describe("queue sequence scheduling", () => {
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

  it("places the second member at or after the first member's end", () => {
    const a = makeTask("queue-a");
    const b = makeTask("queue-b", { duration: 45 });
    const planner = [...FIXTURE.planner, a, b];

    const { events } = run(planner, [makeQueue("q", ["queue-a", "queue-b"])]);

    const eventA = events.find((e) => e.id === "queue-a")!;
    const eventB = events.find((e) => e.id === "queue-b")!;
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();
    expect(startMs(eventB)).toBeGreaterThanOrEqual(endMs(eventA));
  });

  it("chains a task into a goal — the goal's first leaf starts after the task's end", () => {
    const a = makeTask("queue-a");
    const goalRows = makeSmallGoal("small-goal");
    const planner = [...FIXTURE.planner, a, ...goalRows];

    const { events } = run(planner, [makeQueue("q", ["queue-a", "small-goal"])]);

    const eventA = events.find((e) => e.id === "queue-a")!;
    const leafEvents = events.filter(
      (e) => e.id === "small-goal-leaf-1" || e.id === "small-goal-leaf-2",
    );
    expect(eventA).toBeDefined();
    expect(leafEvents).toHaveLength(2);
    for (const leaf of leafEvents) {
      expect(startMs(leaf)).toBeGreaterThanOrEqual(endMs(eventA));
    }
  });

  it("chains through a completed member transparently", () => {
    const a = makeTask("queue-a");
    const done = makeTask("queue-done", {
      completedStartTime: "2026-07-02T08:00:00.000Z",
      completedEndTime: "2026-07-02T09:00:00.000Z",
    });
    const b = makeTask("queue-b");
    const planner = [...FIXTURE.planner, a, done, b];

    const { events, messages } = run(planner, [
      makeQueue("q", ["queue-a", "queue-done", "queue-b"]),
    ]);

    const eventA = events.find((e) => e.id === "queue-a")!;
    const eventB = events.find((e) => e.id === "queue-b")!;
    expect(eventB).toBeDefined();
    expect(startMs(eventB)).toBeGreaterThanOrEqual(endMs(eventA));
    expect(
      messages.filter((m) => m.type === "QUEUE_SEQUENCE_BROKEN"),
    ).toEqual([]);
  });

  it("skips an unready goal member silently — no bound, no message", () => {
    const a = makeTask("queue-a");
    const b = makeTask("queue-b");
    // The fixture's root goal is unready; use it as the middle member.
    const planner = [...FIXTURE.planner, a, b];

    const { events, messages } = run(planner, [
      makeQueue("q", ["queue-a", ROOT_GOAL_ID, "queue-b"]),
    ]);

    const eventA = events.find((e) => e.id === "queue-a")!;
    const eventB = events.find((e) => e.id === "queue-b")!;
    expect(eventB).toBeDefined();
    expect(startMs(eventB)).toBeGreaterThanOrEqual(endMs(eventA));
    expect(
      messages.filter(
        (m) =>
          m.type === "QUEUE_SEQUENCE_BROKEN" ||
          m.type === "DEPENDENCY_BROKEN" ||
          m.type === "SEQUENCE_PAST_HORIZON",
      ),
    ).toEqual([]);
  });

  it("breaks the chain loudly on a TOO_LARGE member while later members place", () => {
    const tooLarge = makeTask("queue-too-large", { duration: 100000 });
    const b = makeTask("queue-b");
    const c = makeTask("queue-c");
    const planner = [...FIXTURE.planner, tooLarge, b, c];

    const { events, messages } = run(planner, [
      makeQueue("q", ["queue-too-large", "queue-b", "queue-c"]),
    ]);

    const eventB = events.find((e) => e.id === "queue-b")!;
    const eventC = events.find((e) => e.id === "queue-c")!;
    expect(eventB).toBeDefined();
    expect(eventC).toBeDefined();
    // FIFO among the surviving members is preserved.
    expect(startMs(eventC)).toBeGreaterThanOrEqual(endMs(eventB));

    const broken = messages.filter((m) => m.type === "QUEUE_SEQUENCE_BROKEN");
    expect(broken).toHaveLength(1);
    expect(broken[0].payload).toMatchObject({
      queueId: "q",
      failedPlannerId: "queue-too-large",
    });
  });

  it("keeps a successor waiting through horizon expansion instead of jumping the chain", () => {
    // Member 1 can't place until ~6 weeks out (past the initial 28-day
    // chunk); member 2 must wait for the expansions rather than trigger
    // them itself or schedule early.
    const a = makeTask("queue-a", {
      earliestStartDate: "2026-08-15T00:00:00.000Z",
    });
    const b = makeTask("queue-b");
    const planner = [...FIXTURE.planner, a, b];

    const { events, messages } = run(planner, [
      makeQueue("q", ["queue-a", "queue-b"]),
    ]);

    const eventA = events.find((e) => e.id === "queue-a")!;
    const eventB = events.find((e) => e.id === "queue-b")!;
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();
    expect(startMs(eventA)).toBeGreaterThanOrEqual(
      new Date("2026-08-15T00:00:00.000Z").getTime(),
    );
    expect(startMs(eventB)).toBeGreaterThanOrEqual(endMs(eventA));
    expect(
      messages.filter(
        (m) =>
          m.type === "QUEUE_SEQUENCE_BROKEN" ||
          m.type === "SEQUENCE_PAST_HORIZON",
      ),
    ).toEqual([]);
  });

  it("bounds a (split) successor after the placed work of a partially-schedulable predecessor", () => {
    // A goal predecessor whose leaves spread across weeks, plus one leaf that
    // can never be placed (too large for any daily gap). The goal resolves with
    // only its placeable leaves, but the split successor must still land after
    // the predecessor's actually-placed work — not slot into the early gaps
    // between the goal's leaves. A split successor makes the regression obvious:
    // without the bound it scatters small chunks across every gap.
    const goalRows: Planner[] = [
      makeTask("launch", {
        plannerType: "goal",
        deadline: "2027-06-30T00:00:00.000Z",
        duration: 60 * 4,
      }),
      makeTask("launch-leaf-0", {
        parentId: "launch",
        sortOrder: 1024,
        earliestStartDate: "2026-07-06T00:00:00.000Z",
        duration: 60,
      }),
      makeTask("launch-leaf-1", {
        parentId: "launch",
        sortOrder: 2048,
        earliestStartDate: "2026-07-20T00:00:00.000Z",
        duration: 60,
      }),
      makeTask("launch-leaf-2", {
        parentId: "launch",
        sortOrder: 3072,
        earliestStartDate: "2026-08-03T00:00:00.000Z",
        duration: 60,
      }),
      makeTask("launch-leaf-3", {
        parentId: "launch",
        sortOrder: 4096,
        duration: 60 * 20, // too large for any daily gap -> never placeable
      }),
    ];
    const split = makeTask("dotnet", {
      duration: 240,
      splitting: serializeTaskSplitting({
        minMinutes: 30,
        maxMinutes: 60,
        maxMinutesPerDay: 60,
      }),
    });
    const planner = [...FIXTURE.planner, ...goalRows, split];

    const { events } = run(planner, [makeQueue("q", ["launch", "dotnet"])]);

    const placedGoalLeaves = events.filter(
      (e) => e.id.startsWith("launch-leaf-") && e.id !== "launch-leaf-3",
    );
    const chunks = events.filter(
      (e) => plannerIdFromEventId(e.id) === "dotnet",
    );
    expect(placedGoalLeaves.length).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(0);

    const lastPlacedGoalEnd = Math.max(...placedGoalLeaves.map(endMs));
    const firstChunkStart = Math.min(...chunks.map(startMs));
    expect(firstChunkStart).toBeGreaterThanOrEqual(lastPlacedGoalEnd);
  });

  it("re-emits identical events on an idle regen", () => {
    const a = makeTask("queue-a");
    const b = makeTask("queue-b");
    const planner = [...FIXTURE.planner, a, b];
    const queues = [makeQueue("q", ["queue-a", "queue-b"])];

    const first = run(planner, queues);
    const second = run(planner, queues, first.events);

    const byId = (events: SimpleEvent[]) =>
      [...events].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(second.events)).toEqual(byId(first.events));
  });
});
