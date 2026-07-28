import type {
  Category,
  Planner,
  PlannerDependency,
  Queue,
  SimpleEvent,
} from "@/types/prisma";
import {
  buildRootSpans,
  buildLeafSpans,
  buildGraphLanes,
  layoutGraph,
  buildGraphTicks,
  bandRootHeight,
  GRAPH_METRICS,
  INDEPENDENT_LANE_KEY,
} from "@/app/(protected)/graph/_lib/graphModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-14T12:00:00.000Z");

const makePlanner = (overrides: Partial<Planner> & { id: string }): Planner =>
  ({
    title: overrides.id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 4,
    userId: "user-1",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as Planner;

const makeEvent = (
  id: string,
  start: string,
  end: string,
  eventType: "planner" | "template" = "planner",
): SimpleEvent =>
  ({
    id,
    title: id,
    start,
    end,
    extendedProps: { eventType },
  }) as SimpleEvent;

const makeQueue = (
  id: string,
  memberPlannerIds: string[],
  overrides: Partial<Queue> = {},
): Queue =>
  ({
    id,
    title: id,
    sortOrder: 0,
    categoryId: null,
    userId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    members: memberPlannerIds.map((plannerId, index) => ({
      id: `${id}-member-${index}`,
      queueId: id,
      plannerId,
      sortOrder: (index + 1) * 1024,
      userId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    ...overrides,
  }) as Queue;

const makeDependency = (
  predecessorId: string,
  successorId: string,
): PlannerDependency =>
  ({
    id: `${predecessorId}->${successorId}`,
    predecessorId,
    successorId,
    userId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as PlannerDependency;

const makeCategory = (
  id: string,
  parentId: string | null = null,
  sortOrder = 0,
): Category =>
  ({
    id,
    name: id,
    parentId,
    sortOrder,
    color: null,
  }) as Category;

describe("buildRootSpans", () => {
  it("aggregates planner events to root spans, resolving composite ids and skipping non-planner events", () => {
    const planner = [
      makePlanner({ id: "goal-1", plannerType: "goal" }),
      makePlanner({ id: "leaf-1", parentId: "goal-1" }),
      makePlanner({ id: "leaf-2", parentId: "goal-1" }),
      makePlanner({ id: "task-1" }),
    ];
    const calendar = [
      makeEvent(
        "leaf-1",
        "2026-07-15T09:00:00.000Z",
        "2026-07-15T10:00:00.000Z",
      ),
      makeEvent(
        "leaf-2|chunk:1",
        "2026-07-16T09:00:00.000Z",
        "2026-07-16T11:00:00.000Z",
      ),
      makeEvent(
        "task-1",
        "2026-07-15T12:00:00.000Z",
        "2026-07-15T13:00:00.000Z",
      ),
      makeEvent(
        "template-1",
        "2026-07-15T00:00:00.000Z",
        "2026-07-15T08:00:00.000Z",
        "template",
      ),
    ];

    const spans = buildRootSpans(calendar, planner);

    expect(spans.get("goal-1")).toEqual({
      start: Date.parse("2026-07-15T09:00:00.000Z"),
      end: Date.parse("2026-07-16T11:00:00.000Z"),
    });
    expect(spans.get("task-1")).toEqual({
      start: Date.parse("2026-07-15T12:00:00.000Z"),
      end: Date.parse("2026-07-15T13:00:00.000Z"),
    });
    expect(spans.has("template-1")).toBe(false);
  });

  it("ignores stale completed segments on a goal container (splittable task retyped into a goal)", () => {
    const planner = [
      makePlanner({
        id: "goal-1",
        plannerType: "goal",
        splitting: JSON.stringify({ minMinutes: 30, maxMinutes: 60 }),
        completedSegments: JSON.stringify([
          {
            start: "2026-06-01T09:00:00.000Z",
            end: "2026-06-01T10:00:00.000Z",
          },
        ]),
      }),
      makePlanner({ id: "leaf-1", parentId: "goal-1" }),
      makePlanner({
        id: "task-split",
        splitting: JSON.stringify({ minMinutes: 30, maxMinutes: 60 }),
      }),
    ];
    const calendar = [
      // Stale history from before goal-1 became a container.
      makeEvent(
        "goal-1|done:2026-06-01T09:00:00.000Z",
        "2026-06-01T09:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
      ),
      makeEvent(
        "leaf-1",
        "2026-07-15T09:00:00.000Z",
        "2026-07-15T10:00:00.000Z",
      ),
      // A childless split task's segments are live and must keep counting.
      makeEvent(
        "task-split|done:2026-07-14T09:00:00.000Z",
        "2026-07-14T09:00:00.000Z",
        "2026-07-14T10:00:00.000Z",
      ),
    ];

    const spans = buildRootSpans(calendar, planner);
    expect(spans.get("goal-1")).toEqual({
      start: Date.parse("2026-07-15T09:00:00.000Z"),
      end: Date.parse("2026-07-15T10:00:00.000Z"),
    });
    expect(spans.get("task-split")).toEqual({
      start: Date.parse("2026-07-14T09:00:00.000Z"),
      end: Date.parse("2026-07-14T10:00:00.000Z"),
    });

    const leafSpans = buildLeafSpans(calendar, planner);
    expect(leafSpans.get("goal-1")?.has("goal-1")).toBe(false);
    expect(leafSpans.get("goal-1")?.get("leaf-1")).toEqual({
      start: Date.parse("2026-07-15T09:00:00.000Z"),
      end: Date.parse("2026-07-15T10:00:00.000Z"),
    });
  });
});

describe("buildGraphLanes", () => {
  const spans = new Map([
    ["member-1", { start: NOW + DAY_MS, end: NOW + 2 * DAY_MS }],
  ]);

  it("keeps queue member order, hides completed by default, and preserves the full order for drop math", () => {
    const planner = [
      makePlanner({ id: "member-1" }),
      makePlanner({
        id: "member-2",
        completedStartTime: "2026-07-10T09:00:00.000Z",
        completedEndTime: "2026-07-10T10:00:00.000Z",
      }),
      makePlanner({ id: "member-3" }),
    ];
    const queues = [makeQueue("queue-1", ["member-1", "member-2", "member-3"])];

    const lanes = buildGraphLanes({
      planner,
      queues,
      dependencies: [],
      categories: [],
      spans,
      showCompleted: false,
    });

    expect(lanes).toHaveLength(1);
    expect(lanes[0].nodes.map((n) => n.id)).toEqual(["member-1", "member-3"]);
    expect(lanes[0].memberOrderRows.map((r) => r.id)).toEqual([
      "member-1",
      "member-2",
      "member-3",
    ]);

    const withCompleted = buildGraphLanes({
      planner,
      queues,
      dependencies: [],
      categories: [],
      spans,
      showCompleted: true,
    });
    expect(withCompleted[0].nodes.map((n) => n.id)).toEqual([
      "member-1",
      "member-2",
      "member-3",
    ]);
  });

  it("puts root goals and dependency-endpoint tasks in the independent lane, excluding plain tasks and queued items", () => {
    const planner = [
      makePlanner({ id: "member-1" }),
      makePlanner({ id: "goal-1", plannerType: "goal", isReady: false }),
      makePlanner({ id: "task-linked" }),
      makePlanner({ id: "task-plain" }),
      makePlanner({ id: "task-untriaged", isTriaged: false }),
      makePlanner({ id: "subtask", parentId: "goal-1" }),
    ];
    const queues = [makeQueue("queue-1", ["member-1"])];
    const dependencies = [makeDependency("task-linked", "goal-1")];

    const lanes = buildGraphLanes({
      planner,
      queues,
      dependencies,
      categories: [],
      spans,
      showCompleted: false,
    });

    const independent = lanes.find((l) => l.key === INDEPENDENT_LANE_KEY);
    expect(independent).toBeDefined();
    expect(independent!.nodes.map((n) => n.id).sort()).toEqual([
      "goal-1",
      "task-linked",
    ]);
    expect(
      independent!.nodes.find((n) => n.id === "goal-1")!.unreadyGoal,
    ).toBe(true);
  });

  it("groups non-queue items under an indented category tree, keeping itemless ancestors as headers", () => {
    const categories = [
      makeCategory("Work", null, 0),
      makeCategory("Project A", "Work", 0),
      makeCategory("Project A Onboarding", "Project A", 0),
      makeCategory("Project B", "Work", 1),
      makeCategory("Health", null, 2),
    ];
    const planner = [
      makePlanner({ id: "goal-work", plannerType: "goal", categoryId: "Work" }),
      makePlanner({
        id: "goal-onboarding",
        plannerType: "goal",
        categoryId: "Project A Onboarding",
      }),
      makePlanner({
        id: "goal-b",
        plannerType: "goal",
        categoryId: "Project B",
      }),
      makePlanner({ id: "goal-loose", plannerType: "goal" }),
    ];

    const lanes = buildGraphLanes({
      planner,
      queues: [],
      dependencies: [],
      categories,
      spans,
      showCompleted: false,
    });

    expect(
      lanes.map((l) => ({
        key: l.key,
        depth: l.depth,
        headerOnly: l.headerOnly,
      })),
    ).toEqual([
      { key: "category:Work", depth: 0, headerOnly: false },
      { key: "category:Project A", depth: 1, headerOnly: true },
      { key: "category:Project A Onboarding", depth: 2, headerOnly: false },
      { key: "category:Project B", depth: 1, headerOnly: false },
      { key: INDEPENDENT_LANE_KEY, depth: 0, headerOnly: false },
    ]);
    expect(lanes[0].nodes.map((n) => n.id)).toEqual(["goal-work"]);
    expect(lanes[2].nodes.map((n) => n.id)).toEqual(["goal-onboarding"]);
    expect(lanes[4].nodes.map((n) => n.id)).toEqual(["goal-loose"]);

    const layout = layoutGraph(lanes, { pxPerDay: 30, now: NOW });
    const headerLane = layout.lanes[1];
    const itemLane = layout.lanes[2];
    expect(headerLane.height).toBeLessThan(itemLane.height);
    expect(headerLane.nodes).toHaveLength(0);
  });

  it("nests a category-attached queue under its category like a subcategory, keeping unattached queues on top", () => {
    const categories = [
      makeCategory("Work", null, 0),
      makeCategory("Project A", "Work", 0),
    ];
    const planner = [
      makePlanner({ id: "member-1" }),
      makePlanner({ id: "member-2" }),
      makePlanner({
        id: "goal-a",
        plannerType: "goal",
        categoryId: "Project A",
      }),
    ];
    const queues = [
      makeQueue("queue-loose", ["member-1"], { sortOrder: 0 }),
      makeQueue("queue-work", ["member-2"], {
        categoryId: "Work",
        sortOrder: 1,
      }),
      makeQueue("queue-ghost", [], { categoryId: "Deleted", sortOrder: 2 }),
    ];

    const lanes = buildGraphLanes({
      planner,
      queues,
      dependencies: [],
      categories,
      spans,
      showCompleted: false,
    });

    expect(
      lanes.map((l) => ({ key: l.key, depth: l.depth, headerOnly: l.headerOnly })),
    ).toEqual([
      { key: "queue-loose", depth: 0, headerOnly: false },
      { key: "queue-ghost", depth: 0, headerOnly: false },
      { key: "category:Work", depth: 0, headerOnly: true },
      { key: "queue-work", depth: 1, headerOnly: false },
      { key: "category:Project A", depth: 1, headerOnly: false },
    ]);
    expect(lanes[3].memberOrderRows.map((r) => r.id)).toEqual(["member-2"]);
  });

  it("renders a category heading whose only content is an attached queue", () => {
    const categories = [makeCategory("Work", null, 0)];
    const planner = [makePlanner({ id: "member-1" })];
    const queues = [makeQueue("queue-work", ["member-1"], { categoryId: "Work" })];

    const lanes = buildGraphLanes({
      planner,
      queues,
      dependencies: [],
      categories,
      spans,
      showCompleted: false,
    });

    expect(lanes.map((l) => l.key)).toEqual(["category:Work", "queue-work"]);
    expect(lanes[0].headerOnly).toBe(true);
    expect(lanes[1].depth).toBe(1);
  });
});

describe("layoutGraph", () => {
  it("row-packs overlapping nodes, docks unscheduled ones past the domain, and keeps now in range", () => {
    const planner = [
      makePlanner({ id: "goal-a", plannerType: "goal" }),
      makePlanner({ id: "goal-b", plannerType: "goal" }),
      makePlanner({ id: "goal-c", plannerType: "goal", isReady: false }),
    ];
    const spans = new Map([
      ["goal-a", { start: NOW + DAY_MS, end: NOW + 3 * DAY_MS }],
      ["goal-b", { start: NOW + 2 * DAY_MS, end: NOW + 4 * DAY_MS }],
    ]);
    const lanes = buildGraphLanes({
      planner,
      queues: [],
      dependencies: [],
      categories: [],
      spans,
      showCompleted: false,
    });

    const layout = layoutGraph(lanes, { pxPerDay: 30, now: NOW });

    const laidA = layout.nodeById.get("goal-a")!;
    const laidB = layout.nodeById.get("goal-b")!;
    const laidC = layout.nodeById.get("goal-c")!;

    expect(laidA.row).not.toBe(laidB.row);
    expect(laidC.docked).toBe(true);
    expect(layout.dockX).not.toBeNull();
    expect(layout.scheduleEndX).toBe(5 * 30);
    expect(laidC.x).toBeGreaterThan(laidB.x + laidB.w);
    expect(layout.nowX).toBeGreaterThanOrEqual(0);
    expect(layout.nowX).toBeLessThanOrEqual(layout.width);
    expect(layout.width).toBeGreaterThanOrEqual(laidC.x + laidC.w);
    expect(layout.lanes[0].rows).toBeGreaterThanOrEqual(2);
    expect(layout.height).toBe(layout.lanes[0].height);
  });

  it("extends the schedule-end delimiter to the rendered edge of a min-width node", () => {
    const planner = [makePlanner({ id: "goal-a", plannerType: "goal" })];
    const spans = new Map([
      ["goal-a", { start: NOW + DAY_MS, end: NOW + DAY_MS + 3_600_000 }],
    ]);
    const lanes = buildGraphLanes({
      planner,
      queues: [],
      dependencies: [],
      categories: [],
      spans,
      showCompleted: false,
    });

    const layout = layoutGraph(lanes, { pxPerDay: 6, now: NOW });
    const laid = layout.nodeById.get("goal-a")!;

    expect(laid.w).toBeGreaterThan((3_600_000 / DAY_MS) * 6);
    expect(layout.scheduleEndX).toBe(laid.x + laid.w);
  });

  it("weaves queue members over-under in member order", () => {
    const planner = [
      makePlanner({ id: "member-1" }),
      makePlanner({ id: "member-2" }),
      makePlanner({ id: "member-3" }),
    ];
    const spans = new Map([
      ["member-1", { start: NOW + DAY_MS, end: NOW + 2 * DAY_MS }],
      ["member-2", { start: NOW + 2 * DAY_MS, end: NOW + 3 * DAY_MS }],
      ["member-3", { start: NOW + 3 * DAY_MS, end: NOW + 4 * DAY_MS }],
    ]);
    const lanes = buildGraphLanes({
      planner,
      queues: [makeQueue("queue-1", ["member-1", "member-2", "member-3"])],
      dependencies: [],
      categories: [],
      spans,
      showCompleted: false,
    });

    const layout = layoutGraph(lanes, { pxPerDay: 30, now: NOW });
    expect(layout.lanes[0].rows).toBe(2);
    const laid1 = layout.nodeById.get("member-1")!;
    const laid2 = layout.nodeById.get("member-2")!;
    const laid3 = layout.nodeById.get("member-3")!;
    expect(laid1.row).toBe(0);
    expect(laid2.row).toBe(1);
    expect(laid3.row).toBe(0);
    expect(laid1.y).not.toBe(laid2.y);
    expect(laid1.y).toBe(laid3.y);
    expect(laid2.x).toBeGreaterThan(laid1.x + laid1.w - GRAPH_METRICS.minRowGapX);
  });

  it("keeps a single-member queue on one row", () => {
    const planner = [makePlanner({ id: "member-1" })];
    const spans = new Map([
      ["member-1", { start: NOW + DAY_MS, end: NOW + 2 * DAY_MS }],
    ]);
    const lanes = buildGraphLanes({
      planner,
      queues: [makeQueue("queue-1", ["member-1"])],
      dependencies: [],
      categories: [],
      spans,
      showCompleted: false,
    });

    const layout = layoutGraph(lanes, { pxPerDay: 30, now: NOW });
    expect(layout.lanes[0].rows).toBe(1);
  });

});

describe("buildGraphTicks", () => {
  const ALL_UNITS = { hour: true, day: true, week: true, month: true };
  const goalPlanner = [makePlanner({ id: "goal-1", plannerType: "goal" })];
  const lanesForSpan = (days: number) =>
    buildGraphLanes({
      planner: goalPlanner,
      queues: [],
      dependencies: [],
      categories: [],
      spans: new Map([["goal-1", { start: NOW, end: NOW + days * DAY_MS }]]),
      showCompleted: false,
    });

  it("labels days when zoomed in and demotes them to unlabeled lines when zoomed out", () => {
    const zoomedIn = layoutGraph(lanesForSpan(5), { pxPerDay: 90, now: NOW });
    const ticks = buildGraphTicks(zoomedIn, 1, ALL_UNITS);
    const dayTicks = ticks.filter((t) => t.unit === "day");
    expect(dayTicks.length).toBeGreaterThanOrEqual(4);
    expect(dayTicks[0].label).toMatch(/^[A-Z][a-z]{2} \d+$/);
    expect(ticks.some((t) => t.unit === "hour")).toBe(false);

    const zoomedOut = layoutGraph(lanesForSpan(120), { pxPerDay: 10, now: NOW });
    const outTicks = buildGraphTicks(zoomedOut, 1, ALL_UNITS);
    const monthTicks = outTicks.filter((t) => t.unit === "month");
    expect(monthTicks.length).toBeGreaterThanOrEqual(3);
    expect(monthTicks[0].label).toMatch(/^[A-Z][a-z]{2}$/);
    const dayLines = outTicks.filter((t) => t.unit === "day");
    expect(dayLines.length).toBeGreaterThan(0);
    expect(dayLines.every((t) => t.label === "")).toBe(true);
  });

  it("omits disabled units and windows hourly ticks at maximum zoom", () => {
    const zoomedOut = layoutGraph(lanesForSpan(120), { pxPerDay: 10, now: NOW });
    const noMonths = buildGraphTicks(zoomedOut, 1, {
      ...ALL_UNITS,
      month: false,
      week: false,
    });
    expect(noMonths.some((t) => t.unit === "month" || t.unit === "week")).toBe(
      false,
    );

    const hourZoom = layoutGraph(lanesForSpan(5), { pxPerDay: 960, now: NOW });
    const windowed = buildGraphTicks(hourZoom, 1, ALL_UNITS, {
      start: 0,
      end: 3000,
    });
    const hourTicks = windowed.filter((t) => t.unit === "hour");
    expect(hourTicks.length).toBeGreaterThan(0);
    expect(hourTicks.every((t) => t.x <= 3000)).toBe(true);
    expect(hourTicks.some((t) => /^\d{2}:\d{2}$/.test(t.label))).toBe(true);
  });
});

describe("leaf view", () => {
  const planner = [
    makePlanner({ id: "goal-1", plannerType: "goal" }),
    makePlanner({ id: "leaf-1", parentId: "goal-1", title: "Leaf one" }),
    makePlanner({ id: "leaf-2", parentId: "goal-1", title: "Leaf two" }),
    makePlanner({ id: "task-1" }),
  ];
  const calendar = [
    makeEvent("leaf-2|chunk:1", "2026-07-16T09:00:00.000Z", "2026-07-16T10:00:00.000Z"),
    makeEvent("leaf-2|chunk:2", "2026-07-17T09:00:00.000Z", "2026-07-17T11:00:00.000Z"),
    makeEvent("leaf-1", "2026-07-15T09:00:00.000Z", "2026-07-15T10:00:00.000Z"),
    makeEvent("task-1", "2026-07-15T12:00:00.000Z", "2026-07-15T13:00:00.000Z"),
  ];

  it("groups placed events per leaf under the root, aggregating chunk composites", () => {
    const leafSpans = buildLeafSpans(calendar, planner);
    const goalBucket = leafSpans.get("goal-1")!;
    expect([...goalBucket.keys()].sort()).toEqual(["leaf-1", "leaf-2"]);
    expect(goalBucket.get("leaf-2")).toEqual({
      start: Date.parse("2026-07-16T09:00:00.000Z"),
      end: Date.parse("2026-07-17T11:00:00.000Z"),
    });
    expect([...leafSpans.get("task-1")!.keys()]).toEqual(["task-1"]);
  });

  it("attaches span-ordered leaves to expanded nodes and none to single-block items", () => {
    const lanes = buildGraphLanes({
      planner,
      queues: [makeQueue("queue-1", ["goal-1", "task-1"])],
      dependencies: [],
      categories: [],
      spans: buildRootSpans(calendar, planner),
      leafSpans: buildLeafSpans(calendar, planner),
      showCompleted: false,
    });
    const [goalNode, taskNode] = lanes[0].nodes;
    expect(goalNode.leaves.map((l) => l.id)).toEqual(["leaf-1", "leaf-2"]);
    expect(taskNode.leaves).toEqual([]);
  });

  it("lays an expanded item as a band on its own row: leaf row below the root, lane height accounting both", () => {
    const lanes = buildGraphLanes({
      planner,
      queues: [makeQueue("queue-1", ["goal-1", "task-1"])],
      dependencies: [],
      categories: [],
      spans: buildRootSpans(calendar, planner),
      leafSpans: buildLeafSpans(calendar, planner),
      showCompleted: false,
    });
    const layout = layoutGraph(lanes, { pxPerDay: 30, now: NOW });
    const goal = layout.nodeById.get("goal-1")!;
    const task = layout.nodeById.get("task-1")!;
    const nodeH = layout.nodeHeight;
    const rootH = bandRootHeight(nodeH);

    expect(goal.leaves).toHaveLength(2);
    for (const leaf of goal.leaves) {
      expect(leaf.y).toBe(goal.y + rootH + GRAPH_METRICS.bandGap);
    }
    // The plain member sits on its own row below the whole band.
    expect(task.y).toBeGreaterThanOrEqual(
      goal.y + rootH + GRAPH_METRICS.bandGap + nodeH,
    );
    const lane = layout.lanes[0];
    expect(lane.height).toBe(
      GRAPH_METRICS.laneHeadHeight +
        GRAPH_METRICS.lanePadTop +
        (rootH + GRAPH_METRICS.bandGap + nodeH) +
        GRAPH_METRICS.rowSpacing +
        nodeH +
        GRAPH_METRICS.lanePadBottom,
    );
  });

  it("keeps root-view layout identical when leafSpans is not provided", () => {
    const lanes = buildGraphLanes({
      planner,
      queues: [makeQueue("queue-1", ["goal-1", "task-1"])],
      dependencies: [],
      categories: [],
      spans: buildRootSpans(calendar, planner),
      showCompleted: false,
    });
    const layout = layoutGraph(lanes, { pxPerDay: 30, now: NOW });
    expect(layout.nodeById.get("goal-1")!.leaves).toEqual([]);
    expect(layout.lanes[0].rows).toBe(2);
  });
});
