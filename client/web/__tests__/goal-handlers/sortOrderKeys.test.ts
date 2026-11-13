import type { Planner } from "@/types/prisma";
import {
  SORT_ORDER_STEP,
  appendKey,
  insertKeyAt,
  sortSiblings,
} from "@/utils/goal-handlers/sortOrderKeys";
import { moveToEdge, moveToMiddle } from "@/utils/goal-handlers/moveItem";
import type { ClickedItem } from "@/lib/taskItem";

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

describe("sortOrderKeys", () => {
  it("appends after the max key, starting from one step on empty groups", () => {
    expect(appendKey([])).toBe(SORT_ORDER_STEP);
    expect(
      appendKey([row({ id: "a", sortOrder: 1024 }), row({ id: "b", sortOrder: 3072 })]),
    ).toBe(3072 + SORT_ORDER_STEP);
    // All-negative groups (from repeated prepends) still append above zero.
    expect(appendKey([row({ id: "a", sortOrder: -2048 })])).toBe(SORT_ORDER_STEP);
  });

  it("inserts with midpoints, step-prepend, and step-append", () => {
    const siblings = [
      row({ id: "a", sortOrder: 1024 }),
      row({ id: "b", sortOrder: 2048 }),
    ];
    expect(insertKeyAt(siblings, 0)).toEqual({ key: 0, reindexed: null });
    expect(insertKeyAt(siblings, 1)).toEqual({ key: 1536, reindexed: null });
    expect(insertKeyAt(siblings, 2)).toEqual({ key: 3072, reindexed: null });
    expect(insertKeyAt([], 0)).toEqual({
      key: SORT_ORDER_STEP,
      reindexed: null,
    });
  });

  it("reindexes the whole group when the gap is too tight for a midpoint", () => {
    const siblings = [
      row({ id: "a", sortOrder: 1 }),
      row({ id: "b", sortOrder: 1 + 1e-9 }),
      row({ id: "c", sortOrder: 5000 }),
    ];
    const { key, reindexed } = insertKeyAt(siblings, 1);
    expect(reindexed).not.toBeNull();
    expect(reindexed!.get("a")).toBe(1 * SORT_ORDER_STEP);
    expect(key).toBe(2 * SORT_ORDER_STEP);
    expect(reindexed!.get("b")).toBe(3 * SORT_ORDER_STEP);
    expect(reindexed!.get("c")).toBe(4 * SORT_ORDER_STEP);
  });

  it("sorts by sortOrder with createdAt then id tie-breaks", () => {
    const sorted = sortSiblings([
      row({ id: "z", sortOrder: 0, createdAt: "2026-01-02T00:00:00.000Z" }),
      row({ id: "b", sortOrder: 2048 }),
      row({ id: "y", sortOrder: 0 }),
      row({ id: "x", sortOrder: 0 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["x", "y", "z", "b"]);
  });
});

describe("moveItem", () => {
  // parent with children a (1024), b (2048), c (3072); "other" goal with o1.
  function makePlanner(): Planner[] {
    return [
      row({ id: "parent", plannerType: "goal" }),
      row({ id: "a", parentId: "parent", sortOrder: 1024 }),
      row({ id: "b", parentId: "parent", sortOrder: 2048 }),
      row({ id: "c", parentId: "parent", sortOrder: 3072 }),
      row({ id: "other", plannerType: "goal" }),
      row({ id: "o1", parentId: "other", sortOrder: 1024 }),
    ];
  }

  function clicked(taskId: string): NonNullable<ClickedItem> {
    return { taskId, taskTitle: taskId };
  }

  function run(
    fn: (update: (next: Planner[] | ((prev: Planner[]) => Planner[])) => void) => void,
  ): Planner[] {
    let result: Planner[] | null = null;
    fn((next) => {
      result = typeof next === "function" ? next([]) : next;
    });
    if (!result) throw new Error("updatePlannerArray was not called");
    return result;
  }

  it("moveToEdge places the moved item between its new neighbors", () => {
    const planner = makePlanner();
    const result = run((update) =>
      moveToEdge({
        planner,
        updatePlannerArray: update,
        currentlyClickedItem: clicked("c"),
        targetId: "b",
        mouseLocationInItem: "top",
      }),
    );
    const moved = result.find((t) => t.id === "c")!;
    expect(moved.parentId).toBe("parent");
    expect(moved.sortOrder).toBeGreaterThan(1024);
    expect(moved.sortOrder).toBeLessThan(2048);
    // Only the moved row changed.
    expect(result.find((t) => t.id === "a")).toBe(planner.find((t) => t.id === "a"));
    expect(result.find((t) => t.id === "b")).toBe(planner.find((t) => t.id === "b"));
  });

  it("moveToEdge bottom appends after the target", () => {
    const planner = makePlanner();
    const result = run((update) =>
      moveToEdge({
        planner,
        updatePlannerArray: update,
        currentlyClickedItem: clicked("a"),
        targetId: "c",
        mouseLocationInItem: "bottom",
      }),
    );
    expect(result.find((t) => t.id === "a")!.sortOrder).toBeGreaterThan(3072);
  });

  it("moveToEdge can move an item across goals", () => {
    const planner = makePlanner();
    const result = run((update) =>
      moveToEdge({
        planner,
        updatePlannerArray: update,
        currentlyClickedItem: clicked("o1"),
        targetId: "b",
        mouseLocationInItem: "top",
      }),
    );
    const moved = result.find((t) => t.id === "o1")!;
    expect(moved.parentId).toBe("parent");
    expect(moved.sortOrder).toBeGreaterThan(1024);
    expect(moved.sortOrder).toBeLessThan(2048);
  });

  it("moveToMiddle appends the moved item as the target's last child", () => {
    const planner = makePlanner();
    const result = run((update) =>
      moveToMiddle({
        planner,
        updatePlannerArray: update,
        currentlyClickedItem: clicked("o1"),
        currentlyHoveredItem: "parent",
      }),
    );
    const moved = result.find((t) => t.id === "o1")!;
    expect(moved.parentId).toBe("parent");
    expect(moved.sortOrder).toBeGreaterThan(3072);
  });

  it("move handlers report whether a move was dispatched", () => {
    const planner = makePlanner();
    const noop = () => {};
    expect(
      moveToMiddle({
        planner,
        updatePlannerArray: noop,
        currentlyClickedItem: clicked("o1"),
        currentlyHoveredItem: "parent",
      }),
    ).toBe(true);
    // Already a child of the target: no move, no flash.
    expect(
      moveToMiddle({
        planner,
        updatePlannerArray: noop,
        currentlyClickedItem: clicked("a"),
        currentlyHoveredItem: "parent",
      }),
    ).toBe(false);
  });

  it("refuses to move a subtree into its own descendant", () => {
    const planner = makePlanner();
    let called = false;
    moveToMiddle({
      planner,
      updatePlannerArray: () => {
        called = true;
      },
      currentlyClickedItem: clicked("parent"),
      currentlyHoveredItem: "b",
    });
    moveToEdge({
      planner,
      updatePlannerArray: () => {
        called = true;
      },
      currentlyClickedItem: clicked("parent"),
      targetId: "b",
      mouseLocationInItem: "top",
    });
    expect(called).toBe(false);
  });
});
