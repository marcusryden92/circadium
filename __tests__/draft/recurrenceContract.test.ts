import { plannerForestToJson } from "@/utils/draft/plannerForestToJson";
import { applyDraftForestToPlanner } from "@/utils/draft/applyDraftForestToPlanner";
import { updateDraftItems } from "@/utils/draft/draftForestOps";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { Planner } from "@/types/prisma";

// The flexible repeat rule rides the draft contract on top-level task/goal
// roots (splitting-style null semantics): the forest json emits it, ops
// validate it (roots only, never plans, mutually exclusive with a deadline),
// and the apply round-trips it — a retained root re-emitted without the rule
// stops repeating, plans keep their own fixed-anchor recurrence untouched,
// and stale nested values are healed away.

const USER_ID = "test-user";
const DAILY = JSON.stringify({ freq: "daily", interval: 1, until: null });

function makePlanner(id: string, overrides: Partial<Planner>): Planner {
  const ts = "2026-01-05T08:00:00.000Z";
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
    userId: USER_ID,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function findGoal(goals: DraftNode[], id: string): DraftNode {
  const goal = goals.find((g) => g.id === id);
  if (!goal) throw new Error(`goal ${id} missing`);
  return goal;
}

describe("recurrence in the draft forest contract", () => {
  it("emits the rule on recurring roots, null for plans and children", () => {
    const recurringTask = makePlanner("rt", { recurrence: DAILY });
    const recurringPlan = makePlanner("rp", {
      plannerType: "plan",
      starts: "2026-01-06T09:00:00.000Z",
      recurrence: DAILY,
    });
    const goal = makePlanner("g", { plannerType: "goal", recurrence: DAILY });
    const child = makePlanner("c", {
      parentId: "g",
      // Stale nested value — must not surface in the contract.
      recurrence: DAILY,
    });

    const forest = plannerForestToJson([recurringTask, recurringPlan, goal, child]);
    expect(findGoal(forest.goals, "rt").recurrence).toEqual({
      freq: "daily",
      interval: 1,
      until: null,
    });
    expect(findGoal(forest.goals, "rp").recurrence).toBeNull();
    expect(findGoal(forest.goals, "g").recurrence).toEqual({
      freq: "daily",
      interval: 1,
      until: null,
    });
    expect(findGoal(forest.goals, "g").children[0].recurrence).toBeNull();
  });

  it("round-trips on retained roots, clears when dropped, heals children", () => {
    const recurringTask = makePlanner("rt", {
      recurrence: DAILY,
      recurrenceExceptions: JSON.stringify([
        { key: "2026-01-06T00:00", type: "deleted" },
      ]),
    });
    const goal = makePlanner("g", { plannerType: "goal", deadline: "2026-03-01" });
    const child = makePlanner("c", { parentId: "g", recurrence: DAILY });
    const planner = [recurringTask, goal, child];

    const working = plannerForestToJson(planner);
    // Give the goal a weekly rule (contract clears its deadline), keep rt's.
    findGoal(working.goals, "g").recurrence = { freq: "weekly", interval: 1 };

    const next = applyDraftForestToPlanner({
      planner,
      workingForest: working,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });

    const rt = next.find((p) => p.id === "rt")!;
    expect(JSON.parse(rt.recurrence!)).toMatchObject({ freq: "daily" });
    // Unchanged rule keeps its per-period skip exceptions.
    expect(rt.recurrenceExceptions).toBe(recurringTask.recurrenceExceptions);

    const g = next.find((p) => p.id === "g")!;
    expect(JSON.parse(g.recurrence!)).toMatchObject({ freq: "weekly" });
    expect(g.deadline).toBeNull();
    // The stale nested value is healed away.
    expect(next.find((p) => p.id === "c")!.recurrence).toBeNull();

    // Second save with the rule dropped from the re-emitted tree stops the
    // repetition and drops the now-meaningless exceptions.
    const cleared = plannerForestToJson(next);
    findGoal(cleared.goals, "rt").recurrence = null;
    const after = applyDraftForestToPlanner({
      planner: next,
      workingForest: cleared,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    const rtAfter = after.find((p) => p.id === "rt")!;
    expect(rtAfter.recurrence).toBeNull();
    expect(rtAfter.recurrenceExceptions).toBeNull();
  });

  it("preserves a retained plan's own recurrence outside the contract", () => {
    const plan = makePlanner("rp", {
      plannerType: "plan",
      starts: "2026-01-06T09:00:00.000Z",
      recurrence: DAILY,
    });
    const planner = [plan];
    const working = plannerForestToJson(planner);
    findGoal(working.goals, "rp").title = "Renamed plan";

    const next = applyDraftForestToPlanner({
      planner,
      workingForest: working,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    const row = next.find((p) => p.id === "rp")!;
    expect(row.plannerType).toBe("plan");
    expect(row.recurrence).toBe(DAILY);
  });

  it("a repeat rule satisfies the goal readiness gate in place of a deadline", () => {
    const goal = makePlanner("g", { plannerType: "goal", isReady: false });
    const child = makePlanner("c", { parentId: "g", isReady: false });
    const planner = [goal, child];
    const working = plannerForestToJson(planner);
    const workingGoal = findGoal(working.goals, "g");
    workingGoal.recurrence = { freq: "weekly", interval: 1 };
    workingGoal.isReady = true;

    const next = applyDraftForestToPlanner({
      planner,
      workingForest: working,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    expect(next.find((p) => p.id === "g")!.isReady).toBe(true);
    expect(next.find((p) => p.id === "c")!.isReady).toBe(true);
  });
});

describe("recurrence in update_items", () => {
  const forestOf = (planner: Planner[]) => plannerForestToJson(planner);

  it("sets the rule on a root task and clears its deadline", () => {
    const task = makePlanner("t", { deadline: "2026-02-01" });
    const result = updateDraftItems(
      forestOf([task]),
      [{ id: "t", recurrence: { freq: "weekly" } }],
      new Set<string>(),
    );
    expect(result.failures).toHaveLength(0);
    const node = result.forest.goals[0];
    expect(node.recurrence).toEqual({ freq: "weekly", interval: 1, until: null });
    expect(node.deadline).toBeNull();
  });

  it("rejects the rule on subtasks and plans, accepts null as a clear", () => {
    const goal = makePlanner("g", { plannerType: "goal" });
    const child = makePlanner("c", { parentId: "g" });
    const plan = makePlanner("p", {
      plannerType: "plan",
      starts: "2026-01-06T09:00:00.000Z",
    });
    const recurring = makePlanner("r", { recurrence: DAILY });
    const forest = forestOf([goal, child, plan, recurring]);

    const onChild = updateDraftItems(
      forest,
      [{ id: "c", recurrence: { freq: "daily" } }],
      new Set<string>(),
    );
    expect(onChild.failures).toHaveLength(1);

    const onPlan = updateDraftItems(
      forest,
      [{ id: "p", recurrence: { freq: "daily" } }],
      new Set<string>(),
    );
    expect(onPlan.failures).toHaveLength(1);

    const clear = updateDraftItems(
      forest,
      [{ id: "r", recurrence: null }],
      new Set<string>(),
    );
    expect(clear.failures).toHaveLength(0);
    expect(
      clear.forest.goals.find((g) => g.id === "r")!.recurrence,
    ).toBeNull();
  });
});
