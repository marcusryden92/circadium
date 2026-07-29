import {
  isValidPrecedenceEndpoint,
  isValidDependencyEndpoint,
} from "@/utils/precedence/endpoints";
import { serializePlanRecurrence } from "@/utils/planRecurrence";
import type { Planner } from "@/types/prisma";

// A flexibly recurring item is scheduled per-occurrence, never as its bare
// row, so it can't be a queue member or dependency endpoint — admitting one
// seeds a spurious broken-gate and leaves the successor unbounded. Both
// endpoint predicates (the ONE choke point for pickers, engine gate, pruning,
// and the draft apply) must reject recurring items alongside plans.

const WEEKLY = serializePlanRecurrence({ freq: "weekly", interval: 1 });

function root(
  id: string,
  plannerType: Planner["plannerType"],
  recurrence: string | null = null,
): Planner {
  return { id, parentId: null, plannerType, isTriaged: true, recurrence } as Planner;
}

describe("precedence endpoints reject plans and recurring items", () => {
  it("isValidPrecedenceEndpoint admits task/goal, rejects plan/recurring", () => {
    expect(isValidPrecedenceEndpoint(root("t", "task"))).toBe(true);
    expect(isValidPrecedenceEndpoint(root("g", "goal"))).toBe(true);
    expect(isValidPrecedenceEndpoint(root("p", "plan"))).toBe(false);
    expect(isValidPrecedenceEndpoint(root("rt", "task", WEEKLY))).toBe(false);
    expect(isValidPrecedenceEndpoint(root("rg", "goal", WEEKLY))).toBe(false);
    // A recurring PLAN keeps its fixed-anchor semantics — still rejected as a
    // plan, and the recurrence must not flip anything.
    expect(isValidPrecedenceEndpoint(root("rp", "plan", WEEKLY))).toBe(false);
  });

  it("isValidDependencyEndpoint rejects a recurring-rooted node", () => {
    const recurring = root("r", "task", WEEKLY);
    const task = root("t", "task");
    const byId = new Map<string, Planner>([
      [recurring.id, recurring],
      [task.id, task],
    ]);
    expect(isValidDependencyEndpoint(byId, "t")).toBe(true);
    expect(isValidDependencyEndpoint(byId, "r")).toBe(false);

    // A subtask nested under a recurring goal root is rejected via the root
    // walk (nested recurrence values are inert; only the root's rule counts).
    const recurringGoal = root("rg", "goal", WEEKLY);
    const child = {
      id: "c",
      parentId: "rg",
      plannerType: "task",
      isTriaged: true,
      recurrence: null,
    } as Planner;
    const nested = new Map<string, Planner>([
      [recurringGoal.id, recurringGoal],
      [child.id, child],
    ]);
    expect(isValidDependencyEndpoint(nested, "c")).toBe(false);
  });
});
