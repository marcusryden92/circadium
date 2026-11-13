import type { Planner } from "@/types/prisma";
import { plannerForestToJson } from "@/utils/draft/plannerForestToJson";
import {
  foldDraftProposals,
  mergeDraftForest,
} from "@/utils/draft/mergeDraftForest";
import { normalizeDraftForest } from "@/utils/draft/normalizeDraftForest";
import {
  draftForestsEqual,
  diffDraftForest,
} from "@/utils/draft/diffDraftForest";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";

const USER_ID = "test-user";
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
    userId: USER_ID,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function node(overrides: Partial<DraftNode> & { id: string }): DraftNode {
  return {
    title: overrides.id,
    plannerType: "task",
    duration: 30,
    deadline: null,
    priority: 0,
    isReady: null,
    categoryId: null,
    children: [],
    ...overrides,
  };
}

describe("plannerForestToJson", () => {
  it("includes triaged roots with subtrees and excludes inbox jots", () => {
    const planner = [
      row({ id: "goal-a", plannerType: "goal", categoryId: "cat-1" }),
      row({ id: "a1", parentId: "goal-a" }),
      row({ id: "loose-task" }),
      row({ id: "inbox-1", isTriaged: false }),
    ];
    const forest = plannerForestToJson(planner);

    const ids = forest.goals.map((g) => g.id);
    expect(ids).toContain("goal-a");
    expect(ids).toContain("loose-task");
    expect(ids).not.toContain("inbox-1");
    expect(ids).not.toContain("a1");

    const goalA = forest.goals.find((g) => g.id === "goal-a")!;
    expect(goalA.categoryId).toBe("cat-1");
    expect(goalA.children.map((c) => c.id)).toEqual(["a1"]);
    // categoryId is stamped on roots only.
    expect(goalA.children[0].categoryId).toBeNull();
  });
});

describe("mergeDraftForest", () => {
  const base = {
    goals: [
      node({ id: "goal-a", categoryId: "cat-1" }),
      node({ id: "goal-b" }),
    ],
  };

  it("replaces matched roots in place and appends new goals", () => {
    const merged = mergeDraftForest(base, {
      goals: [
        node({ id: "goal-b", title: "renamed b" }),
        node({ id: "", title: "brand new" }),
      ],
      deletedGoalIds: [],
      trustNullCategoryId: false,
    });

    expect(merged.goals.map((g) => g.title)).toEqual([
      "goal-a",
      "renamed b",
      "brand new",
    ]);
  });

  it("drops deleted goals", () => {
    const merged = mergeDraftForest(base, {
      goals: [],
      deletedGoalIds: ["goal-a"],
      trustNullCategoryId: false,
    });
    expect(merged.goals.map((g) => g.id)).toEqual(["goal-b"]);
  });

  it("backfills a retained root's categoryId when the proposal omits it", () => {
    const merged = mergeDraftForest(base, {
      goals: [node({ id: "goal-a", title: "renamed a", categoryId: null })],
      deletedGoalIds: [],
      trustNullCategoryId: false,
    });
    expect(merged.goals[0].categoryId).toBe("cat-1");
  });

  it("trusts a null categoryId from code-computed op trees (clear, not backfill)", () => {
    const merged = mergeDraftForest(base, {
      goals: [node({ id: "goal-a", categoryId: null })],
      deletedGoalIds: [],
      trustNullCategoryId: true,
    });
    expect(merged.goals[0].categoryId).toBeNull();
  });

  it("folds multiple proposals from one turn without clobbering", () => {
    const folded = foldDraftProposals(base, [
      {
        goals: [node({ id: "goal-a", title: "edited a" })],
        deletedGoalIds: [],
        trustNullCategoryId: false,
      },
      {
        goals: [node({ id: "", title: "second-call goal" })],
        deletedGoalIds: [],
        trustNullCategoryId: false,
      },
    ]);
    expect(folded.goals.map((g) => g.title)).toEqual([
      "edited a",
      "goal-b",
      "second-call goal",
    ]);
  });

  it("does not compound when re-applied to the same turn-start base", () => {
    const proposal = {
      goals: [node({ id: "", title: "streaming new goal" })],
      deletedGoalIds: [],
      trustNullCategoryId: false,
    };
    const first = mergeDraftForest(base, proposal);
    const second = mergeDraftForest(base, proposal);
    expect(first.goals).toHaveLength(3);
    expect(second.goals).toHaveLength(3);
  });
});

describe("normalizeDraftForest", () => {
  it("normalizes partial goals and filters malformed deletedGoalIds", () => {
    const proposal = normalizeDraftForest({
      goals: [{ title: "half-streamed" }, null],
      deletedGoalIds: ["goal-a", 42, ""],
    });
    expect(proposal).not.toBeNull();
    expect(proposal!.goals).toHaveLength(1);
    expect(proposal!.goals[0]).toMatchObject({
      id: "",
      title: "half-streamed",
      plannerType: "task",
      categoryId: null,
      children: [],
    });
    expect(proposal!.deletedGoalIds).toEqual(["goal-a"]);
  });
});

describe("diffDraftForest / draftForestsEqual", () => {
  const canonical = {
    goals: [
      node({ id: "goal-a", categoryId: "cat-1" }),
      node({ id: "goal-b" }),
    ],
  };

  it("marks added, deleted, and category-modified goals", () => {
    const working = {
      goals: [
        node({ id: "goal-a", categoryId: "cat-2" }),
        node({ id: "", title: "new goal" }),
      ],
    };
    const diff = diffDraftForest(working, canonical);

    expect(diff.map((d) => [d.title, d.status])).toEqual([
      ["goal-a", "modified"],
      ["new goal", "added"],
      ["goal-b", "deleted"],
    ]);
    expect(diff[0].changedFields).toEqual(["categoryId"]);
  });

  it("is order-insensitive at the top level", () => {
    const reordered = { goals: [...canonical.goals].reverse() };
    expect(draftForestsEqual(canonical, reordered)).toBe(true);
  });

  it("marks a daily-limit change as modified with no merge backfill", () => {
    const capped = {
      goals: [
        node({ id: "goal-a", categoryId: "cat-1", maxMinutesPerDay: 120 }),
        node({ id: "goal-b" }),
      ],
    };
    const diff = diffDraftForest(capped, canonical);
    expect(diff[0].status).toBe("modified");
    expect(diff[0].changedFields).toEqual(["maxMinutesPerDay"]);
    expect(draftForestsEqual(canonical, capped)).toBe(false);

    // Splitting-style contract: a retained root re-emitted WITHOUT the field
    // merges to null (clears) — no categoryId-style backfill.
    const merged = mergeDraftForest(capped, {
      goals: [node({ id: "goal-a", categoryId: "cat-1", title: "edited" })],
      deletedGoalIds: [],
      trustNullCategoryId: false,
    });
    expect(merged.goals[0].maxMinutesPerDay ?? null).toBeNull();
  });

  it("treats an id-less goal as a change", () => {
    const withNew = {
      goals: [...canonical.goals, node({ id: "", title: "new" })],
    };
    expect(draftForestsEqual(canonical, withNew)).toBe(false);
  });
});
