import type { Planner } from "@/types/prisma";
import {
  toggleGoalIsReady,
  setGoalIsReady,
} from "@/utils/goal-handlers/toggleGoalIsReady";

type UpdateFn = (
  planner: Planner[] | ((prev: Planner[]) => Planner[]),
  label: string,
) => void;

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

// root goal -> sub (goal) -> leaf1, leaf2; plus an unrelated standalone task.
function makePlanner(rootIsReady: boolean | null): Planner[] {
  return [
    row({ id: "root", plannerType: "goal", isReady: rootIsReady }),
    row({ id: "sub", plannerType: "goal", parentId: "root" }),
    row({ id: "leaf1", parentId: "sub", sortOrder: 1024 }),
    row({ id: "leaf2", parentId: "sub", sortOrder: 2048 }),
    row({ id: "other" }),
  ];
}

function apply(
  planner: Planner[],
  fn: (update: UpdateFn) => void,
): Planner[] {
  let next = planner;
  const update: UpdateFn = (setter) => {
    next = typeof setter === "function" ? setter(next) : setter;
  };
  fn(update);
  return next;
}

describe("readiness cascades through the subtree", () => {
  it("toggling a root on readies every descendant", () => {
    const result = apply(makePlanner(null), (update) =>
      toggleGoalIsReady(update, "root", "ready test"),
    );
    for (const id of ["root", "sub", "leaf1", "leaf2"]) {
      expect(result.find((p) => p.id === id)!.isReady).toBe(true);
    }
    expect(result.find((p) => p.id === "other")!.isReady).toBeNull();
  });

  it("toggling a ready root off un-readies every descendant", () => {
    const ready = makePlanner(true).map((p) =>
      p.id === "other" ? p : { ...p, isReady: true },
    );
    const result = apply(ready, (update) =>
      toggleGoalIsReady(update, "root", "ready test"),
    );
    for (const id of ["root", "sub", "leaf1", "leaf2"]) {
      expect(result.find((p) => p.id === id)!.isReady).toBe(false);
    }
  });

  it("setGoalIsReady applies the value to the whole subtree", () => {
    const result = apply(makePlanner(null), (update) =>
      setGoalIsReady(update, "root", true, "ready test"),
    );
    for (const id of ["root", "sub", "leaf1", "leaf2"]) {
      expect(result.find((p) => p.id === id)!.isReady).toBe(true);
    }
    expect(result.find((p) => p.id === "other")!.isReady).toBeNull();
  });

  it("does nothing for an unknown id", () => {
    const planner = makePlanner(null);
    const result = apply(planner, (update) =>
      toggleGoalIsReady(update, "missing", "ready test"),
    );
    expect(result).toBe(planner);
  });
});
