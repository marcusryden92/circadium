import { plannerForestToJson } from "@/utils/draft/plannerForestToJson";
import { applyDraftForestToPlanner } from "@/utils/draft/applyDraftForestToPlanner";
import { updateDraftItems, addDraftItems } from "@/utils/draft/draftForestOps";
import { diffDraftTree } from "@/utils/draft/diffDraftTree";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { Planner } from "@/types/prisma";

// earliestStartDate and allowedTimes ride the draft contract on tasks and goals
// at ANY depth (per-node, inherited down the tree) — unlike categoryId/color/
// recurrence which are root-only. The forest json emits them from every node,
// update_items sets them on any id (rejecting plans), and the apply serializes
// them to the string columns with splitting-style null semantics: a retained
// node re-emitted without one clears it. Plans never carry them.

const USER_ID = "test-user";
const CREATED_AT = "2026-01-05T08:00:00.000Z";

function makePlanner(id: string, overrides: Partial<Planner>): Planner {
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
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function findGoal(goals: DraftNode[], id: string): DraftNode {
  const goal = goals.find((g) => g.id === id);
  if (!goal) throw new Error(`goal ${id} missing`);
  return goal;
}

const EARLIEST = "2026-09-01T00:00:00.000Z";
// weekend mornings
const WEEKEND_MORNINGS = JSON.stringify({
  days: [0, 6],
  ranges: [{ startTime: "06:00", endTime: "12:00" }],
});

describe("scheduling constraints in the draft forest contract", () => {
  it("emits both on tasks/goals at any depth, null for plans", () => {
    const goal = makePlanner("g", {
      plannerType: "goal",
      earliestStartDate: EARLIEST,
    });
    // A DESCENDANT carrying its own allowed times — per-node, unlike recurrence.
    const child = makePlanner("c", {
      parentId: "g",
      allowedTimes: WEEKEND_MORNINGS,
    });
    const plan = makePlanner("p", {
      plannerType: "plan",
      starts: "2026-01-06T09:00:00.000Z",
      // Stale (inert for plans) — must not surface in the contract.
      earliestStartDate: EARLIEST,
      allowedTimes: WEEKEND_MORNINGS,
    });

    const forest = plannerForestToJson([goal, child, plan]);
    const g = findGoal(forest.goals, "g");
    expect(g.earliestStartDate).toBe(EARLIEST);
    expect(g.allowedTimes).toBeNull();
    expect(g.children[0].allowedTimes).toEqual({
      days: [0, 6],
      ranges: [{ startTime: "06:00", endTime: "12:00" }],
    });
    expect(g.children[0].earliestStartDate).toBeNull();

    const p = findGoal(forest.goals, "p");
    expect(p.earliestStartDate).toBeNull();
    expect(p.allowedTimes).toBeNull();
  });

  it("round-trips on a retained root and descendant, clears when dropped", () => {
    const goal = makePlanner("g", {
      plannerType: "goal",
      deadline: "2026-12-01",
    });
    const child = makePlanner("c", { parentId: "g" });
    const planner = [goal, child];

    const working = plannerForestToJson(planner);
    findGoal(working.goals, "g").earliestStartDate = EARLIEST;
    findGoal(working.goals, "g").children[0].allowedTimes = {
      days: [6, 0],
      ranges: [{ startTime: "06:00", endTime: "12:00" }],
    };

    const next = applyDraftForestToPlanner({
      planner,
      workingForest: working,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });

    const g = next.find((p) => p.id === "g")!;
    expect(g.earliestStartDate).toBe(EARLIEST);
    expect(g.allowedTimes).toBeNull();
    const c = next.find((p) => p.id === "c")!;
    expect(c.earliestStartDate).toBeNull();
    // days are normalized ascending; range preserved.
    expect(JSON.parse(c.allowedTimes!)).toEqual({
      days: [0, 6],
      ranges: [{ startTime: "06:00", endTime: "12:00" }],
    });

    // Second save with both dropped from the re-emitted tree clears them.
    const cleared = plannerForestToJson(next);
    findGoal(cleared.goals, "g").earliestStartDate = null;
    findGoal(cleared.goals, "g").children[0].allowedTimes = null;
    const after = applyDraftForestToPlanner({
      planner: next,
      workingForest: cleared,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    expect(after.find((p) => p.id === "g")!.earliestStartDate).toBeNull();
    expect(after.find((p) => p.id === "c")!.allowedTimes).toBeNull();
  });

  it("heals a stale constraint on a plan to null on save", () => {
    const plan = makePlanner("p", {
      plannerType: "plan",
      starts: "2026-01-06T09:00:00.000Z",
      earliestStartDate: EARLIEST,
      allowedTimes: WEEKEND_MORNINGS,
    });
    const planner = [plan];
    const working = plannerForestToJson(planner);
    findGoal(working.goals, "p").title = "Renamed plan";

    const next = applyDraftForestToPlanner({
      planner,
      workingForest: working,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    const row = next.find((p) => p.id === "p")!;
    expect(row.plannerType).toBe("plan");
    expect(row.earliestStartDate).toBeNull();
    expect(row.allowedTimes).toBeNull();
  });

  it("serializes constraints on newly created roots and subtasks", () => {
    // A brand-new goal (no id) with a constrained subtask.
    const newGoal: DraftNode = {
      id: "",
      title: "Thesis",
      plannerType: "goal",
      duration: 60,
      deadline: "2026-12-01",
      priority: 5,
      isReady: false,
      categoryId: null,
      earliestStartDate: EARLIEST,
      allowedTimes: null,
      children: [
        {
          id: "",
          title: "Research",
          plannerType: "task",
          duration: 90,
          deadline: null,
          priority: 5,
          isReady: null,
          categoryId: null,
          allowedTimes: {
            days: [6, 0],
            ranges: [{ startTime: "06:00", endTime: "12:00" }],
          },
          children: [],
        },
      ],
    };

    const next = applyDraftForestToPlanner({
      planner: [],
      workingForest: { goals: [newGoal] },
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    const root = next.find((p) => !p.parentId)!;
    expect(root.earliestStartDate).toBe(EARLIEST);
    const leaf = next.find((p) => p.parentId === root.id)!;
    expect(JSON.parse(leaf.allowedTimes!)).toEqual({
      days: [0, 6],
      ranges: [{ startTime: "06:00", endTime: "12:00" }],
    });
  });
});

describe("scheduling constraints in update_items", () => {
  it("sets both on a subtask (per-node, any depth)", () => {
    const goal = makePlanner("g", { plannerType: "goal" });
    const child = makePlanner("c", { parentId: "g" });
    const result = updateDraftItems(
      plannerForestToJson([goal, child]),
      [
        {
          id: "c",
          earliestStartDate: EARLIEST,
          allowedTimes: { days: [1, 2, 3, 4, 5], ranges: null },
        },
      ],
      new Set<string>(),
    );
    expect(result.failures).toHaveLength(0);
    const node = findGoal(result.forest.goals, "g").children[0];
    expect(node.earliestStartDate).toBe(EARLIEST);
    expect(node.allowedTimes).toEqual({ days: [1, 2, 3, 4, 5], ranges: null });
  });

  it("rejects both on plans, accepts null as a clear", () => {
    const plan = makePlanner("p", {
      plannerType: "plan",
      starts: "2026-01-06T09:00:00.000Z",
    });
    const task = makePlanner("t", {
      earliestStartDate: EARLIEST,
      allowedTimes: WEEKEND_MORNINGS,
    });
    const forest = plannerForestToJson([plan, task]);

    const onPlanEarliest = updateDraftItems(
      forest,
      [{ id: "p", earliestStartDate: EARLIEST }],
      new Set<string>(),
    );
    expect(onPlanEarliest.failures).toHaveLength(1);

    const onPlanAllowed = updateDraftItems(
      forest,
      [{ id: "p", allowedTimes: { days: [1], ranges: null } }],
      new Set<string>(),
    );
    expect(onPlanAllowed.failures).toHaveLength(1);

    const clear = updateDraftItems(
      forest,
      [{ id: "t", earliestStartDate: null, allowedTimes: null }],
      new Set<string>(),
    );
    expect(clear.failures).toHaveLength(0);
    const cleared = findGoal(clear.forest.goals, "t");
    expect(cleared.earliestStartDate).toBeNull();
    expect(cleared.allowedTimes).toBeNull();
  });

  it("rejects a malformed earliest start date", () => {
    const task = makePlanner("t", {});
    const result = updateDraftItems(
      plannerForestToJson([task]),
      [{ id: "t", earliestStartDate: "not-a-date" }],
      new Set<string>(),
    );
    expect(result.failures).toHaveLength(1);
    expect(findGoal(result.forest.goals, "t").earliestStartDate).toBeNull();
  });

  it("normalizes allowed times: all seven days clears, a real pattern sets", () => {
    const task = makePlanner("t", {});
    const forest = plannerForestToJson([task]);

    const allSeven = updateDraftItems(
      forest,
      [{ id: "t", allowedTimes: { days: [0, 1, 2, 3, 4, 5, 6], ranges: null } }],
      new Set<string>(),
    );
    expect(allSeven.failures).toHaveLength(0);
    // Every day + no ranges is no restriction at all.
    expect(findGoal(allSeven.forest.goals, "t").allowedTimes).toBeNull();

    const real = updateDraftItems(
      forest,
      [
        {
          id: "t",
          allowedTimes: {
            days: [1, 2],
            ranges: [{ startTime: "08:00", endTime: "12:00" }],
          },
        },
      ],
      new Set<string>(),
    );
    expect(real.failures).toHaveLength(0);
    expect(findGoal(real.forest.goals, "t").allowedTimes).toEqual({
      days: [1, 2],
      ranges: [{ startTime: "08:00", endTime: "12:00" }],
    });
  });

  it("preserves constraints through add_items minting", () => {
    const goal = makePlanner("g", { plannerType: "goal" });
    const result = addDraftItems(plannerForestToJson([goal]), {
      parentId: "g",
      items: [
        {
          title: "Study",
          plannerType: "task",
          duration: 60,
          children: [],
          earliestStartDate: EARLIEST,
          allowedTimes: {
            days: [6, 0],
            ranges: [{ startTime: "06:00", endTime: "12:00" }],
          },
        },
      ],
    });
    expect(result.failures).toHaveLength(0);
    const added = findGoal(result.forest.goals, "g").children[0];
    expect(added.id.length).toBeGreaterThan(0);
    expect(added.earliestStartDate).toBe(EARLIEST);
    expect(added.allowedTimes).toEqual({
      days: [0, 6],
      ranges: [{ startTime: "06:00", endTime: "12:00" }],
    });
  });
});

describe("scheduling constraints diff", () => {
  const nodeOf = (planner: Planner[]) => plannerForestToJson(planner).goals[0];
  const clone = (node: DraftNode): DraftNode =>
    JSON.parse(JSON.stringify(node)) as DraftNode;

  it("flags a changed earliest start date and allowed times", () => {
    const canonical = nodeOf([makePlanner("t", {})]);

    const withEarliest = clone(canonical);
    withEarliest.earliestStartDate = EARLIEST;
    expect(diffDraftTree(withEarliest, canonical)!.changedFields).toContain(
      "earliestStartDate",
    );

    const withAllowed = clone(canonical);
    withAllowed.allowedTimes = { days: [1], ranges: null };
    expect(diffDraftTree(withAllowed, canonical)!.changedFields).toContain(
      "allowedTimes",
    );
  });

  it("does not flag an unchanged node", () => {
    const canonical = nodeOf([
      makePlanner("t", {
        earliestStartDate: EARLIEST,
        allowedTimes: WEEKEND_MORNINGS,
      }),
    ]);
    const same = clone(canonical);
    const diff = diffDraftTree(same, canonical)!;
    expect(diff.changedFields).not.toContain("earliestStartDate");
    expect(diff.changedFields).not.toContain("allowedTimes");
    expect(diff.status).toBe("unchanged");
  });
});
