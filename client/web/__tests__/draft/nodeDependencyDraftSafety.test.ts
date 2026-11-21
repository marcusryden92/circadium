import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import {
  draftValidateSubtreeOrder,
  isDraftDependencyEndpoint,
  pruneDraftPrecedence,
  type DraftPrecedenceState,
} from "@/utils/draft/draftPrecedence";
import { moveDraftItem } from "@/utils/draft/draftForestOps";

// Node-level dependency data safety in the draft layers. The assistant does
// not AUTHOR node edges in v1, but its layers must not destroy user-authored
// ones: the working-copy prune keeps them, and move_item refuses reorders
// that close a loop through goals' step orders.

function node(
  id: string,
  children: DraftNode[] = [],
  plannerType: DraftNode["plannerType"] = children.length > 0 ? "goal" : "task",
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
    children,
  };
}

function twoGoalForest(): DraftForest {
  return {
    goals: [
      node("A", [node("a5"), node("a8")], "goal"),
      node("B", [node("b4"), node("b7")], "goal"),
    ],
  };
}

const state = (
  dependencies: DraftPrecedenceState["dependencies"],
): DraftPrecedenceState => ({ queues: [], dependencies });

describe("isDraftDependencyEndpoint", () => {
  it("accepts interior nodes of non-plan trees and roots alike", () => {
    const forest = twoGoalForest();
    expect(isDraftDependencyEndpoint(forest, "A")).toBe(true);
    expect(isDraftDependencyEndpoint(forest, "a5")).toBe(true);
    expect(isDraftDependencyEndpoint(forest, "missing")).toBe(false);
  });

  it("rejects nodes inside plan trees", () => {
    const forest: DraftForest = {
      goals: [node("plan-root", [node("p-child")], "plan")],
    };
    expect(isDraftDependencyEndpoint(forest, "plan-root")).toBe(false);
    expect(isDraftDependencyEndpoint(forest, "p-child")).toBe(false);
  });
});

describe("pruneDraftPrecedence with node-level edges", () => {
  it("keeps node-level dependency endpoints (opening the assistant must not strip them)", () => {
    const forest = twoGoalForest();
    const current = state([
      { predecessorId: "a5", successorId: "b4" },
      { predecessorId: "b7", successorId: "a8" },
    ]);
    const { state: pruned, changed } = pruneDraftPrecedence(current, forest);
    expect(changed).toBe(false);
    expect(pruned).toBe(current);
  });

  it("drops edges whose subtree endpoint vanished from the forest", () => {
    const forest: DraftForest = {
      goals: [node("A", [node("a5")], "goal"), node("B", [node("b4")], "goal")],
    };
    const current = state([
      { predecessorId: "a5", successorId: "b4" },
      { predecessorId: "gone-node", successorId: "b4" },
    ]);
    const { state: pruned, changed } = pruneDraftPrecedence(current, forest);
    expect(changed).toBe(true);
    expect(pruned.dependencies).toEqual([
      { predecessorId: "a5", successorId: "b4" },
    ]);
  });
});

describe("draftValidateSubtreeOrder", () => {
  const edges = state([
    { predecessorId: "a5", successorId: "b4" },
    { predecessorId: "b7", successorId: "a8" },
  ]);

  it("accepts the authored order", () => {
    expect(draftValidateSubtreeOrder(twoGoalForest(), edges, "A")).toBeNull();
  });

  it("finds the loop when a goal's children are reordered", () => {
    const reordered: DraftForest = {
      goals: [
        node("A", [node("a8"), node("a5")], "goal"),
        node("B", [node("b4"), node("b7")], "goal"),
      ],
    };
    expect(draftValidateSubtreeOrder(reordered, edges, "A")).not.toBeNull();
  });

  it("skips when the touched root carries no node-edge endpoint", () => {
    const forest: DraftForest = {
      goals: [...twoGoalForest().goals, node("C", [node("c1"), node("c2")], "goal")],
    };
    expect(draftValidateSubtreeOrder(forest, edges, "C")).toBeNull();
  });
});

describe("moveDraftItem with the precedence guard", () => {
  const edges = state([
    { predecessorId: "a5", successorId: "b4" },
    { predecessorId: "b7", successorId: "a8" },
  ]);

  it("refuses a move that closes a loop through two goals' step orders", () => {
    const result = moveDraftItem(
      twoGoalForest(),
      { itemId: "a8", newParentId: "A", atStart: true },
      edges,
    );
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain("loop");
    // The forest is returned unchanged.
    expect(result.forest.goals[0].children.map((c) => c.id)).toEqual([
      "a5",
      "a8",
    ]);
  });

  it("accepts a legal move with the guard active", () => {
    const forest: DraftForest = {
      goals: [
        node("A", [node("a5"), node("a8"), node("a9")], "goal"),
        node("B", [node("b4"), node("b7")], "goal"),
      ],
    };
    const result = moveDraftItem(
      forest,
      { itemId: "a9", newParentId: "A", atStart: true },
      edges,
    );
    expect(result.failures).toEqual([]);
    expect(result.forest.goals[0].children.map((c) => c.id)).toEqual([
      "a9",
      "a5",
      "a8",
    ]);
  });
});
