import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import {
  draftPrecedenceStateEqual,
  pruneDraftPrecedence,
  type DraftPrecedenceState,
} from "@/utils/draft/draftPrecedence";
import {
  addDraftDependencies,
  addDraftQueueMembers,
  addDraftQueues,
  deleteDraftQueues,
  moveDraftQueueMember,
  removeDraftDependencies,
  removeDraftQueueMembers,
  updateDraftQueues,
} from "@/utils/draft/draftPrecedenceOps";

const VALID_CATEGORY_IDS: ReadonlySet<string> = new Set(["cat-1"]);

function rootNode(
  id: string,
  plannerType: DraftNode["plannerType"] = "task",
): DraftNode {
  return {
    id,
    title: `Title of ${id}`,
    plannerType,
    duration: 30,
    deadline: null,
    priority: 4,
    isReady: null,
    categoryId: null,
    color: null,
    splitting: null,
    maxMinutesPerDay: null,
    children: [],
  };
}

function makeForest(): DraftForest {
  return {
    goals: [
      rootNode("goal-a", "goal"),
      rootNode("task-b"),
      rootNode("plan-c", "plan"),
      rootNode("goal-d", "goal"),
    ],
  };
}

const emptyState = (): DraftPrecedenceState => ({
  queues: [],
  dependencies: [],
});

function stateWithQueue(
  memberPlannerIds: string[],
  dependencies: DraftPrecedenceState["dependencies"] = [],
): DraftPrecedenceState {
  return {
    queues: [
      { id: "queue-1", title: "Stream", categoryId: null, memberPlannerIds },
    ],
    dependencies,
  };
}

describe("draftPrecedenceOps", () => {
  it("mints queue ids and seeds members in order", () => {
    const result = addDraftQueues(
      emptyState(),
      [
        {
          title: "  Renovation  ",
          categoryId: "cat-1",
          memberPlannerIds: ["goal-a", "task-b"],
        },
      ],
      makeForest(),
      VALID_CATEGORY_IDS,
    );

    expect(result.changed).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.state.queues).toHaveLength(1);
    const queue = result.state.queues[0];
    expect(queue.id.length).toBeGreaterThan(0);
    expect(queue.title).toBe("Renovation");
    expect(queue.categoryId).toBe("cat-1");
    expect(queue.memberPlannerIds).toEqual(["goal-a", "task-b"]);
  });

  it("rejects plan members and unknown ids without sinking the queue", () => {
    const result = addDraftQueues(
      emptyState(),
      [
        {
          title: "Stream",
          memberPlannerIds: ["plan-c", "nope", "goal-a"],
        },
      ],
      makeForest(),
      VALID_CATEGORY_IDS,
    );

    expect(result.state.queues[0].memberPlannerIds).toEqual(["goal-a"]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].id).toBe("plan-c");
    expect(result.failures[1].id).toBe("nope");
  });

  it("enforces one queue per item", () => {
    const state = stateWithQueue(["goal-a"]);
    const result = addDraftQueues(
      state,
      [{ title: "Second", memberPlannerIds: ["goal-a"] }],
      makeForest(),
      VALID_CATEGORY_IDS,
    );

    expect(result.state.queues[1].memberPlannerIds).toEqual([]);
    expect(result.failures[0].reason).toContain("only one queue");
  });

  it("refuses a dependency that would close a loop, with the path", () => {
    const forest = makeForest();
    const first = addDraftDependencies(
      emptyState(),
      [{ predecessorId: "goal-a", successorId: "task-b" }],
      forest,
    );
    expect(first.changed).toBe(true);

    const second = addDraftDependencies(
      first.state,
      [{ predecessorId: "task-b", successorId: "goal-a" }],
      forest,
    );
    expect(second.changed).toBe(false);
    expect(second.failures[0].reason).toContain("would create a loop");
    expect(second.failures[0].reason).toContain("Title of goal-a");
  });

  it("refuses a member insertion contradicting a dependency", () => {
    const forest = makeForest();
    const state: DraftPrecedenceState = {
      queues: [
        { id: "queue-1", title: "Stream", categoryId: null, memberPlannerIds: [] },
      ],
      dependencies: [{ predecessorId: "task-b", successorId: "goal-a" }],
    };

    const result = addDraftQueueMembers(
      state,
      { queueId: "queue-1", plannerIds: ["goal-a", "task-b"] },
      forest,
    );

    // goal-a lands; appending task-b after it would chain a->b against the
    // dependency b->a.
    expect(result.state.queues[0].memberPlannerIds).toEqual(["goal-a"]);
    expect(result.failures[0].id).toBe("task-b");
    expect(result.failures[0].reason).toContain("would create a loop");
  });

  it("moves a member and refuses a reorder that closes a loop", () => {
    const forest = makeForest();
    const legal = moveDraftQueueMember(
      stateWithQueue(["goal-a", "goal-d"]),
      { queueId: "queue-1", plannerId: "goal-a", toIndex: 1 },
      forest,
    );
    expect(legal.changed).toBe(true);
    expect(legal.state.queues[0].memberPlannerIds).toEqual([
      "goal-d",
      "goal-a",
    ]);

    const contradicted = moveDraftQueueMember(
      stateWithQueue(
        ["goal-a", "goal-d"],
        [{ predecessorId: "goal-a", successorId: "goal-d" }],
      ),
      { queueId: "queue-1", plannerId: "goal-a", toIndex: 1 },
      forest,
    );
    expect(contradicted.changed).toBe(false);
    expect(contradicted.failures[0].reason).toContain("would create a loop");
  });

  it("patches queue fields and validates the category", () => {
    const result = updateDraftQueues(
      stateWithQueue(["goal-a"]),
      [
        { id: "queue-1", title: "Renamed", categoryId: "cat-1" },
        { id: "queue-1", categoryId: "cat-unknown" },
      ],
      VALID_CATEGORY_IDS,
    );
    expect(result.state.queues[0].title).toBe("Renamed");
    expect(result.state.queues[0].categoryId).toBe("cat-1");
    expect(result.failures[0].reason).toContain("unknown categoryId");
  });

  it("removes members, dependencies, and queues", () => {
    const state: DraftPrecedenceState = {
      queues: [
        {
          id: "queue-1",
          title: "Stream",
          categoryId: null,
          memberPlannerIds: ["goal-a", "task-b"],
        },
      ],
      dependencies: [{ predecessorId: "goal-a", successorId: "goal-d" }],
    };

    const afterMemberRemove = removeDraftQueueMembers(state, ["task-b"]);
    expect(afterMemberRemove.state.queues[0].memberPlannerIds).toEqual([
      "goal-a",
    ]);

    const afterDependencyRemove = removeDraftDependencies(
      afterMemberRemove.state,
      [{ predecessorId: "goal-a", successorId: "goal-d" }],
    );
    expect(afterDependencyRemove.state.dependencies).toHaveLength(0);

    const afterQueueDelete = deleteDraftQueues(afterDependencyRemove.state, [
      "queue-1",
    ]);
    expect(afterQueueDelete.state.queues).toHaveLength(0);
  });

  it("rejects duplicate dependencies and self-dependencies", () => {
    const forest = makeForest();
    const first = addDraftDependencies(
      emptyState(),
      [{ predecessorId: "goal-a", successorId: "task-b" }],
      forest,
    );
    const dupe = addDraftDependencies(
      first.state,
      [
        { predecessorId: "goal-a", successorId: "task-b" },
        { predecessorId: "goal-a", successorId: "goal-a" },
      ],
      forest,
    );
    expect(dupe.changed).toBe(false);
    expect(dupe.failures[0].reason).toContain("already exists");
    expect(dupe.failures[1].reason).toContain("depend on itself");
  });
});

describe("pruneDraftPrecedence", () => {
  it("drops members and edges whose root left the forest, identity on no-op", () => {
    const state: DraftPrecedenceState = {
      queues: [
        {
          id: "queue-1",
          title: "Stream",
          categoryId: null,
          memberPlannerIds: ["goal-a", "task-b"],
        },
      ],
      dependencies: [
        { predecessorId: "goal-a", successorId: "goal-d" },
        { predecessorId: "task-b", successorId: "goal-d" },
      ],
    };
    const forest = makeForest();

    const untouched = pruneDraftPrecedence(state, forest);
    expect(untouched.changed).toBe(false);
    expect(untouched.state).toBe(state);

    const withoutB: DraftForest = {
      goals: forest.goals.filter((g) => g.id !== "task-b"),
    };
    const pruned = pruneDraftPrecedence(state, withoutB);
    expect(pruned.changed).toBe(true);
    expect(pruned.state.queues[0].memberPlannerIds).toEqual(["goal-a"]);
    expect(pruned.state.dependencies).toEqual([
      { predecessorId: "goal-a", successorId: "goal-d" },
    ]);
  });
});

describe("draftPrecedenceStateEqual", () => {
  it("is member-order sensitive and queue-order insensitive", () => {
    const a: DraftPrecedenceState = {
      queues: [
        { id: "q1", title: "One", categoryId: null, memberPlannerIds: ["x", "y"] },
        { id: "q2", title: "Two", categoryId: null, memberPlannerIds: [] },
      ],
      dependencies: [{ predecessorId: "x", successorId: "y" }],
    };
    const reorderedQueues: DraftPrecedenceState = {
      queues: [a.queues[1], a.queues[0]],
      dependencies: [...a.dependencies],
    };
    expect(draftPrecedenceStateEqual(a, reorderedQueues)).toBe(true);

    const reorderedMembers: DraftPrecedenceState = {
      queues: [
        { ...a.queues[0], memberPlannerIds: ["y", "x"] },
        a.queues[1],
      ],
      dependencies: [...a.dependencies],
    };
    expect(draftPrecedenceStateEqual(a, reorderedMembers)).toBe(false);
  });
});
