import type { Planner } from "@/types/prisma";
import {
  assignCategoryToSubtrees,
  deleteSubtrees,
  setColorOnSubtrees,
  setPriorityOnRoots,
} from "@/utils/plannerBulkActions";

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
    priority: 0,
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

function makePlanner(): Planner[] {
  return [
    row({ id: "goal-a", plannerType: "goal", categoryId: "cat-1" }),
    row({ id: "a1", parentId: "goal-a", categoryId: "cat-1", sortOrder: 1024 }),
    row({ id: "a2", parentId: "goal-a", sortOrder: 2048 }),
    row({ id: "task-b", priority: 3 }),
    row({ id: "goal-c", plannerType: "goal" }),
    row({ id: "c1", parentId: "goal-c", sortOrder: 1024 }),
  ];
}

const byId = (planner: Planner[], id: string) =>
  planner.find((p) => p.id === id);

describe("deleteSubtrees", () => {
  it("removes the selected roots and their whole subtrees, nothing else", () => {
    const result = deleteSubtrees(makePlanner(), ["goal-a", "task-b"]);
    expect(result.map((p) => p.id)).toEqual(["goal-c", "c1"]);
  });
});

describe("assignCategoryToSubtrees", () => {
  it("sets the category on roots and clears explicit values on descendants", () => {
    const result = assignCategoryToSubtrees(
      makePlanner(),
      ["goal-a", "task-b"],
      "cat-2",
      false,
    );
    expect(byId(result, "goal-a")!.categoryId).toBe("cat-2");
    expect(byId(result, "task-b")!.categoryId).toBe("cat-2");
    expect(byId(result, "a1")!.categoryId).toBeNull();
    expect(byId(result, "a2")!.categoryId).toBeNull();
    expect(byId(result, "goal-c")!.categoryId).toBeNull();
  });

  it("keeps untouched rows by object identity", () => {
    const planner = makePlanner();
    const result = assignCategoryToSubtrees(planner, ["goal-a"], "cat-2", false);
    // a2 already had a null category and no location change: no new object.
    expect(byId(result, "a2")).toBe(byId(planner, "a2"));
    expect(byId(result, "goal-c")).toBe(byId(planner, "goal-c"));
  });

  it("switches locationless rows to inherit a located category", () => {
    const planner = makePlanner().map((p) =>
      p.id === "a1" ? { ...p, locationId: "loc-1" } : p,
    );
    const result = assignCategoryToSubtrees(planner, ["goal-a"], "cat-2", true);
    expect(byId(result, "goal-a")!.useParentLocation).toBe(true);
    // Own location wins over inheritance.
    expect(byId(result, "a1")!.useParentLocation).toBe(false);
    expect(byId(result, "a2")!.useParentLocation).toBe(true);
  });
});

describe("setColorOnSubtrees", () => {
  it("cascades over the whole subtree and leaves others untouched", () => {
    const planner = makePlanner();
    const result = setColorOnSubtrees(planner, ["goal-a"], "#3B82F6");
    expect(byId(result, "goal-a")!.color).toBe("#3B82F6");
    expect(byId(result, "a1")!.color).toBe("#3B82F6");
    expect(byId(result, "a2")!.color).toBe("#3B82F6");
    expect(byId(result, "goal-c")).toBe(byId(planner, "goal-c"));
  });
});

describe("setPriorityOnRoots", () => {
  it("stamps roots only and skips rows already at the value", () => {
    const planner = makePlanner();
    const result = setPriorityOnRoots(planner, ["goal-a", "task-b"], 3);
    expect(byId(result, "goal-a")!.priority).toBe(3);
    expect(byId(result, "a1")!.priority).toBe(0);
    // task-b was already priority 3: identity preserved, no updatedAt churn.
    expect(byId(result, "task-b")).toBe(byId(planner, "task-b"));
  });
});
