import {
  draftHabitsStateEqual,
  habitsToDraftState,
  normalizeDraftHabitsState,
  pruneDraftHabits,
  type DraftHabitsState,
} from "@/utils/draft/draftHabits";
import {
  addDraftHabitBuckets,
  addDraftHabitItems,
  addDraftHabits,
  deleteDraftHabitBuckets,
  updateDraftHabitBuckets,
  updateDraftHabits,
} from "@/utils/draft/draftHabitOps";
import { buildHabitChangeSet } from "@/utils/draft/applyDraftHabits";
import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { Habit, HabitBucket, HabitItem, Planner } from "@/types/prisma";

// The habits draft domain: buckets are the habits surface's own grouping
// (engine-minted uuids that become the DB ids, like queues), habits reference
// them via bucketId, and tracked items must be top-level REPEATING rows —
// task/goal roots by their contract recurrence, plans by the caller-derived
// recurring-plan id set.

const USER_ID = "u";

function node(overrides: Partial<DraftNode> & { id: string }): DraftNode {
  return {
    title: overrides.id,
    plannerType: "task",
    duration: 30,
    deadline: null,
    priority: 4,
    isReady: true,
    categoryId: null,
    children: [],
    ...overrides,
  };
}

function forest(...goals: DraftNode[]): DraftForest {
  return { goals };
}

const WEEKLY = { freq: "weekly" as const, interval: 1 };

function state(overrides: Partial<DraftHabitsState> = {}): DraftHabitsState {
  return { buckets: [], habits: [], ...overrides };
}

describe("draft habit bucket ops", () => {
  it("mints bucket ids on add and reports them", () => {
    const result = addDraftHabitBuckets(state(), [
      { name: "Health", color: "#2E7D32" },
      { name: "  " },
    ]);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(result.state.buckets).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
  });

  it("deleting a bucket unsorts its habits instead of dropping them", () => {
    const start = state({
      buckets: [{ id: "b1", name: "Health", color: null }],
      habits: [
        { id: "h1", name: "Meditate", color: null, bucketId: "b1", itemPlannerIds: [] },
      ],
    });
    const result = deleteDraftHabitBuckets(start, ["b1"]);
    expect(result.state.buckets).toHaveLength(0);
    expect(result.state.habits[0].bucketId).toBeNull();
  });

  it("patches bucket fields and refuses unknown ids", () => {
    const start = state({
      buckets: [{ id: "b1", name: "Health", color: null }],
    });
    const ok = updateDraftHabitBuckets(start, [
      { id: "b1", name: "Wellbeing", color: "#16A085" },
    ]);
    expect(ok.state.buckets[0]).toEqual({
      id: "b1",
      name: "Wellbeing",
      color: "#16A085",
    });
    const missing = updateDraftHabitBuckets(start, [{ id: "nope" }]);
    expect(missing.failures[0].reason).toBe("bucket not found");
  });
});

describe("draft habit ops — buckets and repeating items", () => {
  it("files a habit into a bucket created the same turn; unknown buckets fail", () => {
    const withBucket = addDraftHabitBuckets(state(), [{ name: "Health" }]);
    const bucketId = withBucket.added[0].id;
    const ok = addDraftHabits(
      withBucket.state,
      [{ name: "Meditate", bucketId }],
      forest(),
      new Set(),
    );
    expect(ok.state.habits[0].bucketId).toBe(bucketId);

    const bad = addDraftHabits(
      state(),
      [{ name: "Meditate", bucketId: "category-id" }],
      forest(),
      new Set(),
    );
    expect(bad.state.habits).toHaveLength(0);
    expect(bad.failures[0].reason).toContain("unknown bucketId");
  });

  it("accepts repeating task/goal roots and refuses one-offs with a reason", () => {
    const trees = forest(
      node({ id: "repeats", recurrence: WEEKLY }),
      node({ id: "oneoff" }),
    );
    const result = addDraftHabits(
      state(),
      [{ name: "Meditate", itemPlannerIds: ["repeats", "oneoff"] }],
      trees,
      new Set(),
    );
    expect(result.state.habits[0].itemPlannerIds).toEqual(["repeats"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe("oneoff");
    expect(result.failures[0].reason).toContain("doesn't repeat");
  });

  it("plans qualify only through the recurring-plan id set", () => {
    const trees = forest(
      node({ id: "plan-r", plannerType: "plan" }),
      node({ id: "plan-static", plannerType: "plan" }),
    );
    const start = state({
      habits: [
        { id: "h1", name: "Show up", color: null, bucketId: null, itemPlannerIds: [] },
      ],
    });
    const result = addDraftHabitItems(
      start,
      { habitId: "h1", itemIds: ["plan-r", "plan-static"] },
      trees,
      new Set(["plan-r"]),
    );
    expect(result.state.habits[0].itemPlannerIds).toEqual(["plan-r"]);
    expect(result.failures[0].id).toBe("plan-static");
  });

  it("update_habits validates bucketId against the working buckets", () => {
    const start = state({
      buckets: [{ id: "b1", name: "Health", color: null }],
      habits: [
        { id: "h1", name: "Meditate", color: null, bucketId: null, itemPlannerIds: [] },
      ],
    });
    const ok = updateDraftHabits(
      start,
      [{ id: "h1", bucketId: "b1" }],
      forest(),
      new Set(),
    );
    expect(ok.state.habits[0].bucketId).toBe("b1");
    const bad = updateDraftHabits(
      start,
      [{ id: "h1", bucketId: "not-a-bucket" }],
      forest(),
      new Set(),
    );
    expect(bad.failures[0].reason).toContain("unknown bucketId");
    expect(bad.state.habits[0].bucketId).toBeNull();
  });
});

describe("draft habit state helpers", () => {
  it("equality treats bucket and habit list order as non-semantic", () => {
    const a = state({
      buckets: [
        { id: "b1", name: "Health", color: null },
        { id: "b2", name: "Home", color: null },
      ],
      habits: [
        { id: "h1", name: "A", color: null, bucketId: "b1", itemPlannerIds: ["x", "y"] },
      ],
    });
    const b = state({
      buckets: [
        { id: "b2", name: "Home", color: null },
        { id: "b1", name: "Health", color: null },
      ],
      habits: [
        { id: "h1", name: "A", color: null, bucketId: "b1", itemPlannerIds: ["y", "x"] },
      ],
    });
    expect(draftHabitsStateEqual(a, b)).toBe(true);
    b.buckets[0].color = "#111111";
    expect(draftHabitsStateEqual(a, b)).toBe(false);
  });

  it("normalize round-trips the full-state event payload", () => {
    const original = state({
      buckets: [{ id: "b1", name: "Health", color: "#2E7D32" }],
      habits: [
        { id: "h1", name: "A", color: null, bucketId: "b1", itemPlannerIds: ["x"] },
      ],
    });
    const normalized = normalizeDraftHabitsState(
      JSON.parse(JSON.stringify(original)),
    );
    expect(normalized).toEqual(original);
    expect(normalizeDraftHabitsState({ habits: [] })).toBeNull();
  });

  it("prune drops orphaned item references but never buckets", () => {
    const start = state({
      buckets: [{ id: "b1", name: "Health", color: null }],
      habits: [
        { id: "h1", name: "A", color: null, bucketId: "b1", itemPlannerIds: ["gone", "kept"] },
      ],
    });
    const pruned = pruneDraftHabits(
      start,
      forest(node({ id: "kept", recurrence: WEEKLY })),
    );
    expect(pruned.changed).toBe(true);
    expect(pruned.state.habits[0].itemPlannerIds).toEqual(["kept"]);
    expect(pruned.state.buckets).toHaveLength(1);
    const idempotent = pruneDraftHabits(
      pruned.state,
      forest(node({ id: "kept", recurrence: WEEKLY })),
    );
    expect(idempotent.changed).toBe(false);
    expect(idempotent.state).toBe(pruned.state);
  });
});

function makeBucketRow(id: string, name: string): HabitBucket {
  return {
    id,
    userId: USER_ID,
    name,
    color: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeHabitRow(id: string, bucketId: string | null = null): Habit {
  return {
    id,
    userId: USER_ID,
    name: id,
    color: null,
    bucketId,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeItemRow(habitId: string, plannerId: string): HabitItem {
  return {
    id: `${habitId}|${plannerId}`,
    habitId,
    plannerId,
    userId: USER_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makePlannerRow(id: string, overrides: Partial<Planner> = {}): Planner {
  return {
    id,
    title: id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 30,
    deadline: null,
    starts: null,
    recurrence: JSON.stringify(WEEKLY),
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
    userId: USER_ID,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildHabitChangeSet", () => {
  it("returns null when nothing changed", () => {
    const canonical = habitsToDraftState(
      [makeBucketRow("b1", "Health")],
      [makeHabitRow("h1", "b1")],
      [makeItemRow("h1", "task-1")],
    );
    expect(
      buildHabitChangeSet({
        canonical,
        working: canonical,
        currentBuckets: [makeBucketRow("b1", "Health")],
        currentHabits: [makeHabitRow("h1", "b1")],
        currentItems: [makeItemRow("h1", "task-1")],
        nextPlanner: [makePlannerRow("task-1")],
        nodeIdMap: new Map(),
      }),
    ).toBeNull();
  });

  it("emits bucket deltas and lets creates reference created buckets", () => {
    const canonical = state();
    const working = state({
      buckets: [{ id: "new-bucket", name: "Health", color: "#2E7D32" }],
      habits: [
        {
          id: "new-habit",
          name: "Meditate",
          color: null,
          bucketId: "new-bucket",
          itemPlannerIds: ["draft-item"],
        },
      ],
    });
    const changes = buildHabitChangeSet({
      canonical,
      working,
      currentBuckets: [],
      currentHabits: [],
      currentItems: [],
      nextPlanner: [makePlannerRow("real-item")],
      nodeIdMap: new Map([["draft-item", "real-item"]]),
    });
    expect(changes).not.toBeNull();
    expect(changes!.bucketCreates).toEqual([
      { id: "new-bucket", name: "Health", color: "#2E7D32" },
    ]);
    expect(changes!.creates[0].bucketId).toBe("new-bucket");
    expect(changes!.creates[0].itemPlannerIds).toEqual(["real-item"]);
  });

  it("drops non-repeating and unmapped item references at save", () => {
    const canonical = state({
      habits: [
        { id: "h1", name: "A", color: null, bucketId: null, itemPlannerIds: [] },
      ],
    });
    const working = state({
      habits: [
        {
          id: "h1",
          name: "A",
          color: null,
          bucketId: null,
          itemPlannerIds: ["stopped-repeating", "never-saved-draft"],
        },
      ],
    });
    const changes = buildHabitChangeSet({
      canonical,
      working,
      currentBuckets: [],
      currentHabits: [makeHabitRow("h1")],
      currentItems: [],
      nextPlanner: [makePlannerRow("stopped-repeating", { recurrence: null })],
      nodeIdMap: new Map(),
    });
    expect(changes).toBeNull();
  });

  it("bucket deletes null habit references; concurrent bucket deletes are not resurrected", () => {
    const canonical = habitsToDraftState(
      [makeBucketRow("b1", "Health"), makeBucketRow("b2", "Home")],
      [makeHabitRow("h1", "b1")],
      [],
    );
    // The assistant deleted b1 (unsorting h1) and renamed b2 — but b2 was
    // deleted concurrently elsewhere.
    const working = state({
      buckets: [{ id: "b2", name: "Household", color: null }],
      habits: [
        { id: "h1", name: "h1", color: null, bucketId: null, itemPlannerIds: [] },
      ],
    });
    const changes = buildHabitChangeSet({
      canonical,
      working,
      currentBuckets: [makeBucketRow("b1", "Health")],
      currentHabits: [makeHabitRow("h1", "b1")],
      currentItems: [],
      nextPlanner: [],
      nodeIdMap: new Map(),
    });
    expect(changes!.bucketDeletes).toEqual(["b1"]);
    expect(changes!.bucketUpdates).toEqual([]);
    expect(changes!.bucketCreates).toEqual([]);
    expect(changes!.updates).toEqual([{ id: "h1", bucketId: null }]);
  });

  it("a habit moved into a bucket the assistant deleted lands unsorted", () => {
    const canonical = habitsToDraftState(
      [makeBucketRow("b1", "Health")],
      [makeHabitRow("h1", null)],
      [],
    );
    // Contrived: the habit points at b1 while b1 was removed from the working
    // buckets (normally the delete op nulls references — this guards the
    // apply's own validation).
    const working = state({
      habits: [
        { id: "h1", name: "h1", color: null, bucketId: "b1", itemPlannerIds: [] },
      ],
    });
    const changes = buildHabitChangeSet({
      canonical,
      working,
      currentBuckets: [makeBucketRow("b1", "Health")],
      currentHabits: [makeHabitRow("h1", null)],
      currentItems: [],
      nextPlanner: [],
      nodeIdMap: new Map(),
    });
    expect(changes!.bucketDeletes).toEqual(["b1"]);
    expect(changes!.updates).toEqual([{ id: "h1", bucketId: null }]);
  });
});
