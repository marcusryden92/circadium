import * as fs from "fs";
import * as path from "path";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  PlannerDependency,
} from "@/types/prisma";

// Node-level dependencies: PlannerDependency edges between arbitrary tree
// nodes. The gate treats each endpoint as an ANCHOR — a successor node's
// first own leaf carries the bound, a predecessor node resolves when all its
// subtree leaves resolve and publishes its max placed end. Breaks are
// dependency-grade loud (DEPENDENCY_BROKEN with the NODE id in the message
// identity), and anchor registration must never activate stale day caps on
// nested goal rows.

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
    splitting: null,
    maxMinutesPerDay: null,
    linkedItemId: null,
    notes: null,
    ...overrides,
  };
}

function makeGoal(
  rootId: string,
  leafCount = 2,
  overrides: Partial<Planner> = {},
): Planner[] {
  const rows = [
    makeTask(rootId, {
      plannerType: "goal",
      deadline: "2026-08-30T00:00:00.000Z",
      duration: 60,
      ...overrides,
    }),
  ];
  for (let i = 1; i <= leafCount; i++) {
    rows.push(
      makeTask(`${rootId}-leaf-${i}`, {
        parentId: rootId,
        sortOrder: i * 1024,
        ...overrides,
        plannerType: "task",
      }),
    );
  }
  return rows;
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
  previousCalendar: SimpleEvent[] = [],
) {
  return generateCalendar("1", 1, templates, planner, previousCalendar, {
    bufferTimeMinutes: 10,
    categories: FIXTURE.categories,
    previousEngineMessages: [],
    queues: [],
    dependencies,
  });
}

const startMs = (e: SimpleEvent) => new Date(e.start).getTime();
const endMs = (e: SimpleEvent) => new Date(e.end).getTime();

let consoleSpies: jest.SpyInstance[] = [];

describe("node-level dependency gate", () => {
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

  it("bounds a cross-goal subtask to its subtask predecessor's end", () => {
    const planner = [
      ...FIXTURE.planner,
      ...makeGoal("goal-a", 3),
      ...makeGoal("goal-b", 2),
    ];

    const { events, messages } = run(planner, [
      makeDependency("goal-a-leaf-2", "goal-b-leaf-1"),
    ]);

    const pred = events.find((e) => e.id === "goal-a-leaf-2")!;
    const succ = events.find((e) => e.id === "goal-b-leaf-1")!;
    expect(pred).toBeDefined();
    expect(succ).toBeDefined();
    expect(startMs(succ)).toBeGreaterThanOrEqual(endMs(pred));
    expect(messages.filter((m) => m.type === "DEPENDENCY_BROKEN")).toEqual([]);
  });

  it("bounds a subtask successor to a whole-goal predecessor (goal -> subtask)", () => {
    const planner = [
      ...FIXTURE.planner,
      ...makeGoal("goal-a", 2),
      ...makeGoal("goal-b", 2),
    ];

    const { events } = run(planner, [
      makeDependency("goal-a", "goal-b-leaf-2"),
    ]);

    const predEnds = events
      .filter((e) => e.id.startsWith("goal-a-leaf-"))
      .map(endMs);
    const succ = events.find((e) => e.id === "goal-b-leaf-2")!;
    expect(predEnds).toHaveLength(2);
    expect(succ).toBeDefined();
    expect(startMs(succ)).toBeGreaterThanOrEqual(Math.max(...predEnds));
  });

  it("bounds a whole goal to a subtask predecessor (subtask -> goal)", () => {
    const planner = [
      ...FIXTURE.planner,
      ...makeGoal("goal-a", 3),
      ...makeGoal("goal-b", 2),
    ];

    const { events } = run(planner, [
      makeDependency("goal-a-leaf-2", "goal-b"),
    ]);

    const pred = events.find((e) => e.id === "goal-a-leaf-2")!;
    const succLeaves = events.filter((e) => e.id.startsWith("goal-b-leaf-"));
    expect(pred).toBeDefined();
    expect(succLeaves).toHaveLength(2);
    for (const leaf of succLeaves) {
      expect(startMs(leaf)).toBeGreaterThanOrEqual(endMs(pred));
    }
  });

  it("treats a completed predecessor node as transparent while others still bind", () => {
    const goalRows = makeGoal("goal-a", 2).map((p) =>
      p.id === "goal-a-leaf-1"
        ? {
            ...p,
            completedStartTime: "2026-07-02T08:00:00.000Z",
            completedEndTime: "2026-07-02T09:00:00.000Z",
          }
        : p,
    );
    const other = makeTask("other-pred", { duration: 120 });
    const b = makeTask("succ-task");
    const planner = [...FIXTURE.planner, ...goalRows, other, b];

    const { events, messages } = run(planner, [
      makeDependency("goal-a-leaf-1", "succ-task"),
      makeDependency("other-pred", "succ-task"),
    ]);

    const succ = events.find((e) => e.id === "succ-task")!;
    const otherEvent = events.find((e) => e.id === "other-pred")!;
    expect(succ).toBeDefined();
    expect(otherEvent).toBeDefined();
    expect(startMs(succ)).toBeGreaterThanOrEqual(endMs(otherEvent));
    expect(messages.filter((m) => m.type === "DEPENDENCY_BROKEN")).toEqual([]);
  });

  it("reports one DEPENDENCY_BROKEN(unready) carrying the NODE id for an unready-root predecessor", () => {
    const unreadyRows = makeGoal("unready-goal", 2, { isReady: false });
    const b = makeTask("succ-task");
    const planner = [...FIXTURE.planner, ...unreadyRows, b];

    const { events, messages } = run(planner, [
      makeDependency("unready-goal-leaf-1", "succ-task"),
    ]);

    expect(events.find((e) => e.id === "succ-task")).toBeDefined();
    expect(
      events.filter((e) => e.id.startsWith("unready-goal-leaf-")),
    ).toEqual([]);
    const broken = messages.filter((m) => m.type === "DEPENDENCY_BROKEN");
    expect(broken).toHaveLength(1);
    expect(broken[0].payload).toMatchObject({
      predecessorId: "unready-goal-leaf-1",
      successorId: "succ-task",
      cause: "unready",
    });
  });

  it("bounds a successor to a split predecessor's LAST chunk", () => {
    const goalRows = makeGoal("goal-a", 2).map((p) =>
      p.id === "goal-a-leaf-1"
        ? {
            ...p,
            duration: 90,
            splitting: JSON.stringify({ minMinutes: 15, maxMinutes: 30 }),
          }
        : p,
    );
    const b = makeTask("succ-task");
    const planner = [...FIXTURE.planner, ...goalRows, b];

    const { events } = run(planner, [
      makeDependency("goal-a-leaf-1", "succ-task"),
    ]);

    const chunkEnds = events
      .filter((e) => e.id.startsWith("goal-a-leaf-1|chunk:"))
      .map(endMs);
    const succ = events.find((e) => e.id === "succ-task")!;
    expect(chunkEnds.length).toBeGreaterThan(1);
    expect(succ).toBeDefined();
    expect(startMs(succ)).toBeGreaterThanOrEqual(Math.max(...chunkEnds));
  });

  it("never activates a stale day cap on a nested goal row registered as an anchor", () => {
    const branchRows: Planner[] = [
      makeTask("goal-a", {
        plannerType: "goal",
        deadline: "2026-08-30T00:00:00.000Z",
        duration: 60,
      }),
      // Stale cap smaller than any leaf — if anchor registration activated
      // it, both leaves would relax as oversizedLeaf.
      makeTask("branch", {
        plannerType: "goal",
        parentId: "goal-a",
        sortOrder: 1024,
        maxMinutesPerDay: 1,
      }),
      makeTask("branch-leaf-1", {
        parentId: "branch",
        sortOrder: 1024,
      }),
      makeTask("branch-leaf-2", {
        parentId: "branch",
        sortOrder: 2048,
      }),
    ];
    const b = makeTask("succ-task");
    const planner = [...FIXTURE.planner, ...branchRows, b];

    const { events, messages } = run(planner, [
      makeDependency("branch", "succ-task"),
    ]);

    const leafEnds = events
      .filter((e) => e.id.startsWith("branch-leaf-"))
      .map(endMs);
    const succ = events.find((e) => e.id === "succ-task")!;
    expect(leafEnds).toHaveLength(2);
    expect(succ).toBeDefined();
    expect(startMs(succ)).toBeGreaterThanOrEqual(Math.max(...leafEnds));
    expect(messages.filter((m) => m.type === "GOAL_DAY_CAP_RELAXED")).toEqual(
      [],
    );
  });

  it("expands on demand to a far-future node predecessor and bounds the successor after it", () => {
    // ~13 months out — past the old fixed expansion ceiling, within the ~2-year
    // horizon. The horizon expands on demand to reach the far predecessor rather
    // than giving up "past the horizon"; the node successor waits for it.
    const farStart = "2027-08-15T00:00:00.000Z";
    const farOut = makeTask("far-out", { earliestStartDate: farStart });
    const goalRows = makeGoal("goal-b", 2);
    const planner = [...FIXTURE.planner, farOut, ...goalRows];

    const { events, messages } = run(planner, [
      makeDependency("far-out", "goal-b-leaf-2"),
    ]);

    const farEvent = events.find((e) => e.id === "far-out");
    const successor = events.find((e) => e.id === "goal-b-leaf-2");
    expect(farEvent).toBeDefined();
    expect(new Date(farEvent!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(farStart).getTime(),
    );
    expect(successor).toBeDefined();
    expect(new Date(successor!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(farEvent!.end).getTime(),
    );
    expect(
      messages.filter(
        (m) =>
          m.type === "SEQUENCE_PAST_HORIZON" || m.type === "DEPENDENCY_BROKEN",
      ),
    ).toEqual([]);
  });

  it("re-emits identical events on an idle regen", () => {
    const planner = [
      ...FIXTURE.planner,
      ...makeGoal("goal-a", 3),
      ...makeGoal("goal-b", 2),
    ];
    const dependencies = [
      makeDependency("goal-a-leaf-2", "goal-b-leaf-1"),
      makeDependency("goal-a", "goal-b-leaf-2"),
    ];

    const first = run(planner, dependencies);
    const second = run(planner, dependencies, first.events);

    const byId = (events: SimpleEvent[]) =>
      [...events].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(second.events)).toEqual(byId(first.events));
  });
});
