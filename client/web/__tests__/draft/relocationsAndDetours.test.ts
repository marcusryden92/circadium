import type { Planner } from "@/types/prisma";
import { plannerForestToJson } from "@/utils/draft/plannerForestToJson";
import { plannerTreeToJson } from "@/utils/draft/plannerTreeToJson";
import {
  addDraftDependencies,
} from "@/utils/draft/draftPrecedenceOps";
import {
  demoteDraftItem,
  promoteDraftItem,
  triageDraftInboxItems,
  updateDraftItems,
} from "@/utils/draft/draftForestOps";
import {
  replayDraftRelocations,
  revertFailedRelocations,
} from "@/utils/draft/draftRelocations";
import { applyDraftDetours } from "@/utils/draft/applyDraftDetours";
import { applyDraftForestToPlanner } from "@/utils/draft/applyDraftForestToPlanner";
import type { DraftPrecedenceState } from "@/utils/draft/draftPrecedence";

const USER_ID = "test-user";
const TS = "2026-01-01T00:00:00.000Z";
const NOW = "2026-02-01T00:00:00.000Z";

function row(overrides: Partial<Planner> & { id: string }): Planner {
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

// goal-a (cat-1): a1, a2 — goal-b: b1 — loose task "solo" — inbox jot
function makePlanner(): Planner[] {
  return [
    row({
      id: "goal-a",
      plannerType: "goal",
      categoryId: "cat-1",
      deadline: "2026-06-01",
      color: "#112233",
    }),
    row({ id: "a1", parentId: "goal-a", sortOrder: 1024 }),
    row({ id: "a2", parentId: "goal-a", sortOrder: 2048 }),
    row({ id: "goal-b", plannerType: "goal", deadline: "2026-07-01" }),
    row({ id: "b1", parentId: "goal-b", sortOrder: 1024 }),
    row({ id: "solo" }),
    row({ id: "jot", isTriaged: false, duration: 0, notes: "from capture" }),
  ];
}

const emptyPrecedence: DraftPrecedenceState = { queues: [], dependencies: [] };

describe("node-level dependency adds", () => {
  it("accepts subtask-to-subtask across goals and refuses same-goal pairs", () => {
    const forest = plannerForestToJson(makePlanner());
    const across = addDraftDependencies(
      emptyPrecedence,
      [{ predecessorId: "a1", successorId: "b1" }],
      forest,
    );
    expect(across.failures).toEqual([]);
    expect(across.state.dependencies).toEqual([
      { predecessorId: "a1", successorId: "b1" },
    ]);

    const sameGoal = addDraftDependencies(
      emptyPrecedence,
      [{ predecessorId: "a1", successorId: "a2" }],
      forest,
    );
    expect(sameGoal.failures).toHaveLength(1);
    expect(sameGoal.failures[0].reason).toContain("same goal");
  });

  it("refuses a loop that closes through a goal's internal step order", () => {
    const forest = plannerForestToJson(makePlanner());
    // b1 -> a1 plus a2 -> b1: a1 precedes a2 internally, so
    // b1 -> a1 -> (internal) -> a2 -> b1 closes.
    const first = addDraftDependencies(
      emptyPrecedence,
      [{ predecessorId: "b1", successorId: "a1" }],
      forest,
    );
    expect(first.failures).toEqual([]);
    const second = addDraftDependencies(
      first.state,
      [{ predecessorId: "a2", successorId: "b1" }],
      forest,
    );
    expect(second.failures).toHaveLength(1);
    expect(second.failures[0].reason).toContain("loop");
  });
});

describe("detour links", () => {
  it("sets a link on a subtask via update_items and refuses roots and self-goals", () => {
    const forest = plannerForestToJson(makePlanner());
    const ok = updateDraftItems(
      forest,
      [{ id: "a1", linkedItemId: "solo" }],
      new Set<string>(),
      new Set<string>(),
      emptyPrecedence,
    );
    expect(ok.failures).toEqual([]);
    const a1 = ok.forest.goals
      .find((g) => g.id === "goal-a")!
      .children.find((c) => c.id === "a1")!;
    expect(a1.linkedItemId).toBe("solo");

    const onRoot = updateDraftItems(
      forest,
      [{ id: "solo", linkedItemId: "goal-b" }],
      new Set<string>(),
      new Set<string>(),
      emptyPrecedence,
    );
    expect(onRoot.failures).toHaveLength(1);

    const selfGoal = updateDraftItems(
      forest,
      [{ id: "a1", linkedItemId: "goal-a" }],
      new Set<string>(),
      new Set<string>(),
      emptyPrecedence,
    );
    expect(selfGoal.failures).toHaveLength(1);
  });

  it("refuses a link when a queue already orders host and target", () => {
    const forest = plannerForestToJson(makePlanner());
    const queued: DraftPrecedenceState = {
      queues: [
        {
          id: "q1",
          title: "Q",
          categoryId: null,
          color: null,
          memberPlannerIds: ["goal-a", "solo"],
        },
      ],
      dependencies: [],
    };
    const refused = updateDraftItems(
      forest,
      [{ id: "a1", linkedItemId: "solo" }],
      new Set<string>(),
      new Set<string>(),
      queued,
    );
    expect(refused.failures).toHaveLength(1);
    expect(refused.failures[0].reason).toContain("deadlock");
  });

  it("applies changed links at save, survives re-emits that omit the field, and drops invalid targets", () => {
    const planner = makePlanner();
    const working = plannerForestToJson(planner);
    const withLink = updateDraftItems(
      working,
      [{ id: "a1", linkedItemId: "solo" }],
      new Set<string>(),
      new Set<string>(),
      emptyPrecedence,
    ).forest;

    const applied = applyDraftDetours({
      planner,
      canonical: plannerForestToJson(planner),
      working: withLink,
      nodeIdMap: new Map(),
      queues: [],
      dependencies: [],
      now: NOW,
    });
    expect(applied.find((p) => p.id === "a1")!.linkedItemId).toBe("solo");

    // A working tree that OMITS the field must not clear an existing link.
    const linkedPlanner = applied;
    const omitted = plannerForestToJson(linkedPlanner);
    const a1 = omitted.goals
      .find((g) => g.id === "goal-a")!
      .children.find((c) => c.id === "a1")!;
    delete a1.linkedItemId;
    const preserved = applyDraftDetours({
      planner: linkedPlanner,
      canonical: plannerForestToJson(linkedPlanner),
      working: omitted,
      nodeIdMap: new Map(),
      queues: [],
      dependencies: [],
      now: NOW,
    });
    expect(preserved.find((p) => p.id === "a1")!.linkedItemId).toBe("solo");

    // A link to an untriaged row fails canLinkAsDetour and is dropped.
    const badTarget = plannerForestToJson(planner);
    const badA1 = badTarget.goals
      .find((g) => g.id === "goal-a")!
      .children.find((c) => c.id === "a1")!;
    badA1.linkedItemId = "jot";
    const dropped = applyDraftDetours({
      planner,
      canonical: plannerForestToJson(planner),
      working: badTarget,
      nodeIdMap: new Map(),
      queues: [],
      dependencies: [],
      now: NOW,
    });
    expect(dropped.find((p) => p.id === "a1")!.linkedItemId).toBeNull();
  });
});

describe("promote / demote / triage relocations", () => {
  it("promote mirrors the native fixups on the working forest and the replay keeps the id", () => {
    const planner = makePlanner();
    const forest = plannerForestToJson(planner);
    const result = promoteDraftItem(forest, "a1");
    expect(result.failures).toEqual([]);
    expect(result.relocation).toEqual({ kind: "promote", itemId: "a1" });
    const promoted = result.forest.goals.find((g) => g.id === "a1")!;
    expect(promoted.plannerType).toBe("task");
    expect(promoted.isReady).toBe(true);
    expect(promoted.categoryId).toBe("cat-1");
    expect(
      result.forest.goals.find((g) => g.id === "goal-a")!.children.map((c) => c.id),
    ).toEqual(["a2"]);

    const replay = replayDraftRelocations({
      planner,
      relocations: [result.relocation!],
      queues: [],
      dependencies: [],
      now: NOW,
    });
    expect(replay.failures).toEqual([]);
    const rowAfter = replay.planner.find((p) => p.id === "a1")!;
    expect(rowAfter.parentId).toBeNull();
    expect(rowAfter.plannerType).toBe("task");
    expect(rowAfter.categoryId).toBe("cat-1");

    // The regular apply then retains the promoted id as a root untouched.
    const applied = applyDraftForestToPlanner({
      planner: replay.planner,
      workingForest: result.forest,
      userId: USER_ID,
      validCategoryIds: new Set(["cat-1"]),
    });
    expect(applied.filter((p) => p.title === "a1")).toHaveLength(1);
    expect(applied.find((p) => p.id === "a1")!.parentId).toBeNull();
  });

  it("demote nests as the last step, records the relocation, and the replay keeps the id", () => {
    const planner = makePlanner();
    const forest = plannerForestToJson(planner);
    const result = demoteDraftItem(
      forest,
      { itemId: "solo", targetRootId: "goal-b" },
      emptyPrecedence,
    );
    expect(result.failures).toEqual([]);
    expect(result.deletedGoalIds).toEqual(["solo"]);
    const target = result.forest.goals.find((g) => g.id === "goal-b")!;
    expect(target.children.map((c) => c.id)).toEqual(["b1", "solo"]);

    const replay = replayDraftRelocations({
      planner,
      relocations: [result.relocation!],
      queues: [],
      dependencies: [],
      now: NOW,
    });
    expect(replay.failures).toEqual([]);
    expect(replay.planner.find((p) => p.id === "solo")!.parentId).toBe("goal-b");

    const applied = applyDraftForestToPlanner({
      planner: replay.planner,
      workingForest: result.forest,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    expect(applied.filter((p) => p.title === "solo")).toHaveLength(1);
    expect(applied.find((p) => p.id === "solo")!.parentId).toBe("goal-b");
  });

  it("a failed demote replay reverts that item's working tree to canonical", () => {
    const planner = makePlanner();
    const forest = plannerForestToJson(planner);
    const result = demoteDraftItem(
      forest,
      { itemId: "solo", targetRootId: "goal-b" },
      emptyPrecedence,
    );
    const failure = {
      relocation: result.relocation!,
      error: "refused",
    };
    const reverted = revertFailedRelocations(result.forest, [failure], planner);
    expect(
      reverted.goals.find((g) => g.id === "goal-b")!.children.map((c) => c.id),
    ).toEqual(["b1"]);
    const restored = reverted.goals.find((g) => g.id === "solo");
    expect(restored).toBeDefined();
    expect(restored!.title).toBe(plannerTreeToJson(planner, "solo")!.title);
  });

  it("triage pulls a jot in as a task and the replay flips isTriaged with a real color", () => {
    const planner = makePlanner();
    const forest = plannerForestToJson(planner);
    expect(forest.goals.some((g) => g.id === "jot")).toBe(false);

    const result = triageDraftInboxItems(forest, [
      { id: "jot", title: "jot", notes: "from capture" },
    ]);
    expect(result.failures).toEqual([]);
    const triaged = result.forest.goals.find((g) => g.id === "jot")!;
    expect(triaged.plannerType).toBe("task");
    expect(triaged.notes).toBe("from capture");

    const replay = replayDraftRelocations({
      planner,
      relocations: result.relocations,
      queues: [],
      dependencies: [],
      now: NOW,
    });
    const rowAfter = replay.planner.find((p) => p.id === "jot")!;
    expect(rowAfter.isTriaged).toBe(true);
    expect(rowAfter.color).not.toBeNull();

    // Post-replay the jot is a triaged root, so the regular apply retains it.
    const applied = applyDraftForestToPlanner({
      planner: replay.planner,
      workingForest: result.forest,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });
    expect(applied.filter((p) => p.title === "jot")).toHaveLength(1);
    expect(applied.find((p) => p.id === "jot")!.isTriaged).toBe(true);
  });
});
