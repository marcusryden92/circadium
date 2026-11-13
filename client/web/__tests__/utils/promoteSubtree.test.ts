import type { Planner } from "@/types/prisma";
import { promoteSubtree } from "@/utils/goal-handlers/promoteSubtree";
import { fallbackCalendarColor } from "@/utils/colorUtils";

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
      id: "goal-a",
      plannerType: "goal",
      categoryId: "cat-1",
      color: "#112233",
      isReady: true,
      deadline: "2026-02-01T00:00:00.000Z",
    }),
    row({
      id: "branch",
      parentId: "goal-a",
      plannerType: "goal",
      sortOrder: 1024,
      isReady: true,
      color: "#445566",
    }),
    row({
      id: "leaf-1",
      parentId: "branch",
      plannerType: "goal",
      sortOrder: 1024,
      isReady: true,
    }),
    row({
      id: "leaf-2",
      parentId: "branch",
      plannerType: "goal",
      sortOrder: 2048,
      isReady: true,
    }),
    row({
      id: "solo",
      parentId: "goal-a",
      plannerType: "goal",
      sortOrder: 2048,
      isReady: true,
    }),
  ];
}

describe("promoteSubtree refusals", () => {
  it("refuses a missing item", () => {
    expect(promoteSubtree(makePlanner(), "nope")).toHaveProperty("error");
  });

  it("refuses an item that is already a root", () => {
    expect(promoteSubtree(makePlanner(), "goal-a")).toHaveProperty("error");
  });

  it("refuses plan-typed items", () => {
    const planner = [
      row({ id: "root", plannerType: "goal" }),
      row({ id: "p", parentId: "root", plannerType: "plan", sortOrder: 1024 }),
    ];
    expect(promoteSubtree(planner, "p")).toHaveProperty("error");
  });
});

describe("promoteSubtree row patch", () => {
  it("preserves the row id and promotes with root conventions", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    const promoted = byId(result, "branch")!;
    expect(promoted.parentId).toBeNull();
    expect(promoted.sortOrder).toBe(0);
    expect(promoted.isTriaged).toBe(true);
    expect(result.filter((p) => p.id === "branch")).toHaveLength(1);
  });

  it("keeps descendants attached with their sortOrders", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    expect(byId(result, "leaf-1")!.parentId).toBe("branch");
    expect(byId(result, "leaf-1")!.sortOrder).toBe(1024);
    expect(byId(result, "leaf-2")!.sortOrder).toBe(2048);
  });

  it("clears linkedItemId on the promoted row", () => {
    const planner = [
      row({ id: "root", plannerType: "goal" }),
      row({
        id: "placeholder",
        parentId: "root",
        plannerType: "goal",
        linkedItemId: "elsewhere",
        sortOrder: 1024,
      }),
      row({ id: "other", parentId: "root", sortOrder: 2048 }),
      row({ id: "elsewhere", plannerType: "goal" }),
    ];
    const result = asPlanner(promoteSubtree(planner, "placeholder"));
    expect(byId(result, "placeholder")!.linkedItemId).toBeNull();
  });

  it("never touches duration", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "solo"));
    expect(byId(result, "solo")!.duration).toBe(30);
  });
});

describe("promoteSubtree category stamping", () => {
  it("keeps an own categoryId (pre-invariant row)", () => {
    const planner = makePlanner().map((p) =>
      p.id === "branch" ? { ...p, categoryId: "cat-own" } : p,
    );
    const result = asPlanner(promoteSubtree(planner, "branch"));
    expect(byId(result, "branch")!.categoryId).toBe("cat-own");
  });

  it("stamps the ancestor-resolved category", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    expect(byId(result, "branch")!.categoryId).toBe("cat-1");
  });

  it("stamps null when no ancestor carries a category", () => {
    const planner = makePlanner().map((p) =>
      p.id === "goal-a" ? { ...p, categoryId: null } : p,
    );
    const result = asPlanner(promoteSubtree(planner, "branch"));
    expect(byId(result, "branch")!.categoryId).toBeNull();
  });

  it("leaves descendants' categoryId null", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    expect(byId(result, "leaf-1")!.categoryId).toBeNull();
    expect(byId(result, "leaf-2")!.categoryId).toBeNull();
  });
});

describe("promoteSubtree type + readiness", () => {
  it("retypes a childless node to a ready task", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "solo"));
    const promoted = byId(result, "solo")!;
    expect(promoted.plannerType).toBe("task");
    expect(promoted.isReady).toBe(true);
  });

  it("keeps a node with children a goal and carries readiness when it has a deadline", () => {
    const planner = makePlanner().map((p) =>
      p.id === "branch"
        ? { ...p, deadline: "2026-03-01T00:00:00.000Z" }
        : p,
    );
    const result = asPlanner(promoteSubtree(planner, "branch"));
    const promoted = byId(result, "branch")!;
    expect(promoted.plannerType).toBe("goal");
    expect(promoted.isReady).toBe(true);
    expect(byId(result, "leaf-1")!.isReady).toBe(true);
  });

  it("un-readies a promoted goal without a deadline and cascades to the subtree", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    const promoted = byId(result, "branch")!;
    expect(promoted.plannerType).toBe("goal");
    expect(promoted.isReady).toBe(false);
    expect(byId(result, "leaf-1")!.isReady).toBe(false);
    expect(byId(result, "leaf-2")!.isReady).toBe(false);
  });

  it("keeps untouched rows by object identity", () => {
    const planner = makePlanner().map((p) =>
      p.id === "branch"
        ? { ...p, deadline: "2026-03-01T00:00:00.000Z" }
        : p,
    );
    const result = asPlanner(promoteSubtree(planner, "branch"));
    expect(byId(result, "leaf-1")).toBe(byId(planner, "leaf-1"));
    expect(byId(result, "solo")).toBe(byId(planner, "solo"));
  });
});

describe("promoteSubtree emptied-source fixup", () => {
  it("un-readies the old root when it becomes childless", () => {
    const planner = [
      row({
        id: "goal-a",
        plannerType: "goal",
        isReady: true,
        deadline: "2026-02-01T00:00:00.000Z",
      }),
      row({
        id: "only-child",
        parentId: "goal-a",
        plannerType: "goal",
        sortOrder: 1024,
        isReady: true,
      }),
    ];
    const result = asPlanner(promoteSubtree(planner, "only-child"));
    expect(byId(result, "goal-a")!.isReady).toBe(false);
  });

  it("leaves the old root alone when other children remain", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    expect(byId(result, "goal-a")!.isReady).toBe(true);
  });
});

describe("promoteSubtree color", () => {
  it("keeps the row's own color", () => {
    const result = asPlanner(promoteSubtree(makePlanner(), "branch"));
    expect(byId(result, "branch")!.color).toBe("#445566");
  });

  it("falls back to the old root's color", () => {
    const planner = makePlanner().map((p) =>
      p.id === "branch" ? { ...p, color: null } : p,
    );
    const result = asPlanner(promoteSubtree(planner, "branch"));
    expect(byId(result, "branch")!.color).toBe("#112233");
  });

  it("falls back to the deterministic palette pick when neither has a color", () => {
    const planner = makePlanner().map((p) =>
      p.id === "branch" || p.id === "goal-a" ? { ...p, color: null } : p,
    );
    const result = asPlanner(promoteSubtree(planner, "branch"));
    expect(byId(result, "branch")!.color).toBe(fallbackCalendarColor("branch"));
  });
});
