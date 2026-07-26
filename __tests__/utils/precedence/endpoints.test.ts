import {
  isValidPrecedenceEndpoint,
  isValidDependencyEndpoint,
} from "@/utils/precedence/endpoints";
import type { Planner } from "@/types/prisma";

// Regression #4: a habit is scheduled per-occurrence, never as its bare row, so
// it can't be a queue member or dependency endpoint — admitting one seeds a
// spurious broken-gate and leaves the successor unbounded. Both endpoint
// predicates (the ONE choke point for pickers, engine gate, pruning, and the
// draft apply) must reject habits alongside plans.

function root(id: string, plannerType: Planner["plannerType"]): Planner {
  return { id, parentId: null, plannerType, isTriaged: true } as Planner;
}

describe("precedence endpoints reject habits", () => {
  it("isValidPrecedenceEndpoint admits task/goal, rejects plan/habit", () => {
    expect(isValidPrecedenceEndpoint(root("t", "task"))).toBe(true);
    expect(isValidPrecedenceEndpoint(root("g", "goal"))).toBe(true);
    expect(isValidPrecedenceEndpoint(root("p", "plan"))).toBe(false);
    expect(isValidPrecedenceEndpoint(root("h", "habit"))).toBe(false);
  });

  it("isValidDependencyEndpoint rejects a habit endpoint and a habit-rooted node", () => {
    const habit = root("h", "habit");
    const task = root("t", "task");
    const byId = new Map<string, Planner>([
      [habit.id, habit],
      [task.id, task],
    ]);
    expect(isValidDependencyEndpoint(byId, "t")).toBe(true);
    expect(isValidDependencyEndpoint(byId, "h")).toBe(false);

    // A subtask nested under a habit root is rejected via the root walk.
    const child = {
      id: "c",
      parentId: "h",
      plannerType: "task",
      isTriaged: true,
    } as Planner;
    const nested = new Map<string, Planner>([
      [habit.id, habit],
      [child.id, child],
    ]);
    expect(isValidDependencyEndpoint(nested, "c")).toBe(false);
  });
});
