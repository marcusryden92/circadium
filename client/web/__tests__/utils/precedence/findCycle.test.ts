import type { Queue, PlannerDependency, Planner } from "@/types/prisma";
import { collectValidationEdges } from "@/utils/precedence/validationEdges";
import {
  findCycle,
  findCycleInGraph,
  wouldCreateCycleAddingDependency,
  wouldCreateCycleAddingQueueMember,
  wouldCreateCycleReorderingQueueMember,
} from "@/utils/precedence/findCycle";

// Merged-graph cycle validation: queue FULL logical order + dependency edges.
// Legality is authoring-time — the engine never sees a cycle.

const TS = "2026-07-01T00:00:00.000Z";

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

describe("findCycle", () => {
  it("detects a direct two-node cycle", () => {
    const edges = collectValidationEdges([], [makeDependency("A", "B")]);
    const cycle = findCycle(edges, {
      fromId: "B",
      toId: "A",
      source: "dependency",
    });
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toMatchObject({ fromId: "B", toId: "A" });
    expect(cycle![cycle!.length - 1].toId).toBe("B");
  });

  it("allows a redundant same-direction edge", () => {
    // B before D in a pipe, plus "D depends on B" — allowed by design.
    const queues = [makeQueue("pipe", ["B", "D"])];
    expect(
      wouldCreateCycleAddingDependency(queues, [], "B", "D"),
    ).toBeNull();
  });

  it("blocks the contradicting edge with the pipe in the path", () => {
    const queues = [makeQueue("pipe", ["B", "C", "D"])];
    const cycle = wouldCreateCycleAddingDependency(queues, [], "D", "B");
    expect(cycle).not.toBeNull();
    // Candidate first, then the queue path B -> C -> D closing the loop.
    expect(cycle![0]).toMatchObject({ fromId: "D", toId: "B" });
    expect(cycle!.some((e) => e.source === "queue" && e.queueId === "pipe")).toBe(
      true,
    );
  });

  it("finds a cross-pipe cycle where each edge looks innocent", () => {
    // Pipes [A,B] and [C,D] + dep B->C. Adding D->A closes the loop
    // A->B->C->D->A even though no single structure contains it.
    const queues = [makeQueue("q1", ["A", "B"]), makeQueue("q2", ["C", "D"])];
    const dependencies = [makeDependency("B", "C")];
    const cycle = wouldCreateCycleAddingDependency(
      queues,
      dependencies,
      "D",
      "A",
    );
    expect(cycle).not.toBeNull();
    const hops = cycle!.map((e) => `${e.fromId}>${e.toId}`);
    expect(hops).toEqual(["D>A", "A>B", "B>C", "C>D"]);
  });

  it("detects a reorder-induced cycle", () => {
    // Pipe [A,B] plus dep A->B is redundant (legal). Reordering the pipe to
    // [B,A] contradicts the dependency.
    const queues = [makeQueue("pipe", ["A", "B"])];
    const dependencies = [makeDependency("A", "B")];
    expect(
      wouldCreateCycleReorderingQueueMember(
        queues,
        dependencies,
        "pipe",
        "B",
        0,
      ),
    ).not.toBeNull();
    // The same-order reorder stays legal.
    expect(
      wouldCreateCycleReorderingQueueMember(
        queues,
        dependencies,
        "pipe",
        "A",
        0,
      ),
    ).toBeNull();
  });

  it("validates member insertion position", () => {
    // Dep B->A. Appending B after A creates A->B — contradiction. Inserting
    // B before A creates B->A — redundant, legal.
    const queues = [makeQueue("pipe", ["A"])];
    const dependencies = [makeDependency("B", "A")];
    expect(
      wouldCreateCycleAddingQueueMember(queues, dependencies, "pipe", "B"),
    ).not.toBeNull();
    expect(
      wouldCreateCycleAddingQueueMember(queues, dependencies, "pipe", "B", 0),
    ).toBeNull();
  });

  it("validates against the FULL logical order regardless of member state", () => {
    // The validation graph deliberately ignores transparency: even if A's
    // planner is completed (engine chains through it), the pipe edge A->B
    // still exists for legality, so B->A stays blocked — un-completing A
    // must never resurrect a latent cycle. collectValidationEdges never
    // consults planner state at all, which is the point.
    const queues = [makeQueue("pipe", ["A", "B"])];
    const cycle = wouldCreateCycleAddingDependency(queues, [], "B", "A");
    expect(cycle).not.toBeNull();
  });

  it("findCycleInGraph returns null for an acyclic graph", () => {
    const edges = collectValidationEdges(
      [makeQueue("q1", ["A", "B", "C"])],
      [makeDependency("A", "C")],
    );
    expect(findCycleInGraph(edges)).toBeNull();
  });
});

describe("detour contraction", () => {
  // Host H splices target T via a placeholder — for legality they are one
  // node, so any queue/dependency edge connecting them closes a cycle.
  const makePlanner = (id: string, overrides: Partial<Planner> = {}): Planner => ({
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
  });
  const linkedPlanner = () => [
    makePlanner("H", { plannerType: "goal" }),
    makePlanner("ph", { parentId: "H", sortOrder: 1024, linkedItemId: "T" }),
    makePlanner("T", { plannerType: "goal" }),
    makePlanner("X"),
  ];

  it("refuses a dependency between a host and its spliced target, both directions", () => {
    expect(
      wouldCreateCycleAddingDependency([], [], "T", "H", linkedPlanner()),
    ).not.toBeNull();
    expect(
      wouldCreateCycleAddingDependency([], [], "H", "T", linkedPlanner()),
    ).not.toBeNull();
  });

  it("refuses a dependency path that reaches the pair through another item", () => {
    expect(
      wouldCreateCycleAddingDependency(
        [],
        [makeDependency("X", "H")],
        "T",
        "X",
        linkedPlanner(),
      ),
    ).not.toBeNull();
  });

  it("refuses adding a spliced target to a queue that holds its host", () => {
    const queues = [makeQueue("pipe", ["H"])];
    expect(
      wouldCreateCycleAddingQueueMember(
        queues,
        [],
        "pipe",
        "T",
        undefined,
        linkedPlanner(),
      ),
    ).not.toBeNull();
  });

  it("does not poison unrelated mutations — the pair alone is not a cycle", () => {
    const queues = [makeQueue("pipe", ["X"])];
    expect(
      wouldCreateCycleAddingQueueMember(
        queues,
        [],
        "pipe",
        "Y",
        undefined,
        linkedPlanner(),
      ),
    ).toBeNull();
    expect(
      wouldCreateCycleAddingDependency([], [], "X", "Y", linkedPlanner()),
    ).toBeNull();
    expect(
      wouldCreateCycleReorderingQueueMember(
        [makeQueue("pipe", ["X", "Y"])],
        [],
        "pipe",
        "Y",
        0,
        linkedPlanner(),
      ),
    ).toBeNull();
  });
});
