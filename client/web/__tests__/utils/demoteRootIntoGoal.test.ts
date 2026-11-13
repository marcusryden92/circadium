import type { Planner, PlannerDependency, Queue, QueueMember } from "@/types/prisma";
import {
  buildDemoteLossManifest,
  demoteRootIntoGoal,
} from "@/utils/goal-handlers/demoteRootIntoGoal";

const TS = "2026-01-01T00:00:00.000Z";

function row(overrides: Partial<Planner> & { id: string }): Planner {
  return {
    title: overrides.id,
    parentId: null,
    plannerType: "task",
    isReady: null,
    isTriaged: true,
    duration: 30,
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
    priority: 4,
    userId: "test-user",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

const byId = (planner: Planner[], id: string) =>
  planner.find((p) => p.id === id);

function asPlanner(result: Planner[] | { error: string }): Planner[] {
  if (!Array.isArray(result)) throw new Error(`unexpected error: ${result.error}`);
  return result;
}

function makePlanner(): Planner[] {
  return [
    row({
      id: "source",
      plannerType: "goal",
      categoryId: "cat-1",
      maxMinutesPerDay: 120,
      isReady: false,
    }),
    row({
      id: "s1",
      parentId: "source",
      plannerType: "goal",
      sortOrder: 1024,
      isReady: false,
    }),
    row({
      id: "target",
      plannerType: "goal",
      isReady: true,
      deadline: "2026-02-01T00:00:00.000Z",
    }),
    row({
      id: "t1",
      parentId: "target",
      plannerType: "goal",
      sortOrder: 1024,
      isReady: true,
    }),
    row({ id: "plan-x", plannerType: "plan", starts: TS }),
  ];
}

describe("demoteRootIntoGoal refusals", () => {
  it("refuses a missing or nested source", () => {
    expect(demoteRootIntoGoal(makePlanner(), "nope", "target")).toHaveProperty("error");
    expect(demoteRootIntoGoal(makePlanner(), "s1", "target")).toHaveProperty("error");
  });

  it("refuses plan-typed sources and targets", () => {
    expect(demoteRootIntoGoal(makePlanner(), "plan-x", "target")).toHaveProperty("error");
    expect(demoteRootIntoGoal(makePlanner(), "source", "plan-x")).toHaveProperty("error");
  });

  it("refuses self and missing/nested targets", () => {
    expect(demoteRootIntoGoal(makePlanner(), "source", "source")).toHaveProperty("error");
    expect(demoteRootIntoGoal(makePlanner(), "source", "nope")).toHaveProperty("error");
    expect(demoteRootIntoGoal(makePlanner(), "source", "t1")).toHaveProperty("error");
  });
});

describe("demoteRootIntoGoal row patch", () => {
  it("nests the source as the last child of the target with invariant clears", () => {
    const result = asPlanner(demoteRootIntoGoal(makePlanner(), "source", "target"));
    const demoted = byId(result, "source")!;
    expect(demoted.parentId).toBe("target");
    expect(demoted.sortOrder).toBe(1024 + 1024);
    expect(demoted.categoryId).toBeNull();
    expect(demoted.maxMinutesPerDay).toBeNull();
    expect(demoted.plannerType).toBe("goal");
    expect(demoted.duration).toBe(30);
  });

  it("stamps the target root's readiness over the whole demoted subtree", () => {
    const result = asPlanner(demoteRootIntoGoal(makePlanner(), "source", "target"));
    expect(byId(result, "source")!.isReady).toBe(true);
    expect(byId(result, "s1")!.isReady).toBe(true);
  });

  it("stamps unready when the target is unready", () => {
    const planner = makePlanner().map((p) =>
      p.id === "target" || p.id === "t1" ? { ...p, isReady: false } : p,
    );
    const withReadySource = planner.map((p) =>
      p.id === "source" || p.id === "s1" ? { ...p, isReady: true } : p,
    );
    const result = asPlanner(
      demoteRootIntoGoal(withReadySource, "source", "target"),
    );
    expect(byId(result, "source")!.isReady).toBe(false);
    expect(byId(result, "s1")!.isReady).toBe(false);
  });

  it("keeps untouched rows by object identity", () => {
    const planner = makePlanner();
    const result = asPlanner(demoteRootIntoGoal(planner, "source", "target"));
    expect(byId(result, "target")).toBe(byId(planner, "target"));
    expect(byId(result, "t1")).toBe(byId(planner, "t1"));
  });
});

describe("demoteRootIntoGoal preserved-edge revalidation", () => {
  const dep = (
    predecessorId: string,
    successorId: string,
  ): PlannerDependency => ({
    id: `dep-${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    userId: "test-user",
    createdAt: TS,
    updatedAt: TS,
  });

  it("refuses when a dependency links the source with the target's tree", () => {
    const result = demoteRootIntoGoal(
      makePlanner(),
      "source",
      "target",
      [],
      [dep("target", "source")],
    );
    expect(result).toHaveProperty("error");

    const nodeEdge = demoteRootIntoGoal(
      makePlanner(),
      "source",
      "target",
      [],
      [dep("s1", "t1")],
    );
    expect(nodeEdge).toHaveProperty("error");
  });

  it("refuses when nesting closes a loop through step orders", () => {
    // External task X: source's subtree must come after X (X -> s1), and X
    // must come after the target's first leaf (t1 -> X). Appending source
    // after t1 keeps t1 -> s1 in the chain: t1 -> X -> s1 fine... the loop
    // needs the OTHER direction: s1 -> X and X -> t-late where t-late sits
    // BEFORE the appended source in the target's chain — chain gives
    // t-late -> ... -> s1, edges give s1 -> X -> t-late.
    const planner = [
      ...makePlanner(),
      row({ id: "x-task" }),
      row({
        id: "t2",
        parentId: "target",
        plannerType: "goal",
        sortOrder: 2048,
        isReady: true,
      }),
    ];
    const result = demoteRootIntoGoal(planner, "source", "target", [], [
      dep("s1", "x-task"),
      dep("x-task", "t2"),
    ]);
    expect(result).toHaveProperty("error");
  });

  it("accepts a demote whose preserved edges stay acyclic", () => {
    const planner = [...makePlanner(), row({ id: "x-task" })];
    const result = demoteRootIntoGoal(planner, "source", "target", [], [
      dep("x-task", "s1"),
    ]);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("buildDemoteLossManifest", () => {
  const member = (plannerId: string): QueueMember => ({
    id: `m-${plannerId}`,
    sortOrder: 1024,
    queueId: "q1",
    plannerId,
    userId: "test-user",
    createdAt: TS,
    updatedAt: TS,
  });
  const queue: Queue = {
    id: "q1",
    title: "Work stream",
    sortOrder: 1,
    color: null,
    categoryId: null,
    userId: "test-user",
    createdAt: TS,
    updatedAt: TS,
    members: [member("source")],
  };
  const dependency = (
    predecessorId: string,
    successorId: string,
  ): PlannerDependency => ({
    id: `${predecessorId}->${successorId}`,
    predecessorId,
    successorId,
    userId: "test-user",
    createdAt: TS,
    updatedAt: TS,
  });

  it("enumerates queue membership, both dependency directions, and detour links", () => {
    const planner = [
      ...makePlanner(),
      row({ id: "peer-a", plannerType: "goal" }),
      row({ id: "peer-b" }),
      row({ id: "host-root", plannerType: "goal" }),
      row({
        id: "host-placeholder",
        parentId: "host-root",
        plannerType: "goal",
        linkedItemId: "source",
        sortOrder: 1024,
      }),
      row({ id: "detour-target", plannerType: "goal" }),
    ].map((p) =>
      p.id === "s1" ? { ...p, linkedItemId: "detour-target" } : p,
    );
    const manifest = buildDemoteLossManifest(
      planner,
      [queue],
      [dependency("peer-a", "source"), dependency("source", "peer-b")],
      "source",
    );
    expect(manifest.queueTitle).toBe("Work stream");
    expect(manifest.dependsOnTitles).toEqual(["peer-a"]);
    expect(manifest.requiredByTitles).toEqual(["peer-b"]);
    expect(manifest.inboundHostTitles).toEqual(["host-root"]);
    expect(manifest.outboundTargetTitles).toEqual(["detour-target"]);
  });

  it("is empty for an unconnected root", () => {
    const manifest = buildDemoteLossManifest(makePlanner(), [], [], "source");
    expect(manifest).toEqual({
      queueTitle: null,
      dependsOnTitles: [],
      requiredByTitles: [],
      inboundHostTitles: [],
      outboundTargetTitles: [],
    });
  });
});
