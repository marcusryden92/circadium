import type {
  Planner,
  PlannerDependency,
  Queue,
  QueueMember,
} from "@/types/prisma";
import { applyDraftPrecedence } from "@/utils/draft/applyDraftPrecedence";
import { clampReadinessAgainstDependencies } from "@/utils/draft/applyDraftForestToPlanner";
import {
  precedenceToDraft,
  type DraftPrecedenceState,
} from "@/utils/draft/draftPrecedence";

const USER_ID = "test-user";
const TS = "2026-01-01T00:00:00.000Z";
const NOW = "2026-07-13T12:00:00.000Z";
const VALID_CATEGORY_IDS: ReadonlySet<string> = new Set(["cat-1"]);

function plannerRow(overrides: Partial<Planner> & { id: string }): Planner {
  return {
    title: overrides.id,
    parentId: null,
    plannerType: "task",
    isReady: true,
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

function memberRow(
  queueId: string,
  plannerId: string,
  sortOrder: number,
): QueueMember {
  return {
    id: `member-${queueId}-${plannerId}`,
    sortOrder,
    queueId,
    plannerId,
    userId: USER_ID,
    createdAt: TS,
    updatedAt: TS,
  };
}

function queueRow(
  id: string,
  title: string,
  memberPlannerIds: string[],
  overrides: Partial<Queue> = {},
): Queue {
  return {
    id,
    title,
    sortOrder: 1,
    color: null,
    categoryId: null,
    userId: USER_ID,
    createdAt: TS,
    updatedAt: TS,
    members: memberPlannerIds.map((plannerId, i) =>
      memberRow(id, plannerId, (i + 1) * 1024),
    ),
    ...overrides,
  };
}

function dependencyRow(
  predecessorId: string,
  successorId: string,
): PlannerDependency {
  return {
    id: `dep-${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    userId: USER_ID,
    createdAt: TS,
    updatedAt: TS,
  };
}

const basePlanner = (): Planner[] => [
  plannerRow({ id: "item-a" }),
  plannerRow({ id: "item-b" }),
  plannerRow({ id: "item-c" }),
  plannerRow({ id: "item-d" }),
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function apply(args: {
  currentQueues: Queue[];
  currentDependencies: PlannerDependency[];
  canonical: DraftPrecedenceState;
  working: DraftPrecedenceState;
  nodeIdMap?: Map<string, string>;
  nextPlanner?: Planner[];
}) {
  return applyDraftPrecedence({
    currentQueues: args.currentQueues,
    currentDependencies: args.currentDependencies,
    canonical: args.canonical,
    working: args.working,
    nodeIdMap: args.nodeIdMap ?? new Map(),
    nextPlanner: args.nextPlanner ?? basePlanner(),
    validCategoryIds: VALID_CATEGORY_IDS,
    userId: USER_ID,
    now: NOW,
  });
}

describe("applyDraftPrecedence", () => {
  it("returns the current arrays by reference on a no-op", () => {
    const currentQueues = [queueRow("q1", "Stream", ["item-a", "item-b"])];
    const currentDependencies = [dependencyRow("item-c", "item-d")];
    const canonical = precedenceToDraft(currentQueues, currentDependencies);

    const result = apply({
      currentQueues,
      currentDependencies,
      canonical,
      working: clone(canonical),
    });

    expect(result.queues).toBe(currentQueues);
    expect(result.dependencies).toBe(currentDependencies);
  });

  it("preserves user-authored node-level dependency edges through a save", () => {
    const nextPlanner = [
      ...basePlanner(),
      plannerRow({ id: "goal-x", plannerType: "goal" }),
      plannerRow({ id: "x-step", parentId: "goal-x", sortOrder: 1024 }),
    ];
    const currentDependencies = [dependencyRow("x-step", "item-a")];
    const canonical = precedenceToDraft([], currentDependencies);

    const result = apply({
      currentQueues: [],
      currentDependencies,
      canonical,
      working: clone(canonical),
      nextPlanner,
    });

    expect(result.dependencies).toBe(currentDependencies);
  });

  it("remaps a node-level endpoint re-minted by the forest apply", () => {
    const nextPlanner = [
      ...basePlanner(),
      plannerRow({ id: "goal-x", plannerType: "goal" }),
      plannerRow({ id: "minted-step", parentId: "goal-x", sortOrder: 1024 }),
    ];
    const canonical = precedenceToDraft([], []);
    const working: DraftPrecedenceState = {
      queues: [],
      dependencies: [
        { predecessorId: "draft-step-id", successorId: "item-a" },
      ],
    };

    const result = apply({
      currentQueues: [],
      currentDependencies: [],
      canonical,
      working,
      nodeIdMap: new Map([["draft-step-id", "minted-step"]]),
      nextPlanner,
    });

    expect(
      result.dependencies.map((d) => [d.predecessorId, d.successorId]),
    ).toEqual([["minted-step", "item-a"]]);
  });

  it("creates a queue whose draft-goal member remaps to the minted id", () => {
    const canonical = precedenceToDraft([], []);
    const working: DraftPrecedenceState = {
      queues: [
        {
          id: "draft-queue-id",
          title: "New stream",
          categoryId: "cat-1",
          memberPlannerIds: ["draft-goal-id", "item-a"],
        },
      ],
      dependencies: [],
    };
    const nextPlanner = [...basePlanner(), plannerRow({ id: "minted-goal" })];

    const result = apply({
      currentQueues: [],
      currentDependencies: [],
      canonical,
      working,
      nodeIdMap: new Map([["draft-goal-id", "minted-goal"]]),
      nextPlanner,
    });

    expect(result.queues).toHaveLength(1);
    const queue = result.queues[0];
    // The route-minted queue id becomes the DB id.
    expect(queue.id).toBe("draft-queue-id");
    expect(queue.categoryId).toBe("cat-1");
    expect(queue.userId).toBe(USER_ID);
    expect(queue.members.map((m) => m.plannerId)).toEqual([
      "minted-goal",
      "item-a",
    ]);
    expect(queue.members[0].sortOrder).toBeLessThan(
      queue.members[1].sortOrder,
    );
  });

  it("drops a member whose draft goal was never saved", () => {
    const canonical = precedenceToDraft([], []);
    const working: DraftPrecedenceState = {
      queues: [
        {
          id: "q-new",
          title: "Stream",
          categoryId: null,
          memberPlannerIds: ["unsaved-draft-id", "item-a"],
        },
      ],
      dependencies: [],
    };

    const result = apply({
      currentQueues: [],
      currentDependencies: [],
      canonical,
      working,
    });

    expect(result.queues[0].members.map((m) => m.plannerId)).toEqual([
      "item-a",
    ]);
  });

  it("keeps retained member rows by identity when an append leaves order intact", () => {
    const currentQueues = [queueRow("q1", "Stream", ["item-a", "item-b"])];
    const canonical = precedenceToDraft(currentQueues, []);
    const working = clone(canonical);
    working.queues[0].memberPlannerIds.push("item-c");

    const result = apply({
      currentQueues,
      currentDependencies: [],
      canonical,
      working,
    });

    const members = result.queues[0].members;
    expect(members.map((m) => m.plannerId)).toEqual([
      "item-a",
      "item-b",
      "item-c",
    ]);
    // (i+1)*STEP keys match the seeded rows, so retained rows keep identity.
    expect(members[0]).toBe(currentQueues[0].members[0]);
    expect(members[1]).toBe(currentQueues[0].members[1]);
    expect(members[2].userId).toBe(USER_ID);
  });

  it("never resurrects a member removed concurrently elsewhere", () => {
    const canonicalQueues = [queueRow("q1", "Stream", ["item-a", "item-b"])];
    const canonical = precedenceToDraft(canonicalQueues, []);
    // The user removed item-b in another tab; the assistant reordered the
    // queue (kept item-b in its working copy).
    const currentQueues = [queueRow("q1", "Stream", ["item-a"])];
    const working = clone(canonical);
    working.queues[0].memberPlannerIds = ["item-b", "item-a"];

    const result = apply({
      currentQueues,
      currentDependencies: [],
      canonical,
      working,
    });

    expect(result.queues[0].members.map((m) => m.plannerId)).toEqual([
      "item-a",
    ]);
  });

  it("lets the user's concurrent placement win a one-queue conflict", () => {
    // The assistant adds item-c to q1, but the user concurrently put item-c
    // into q2 (untouched by the assistant).
    const canonicalQueues = [
      queueRow("q1", "First", ["item-a"]),
      queueRow("q2", "Second", []),
    ];
    const canonical = precedenceToDraft(canonicalQueues, []);
    const currentQueues = [
      queueRow("q1", "First", ["item-a"]),
      queueRow("q2", "Second", ["item-c"]),
    ];
    const working = clone(canonical);
    working.queues[0].memberPlannerIds = ["item-a", "item-c"];

    const result = apply({
      currentQueues,
      currentDependencies: [],
      canonical,
      working,
    });

    expect(result.queues[0].members.map((m) => m.plannerId)).toEqual([
      "item-a",
    ]);
    expect(result.queues[1].members.map((m) => m.plannerId)).toEqual([
      "item-c",
    ]);
    // The untouched queue keeps its exact reference.
    expect(result.queues[1]).toBe(currentQueues[1]);
  });

  it("does not resurrect a queue deleted concurrently elsewhere", () => {
    const canonicalQueues = [queueRow("q1", "Stream", ["item-a"])];
    const canonical = precedenceToDraft(canonicalQueues, []);
    const working = clone(canonical);
    working.queues[0].title = "Renamed";

    const result = apply({
      currentQueues: [],
      currentDependencies: [],
      canonical,
      working,
    });

    expect(result.queues).toHaveLength(0);
  });

  it("applies per-field queue deltas without clobbering concurrent edits", () => {
    const canonicalQueues = [
      queueRow("q1", "Old title", ["item-a"], { categoryId: null }),
    ];
    const canonical = precedenceToDraft(canonicalQueues, []);
    // Concurrent edit elsewhere set a category; the assistant only renamed.
    const currentQueues = [
      queueRow("q1", "Old title", ["item-a"], { categoryId: "cat-1" }),
    ];
    const working = clone(canonical);
    working.queues[0].title = "New title";

    const result = apply({
      currentQueues,
      currentDependencies: [],
      canonical,
      working,
    });

    expect(result.queues[0].title).toBe("New title");
    expect(result.queues[0].categoryId).toBe("cat-1");
    expect(result.queues[0].updatedAt).toBe(NOW);
  });

  it("adds and removes dependencies with remapping, skipping concurrent duplicates", () => {
    const currentDependencies = [
      dependencyRow("item-a", "item-b"),
      // Added concurrently elsewhere — identical to one assistant addition.
      dependencyRow("item-c", "item-d"),
    ];
    const canonical = precedenceToDraft([], [currentDependencies[0]]);
    const working: DraftPrecedenceState = {
      queues: [],
      dependencies: [
        // Assistant removed a->b by leaving it out; added c->d (duplicate of
        // the concurrent row) and draft->a (remaps to minted-goal->item-a).
        { predecessorId: "item-c", successorId: "item-d" },
        { predecessorId: "draft-goal-id", successorId: "item-a" },
      ],
    };
    const nextPlanner = [...basePlanner(), plannerRow({ id: "minted-goal" })];

    const result = apply({
      currentQueues: [],
      currentDependencies,
      canonical,
      working,
      nodeIdMap: new Map([["draft-goal-id", "minted-goal"]]),
      nextPlanner,
    });

    const pairs = result.dependencies.map(
      (d) => `${d.predecessorId}->${d.successorId}`,
    );
    expect(pairs).toHaveLength(2);
    expect(pairs).toContain("item-c->item-d");
    expect(pairs).toContain("minted-goal->item-a");
    // The concurrent duplicate kept its existing row (no second create).
    expect(
      result.dependencies.find((d) => d.predecessorId === "item-c"),
    ).toBe(currentDependencies[1]);
  });

  it("skips an assistant dependency that a concurrent edge turned cyclic", () => {
    // The user added b->a in another tab while the assistant (unaware) added
    // a->b. Op-time validation could not see the concurrent edge.
    const currentDependencies = [dependencyRow("item-b", "item-a")];
    const canonical = precedenceToDraft([], []);
    const working: DraftPrecedenceState = {
      queues: [],
      dependencies: [{ predecessorId: "item-a", successorId: "item-b" }],
    };

    const result = apply({
      currentQueues: [],
      currentDependencies,
      canonical,
      working,
    });

    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]).toBe(currentDependencies[0]);
  });

  it("drops an assistant-added member that a concurrent dependency turned cyclic", () => {
    // Queue chain a->b would contradict the user's concurrent b->a edge.
    const currentDependencies = [dependencyRow("item-b", "item-a")];
    const canonicalQueues = [queueRow("q1", "Stream", ["item-a"])];
    const canonical = precedenceToDraft(canonicalQueues, []);
    const working = clone(canonical);
    working.queues[0].memberPlannerIds = ["item-a", "item-b"];

    const result = apply({
      currentQueues: canonicalQueues,
      currentDependencies,
      canonical,
      working,
    });

    expect(result.queues[0].members.map((m) => m.plannerId)).toEqual([
      "item-a",
    ]);
    expect(result.dependencies).toBe(currentDependencies);
  });
});

describe("clampReadinessAgainstDependencies", () => {
  it("un-readies a ready goal whose predecessor is an unready goal, cascading the subtree", () => {
    const planner: Planner[] = [
      plannerRow({ id: "blocked", plannerType: "goal", isReady: true }),
      plannerRow({ id: "blocked-child", parentId: "blocked", isReady: true }),
      plannerRow({ id: "gatekeeper", plannerType: "goal", isReady: false }),
      plannerRow({ id: "unrelated", plannerType: "goal", isReady: true }),
    ];
    const dependencies = [dependencyRow("gatekeeper", "blocked")];

    const result = clampReadinessAgainstDependencies(
      planner,
      dependencies,
      NOW,
    );

    const byId = (id: string) => result.find((p) => p.id === id)!;
    expect(byId("blocked").isReady).toBe(false);
    expect(byId("blocked").updatedAt).toBe(NOW);
    expect(byId("blocked-child").isReady).toBe(false);
    expect(byId("unrelated")).toBe(planner[3]);
  });

  it("returns the same reference when nothing clamps", () => {
    const planner: Planner[] = [
      plannerRow({ id: "a", plannerType: "goal", isReady: true }),
      plannerRow({ id: "b", plannerType: "goal", isReady: true }),
    ];
    const result = clampReadinessAgainstDependencies(
      planner,
      [dependencyRow("b", "a")],
      NOW,
    );
    expect(result).toBe(planner);
  });
});
