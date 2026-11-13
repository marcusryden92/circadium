import type { Planner, Queue, PlannerDependency } from "@/types/prisma";
import {
  buildPrecedenceEdges,
  buildPredecessorMap,
} from "@/utils/calendar-generation/helpers/Scheduler/precedenceEdges";

// The GATED edge builder — transparency applied, unlike the validation
// builder: completed members/predecessors carry no bound, unready-goal queue
// members are silently chained through, and unready-goal DEPENDENCY
// predecessors are kept so the gate can be loud about them.

const TS = "2026-07-01T00:00:00.000Z";

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
    userId: "u",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeQueue(id: string, memberPlannerIds: string[]): Queue {
  return {
    id,
    title: id,
    sortOrder: 0,
    color: null,
    categoryId: null,
    userId: "u",
    createdAt: TS,
    updatedAt: TS,
    members: memberPlannerIds.map((plannerId, i) => ({
      id: `${id}-m${i}`,
      sortOrder: (i + 1) * 1024,
      queueId: id,
      plannerId,
      userId: "u",
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
    userId: "u",
    createdAt: TS,
    updatedAt: TS,
  };
}

const hops = (edges: { fromId: string; toId: string }[]) =>
  edges.map((e) => `${e.fromId}>${e.toId}`);

describe("buildPrecedenceEdges", () => {
  it("emits consecutive-pair edges in sortOrder order", () => {
    const planner = [makePlanner("a"), makePlanner("b"), makePlanner("c")];
    const queue = makeQueue("q", ["a", "b", "c"]);
    // Scramble the stored array order; sortOrder decides.
    queue.members.reverse();
    const edges = buildPrecedenceEdges([queue], [], planner);
    expect(hops(edges)).toEqual(["a>b", "b>c"]);
    expect(edges.every((e) => e.source === "queue" && e.queueId === "q")).toBe(
      true,
    );
  });

  it("chains through transparent members (completed + unready goal)", () => {
    const planner = [
      makePlanner("a"),
      makePlanner("done", { completedStartTime: TS, completedEndTime: TS }),
      makePlanner("unready-goal", { plannerType: "goal", isReady: false }),
      makePlanner("b"),
    ];
    const edges = buildPrecedenceEdges(
      [makeQueue("q", ["a", "done", "unready-goal", "b"])],
      [],
      planner,
    );
    expect(hops(edges)).toEqual(["a>b"]);
  });

  it("re-filters defensively: missing, nested, plan-typed, untriaged members drop", () => {
    const planner = [
      makePlanner("a"),
      makePlanner("nested", { parentId: "a" }),
      makePlanner("plan", { plannerType: "plan", starts: TS }),
      makePlanner("untriaged", { isTriaged: false }),
      makePlanner("b"),
    ];
    const edges = buildPrecedenceEdges(
      [makeQueue("q", ["a", "missing", "nested", "plan", "untriaged", "b"])],
      [],
      planner,
    );
    expect(hops(edges)).toEqual(["a>b"]);
  });

  it("keeps unready-goal DEPENDENCY predecessors but drops completed ones", () => {
    const planner = [
      makePlanner("unready-goal", { plannerType: "goal", isReady: false }),
      makePlanner("done", { completedStartTime: TS, completedEndTime: TS }),
      makePlanner("target"),
    ];
    const edges = buildPrecedenceEdges(
      [],
      [
        makeDependency("unready-goal", "target"),
        makeDependency("done", "target"),
      ],
      planner,
    );
    expect(hops(edges)).toEqual(["unready-goal>target"]);
    expect(edges[0].source).toBe("dependency");
  });

  it("empty and singleton queues emit no edges", () => {
    const planner = [makePlanner("a")];
    expect(
      buildPrecedenceEdges(
        [makeQueue("empty", []), makeQueue("single", ["a"])],
        [],
        planner,
      ),
    ).toEqual([]);
  });
});

describe("buildPredecessorMap", () => {
  it("groups multiple incoming edges per target", () => {
    const planner = [
      makePlanner("a"),
      makePlanner("b"),
      makePlanner("target"),
    ];
    const edges = buildPrecedenceEdges(
      [makeQueue("q", ["a", "target"])],
      [makeDependency("b", "target")],
      planner,
    );
    const map = buildPredecessorMap(edges);
    const incoming = map.get("target")!;
    expect(incoming).toHaveLength(2);
    expect(new Set(incoming.map((e) => e.fromId))).toEqual(
      new Set(["a", "b"]),
    );
    expect(map.get("a")).toBeUndefined();
  });
});
