import type { Queue, PlannerDependency, QueueMember, Planner } from "@/types/prisma";
import type { PrecedenceEdge } from "./types";
import {
  collectValidationEdges,
  detourComponentMap,
  contractPrecedenceEdges,
  subtreeBoundaryLeaves,
} from "./validationEdges";
import { getRootParentId } from "@/utils/goalPageHandlers";

// Cycle detection over the merged validation graph (queue logical order +
// dependency edges + goal internal chains). Graphs are tiny — plain DFS
// everywhere. Passing `planner` folds detour links in: host and spliced
// target contract to one node, so a queue/dependency edge connecting them
// (directly or through a path) is refused as a cycle — at runtime the pair
// would mutually block. It also moves the graph to leaf granularity, so
// node-level dependency endpoints and internal step order participate.

function buildAdjacency(edges: PrecedenceEdge[]): Map<string, PrecedenceEdge[]> {
  const adjacency = new Map<string, PrecedenceEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromId);
    if (list) list.push(edge);
    else adjacency.set(edge.fromId, [edge]);
  }
  return adjacency;
}

// DFS path from `fromId` to `toId` over the given edges; returns the edge
// path or null. Used to close a candidate edge into a displayable cycle.
function findPath(
  edges: PrecedenceEdge[],
  fromId: string,
  toId: string,
): PrecedenceEdge[] | null {
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>();

  const walk = (node: string): PrecedenceEdge[] | null => {
    if (node === toId) return [];
    if (visited.has(node)) return null;
    visited.add(node);
    for (const edge of adjacency.get(node) ?? []) {
      const rest = walk(edge.toId);
      if (rest) return [edge, ...rest];
    }
    return null;
  };

  return walk(fromId);
}

/**
 * Would adding `candidateEdge` to `edges` close a cycle? Returns the full
 * cycle path for display — candidate first, then the existing edges leading
 * from the candidate's target back to its source — or null when acyclic.
 */
export function findCycle(
  edges: PrecedenceEdge[],
  candidateEdge: PrecedenceEdge,
): PrecedenceEdge[] | null {
  if (candidateEdge.fromId === candidateEdge.toId) return [candidateEdge];
  const back = findPath(edges, candidateEdge.toId, candidateEdge.fromId);
  return back ? [candidateEdge, ...back] : null;
}

/**
 * Any cycle in the graph as an edge path, or null. Used for whole-state
 * mutations (queue reorders) where the offending edge isn't a single
 * candidate. Assumes the pre-mutation graph was acyclic, so any cycle found
 * involves the mutation.
 */
export function findCycleInGraph(
  edges: PrecedenceEdge[],
): PrecedenceEdge[] | null {
  const adjacency = buildAdjacency(edges);
  const done = new Set<string>();
  const onStack = new Set<string>();
  const stack: PrecedenceEdge[] = [];

  const walk = (node: string): PrecedenceEdge[] | null => {
    onStack.add(node);
    for (const edge of adjacency.get(node) ?? []) {
      if (onStack.has(edge.toId)) {
        const startIndex = stack.findIndex((e) => e.fromId === edge.toId);
        return [...stack.slice(startIndex === -1 ? 0 : startIndex), edge];
      }
      if (done.has(edge.toId)) continue;
      stack.push(edge);
      const cycle = walk(edge.toId);
      if (cycle) return cycle;
      stack.pop();
    }
    onStack.delete(node);
    done.add(node);
    return null;
  };

  for (const node of adjacency.keys()) {
    if (done.has(node)) continue;
    const cycle = walk(node);
    if (cycle) return cycle;
  }
  return null;
}

// Expand a candidate dependency to leaf granularity + detour contraction so
// it meets the graph collectValidationEdges builds. Without a planner array
// the candidate stands for itself (legacy shape).
function expandedCandidate(
  planner: Planner[],
  repr: Map<string, string>,
  predecessorId: string,
  successorId: string,
): PrecedenceEdge {
  const fromLeaf = subtreeBoundaryLeaves(planner, predecessorId).lastLeafId;
  const toLeaf = subtreeBoundaryLeaves(planner, successorId).firstLeafId;
  return {
    fromId: repr.get(fromLeaf) ?? fromLeaf,
    toId: repr.get(toLeaf) ?? toLeaf,
    source: "dependency",
    fromNodeId: predecessorId,
    toNodeId: successorId,
  };
}

/**
 * Mutation shape 1: adding a dependency edge. Returns the closing cycle path
 * (candidate edge first) or null when legal.
 */
export function wouldCreateCycleAddingDependency(
  queues: Queue[],
  dependencies: PlannerDependency[],
  predecessorId: string,
  successorId: string,
  planner: Planner[] = [],
): PrecedenceEdge[] | null {
  const repr = detourComponentMap(planner);
  const edges = contractPrecedenceEdges(
    collectValidationEdges(queues, dependencies, planner),
    repr,
  );
  return findCycle(
    edges,
    expandedCandidate(planner, repr, predecessorId, successorId),
  );
}

/**
 * Node-level variant of mutation shape 1: endpoints may be interior nodes.
 * Same-structural-root pairs are hard-refused before any graph walk — a
 * goal's leaves are already totally ordered by sibling order, so a same-goal
 * edge is either redundant or a guaranteed deadlock. Returns the closing
 * cycle path or "same-root".
 */
export function wouldCreateCycleAddingNodeDependency(
  planner: Planner[],
  queues: Queue[],
  dependencies: PlannerDependency[],
  predecessorId: string,
  successorId: string,
): PrecedenceEdge[] | "same-root" | null {
  const predecessorRoot =
    getRootParentId(planner, predecessorId) ?? predecessorId;
  const successorRoot = getRootParentId(planner, successorId) ?? successorId;
  if (predecessorRoot === successorRoot) return "same-root";
  return wouldCreateCycleAddingDependency(
    queues,
    dependencies,
    predecessorId,
    successorId,
    planner,
  );
}

/**
 * Whole-graph validation for post-move states (subtask reorder, demote): the
 * proposed planner array's internal chains replace the old ones, and any
 * cycle that closes through them is reported. Cheap skip: with no node-level
 * edge endpoint strictly inside the touched root's subtree, a reorder cannot
 * change connectivity (edges into a root always enter at its first leaf and
 * leave from its last, which the internal chain connects regardless of
 * order).
 */
export function validateSubtreeOrder(
  planner: Planner[],
  queues: Queue[],
  dependencies: PlannerDependency[],
  rootId: string,
): PrecedenceEdge[] | null {
  const interior = new Set<string>();
  for (const p of planner) {
    if (p.parentId == null) continue;
    const root = getRootParentId(planner, p.id) ?? p.id;
    if (root === rootId) interior.add(p.id);
  }
  const touchesInterior = dependencies.some(
    (d) => interior.has(d.predecessorId) || interior.has(d.successorId),
  );
  if (!touchesInterior) return null;

  return findCycleInGraph(
    contractPrecedenceEdges(
      collectValidationEdges(queues, dependencies, planner),
      detourComponentMap(planner),
    ),
  );
}

const sortMembers = (members: QueueMember[]): QueueMember[] =>
  [...members].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );

function edgesWithQueueOrder(
  queues: Queue[],
  dependencies: PlannerDependency[],
  queueId: string,
  orderedPlannerIds: string[],
  planner: Planner[],
): PrecedenceEdge[] {
  const others = queues.filter((q) => q.id !== queueId);
  const edges = collectValidationEdges(others, dependencies, planner);
  for (let i = 1; i < orderedPlannerIds.length; i++) {
    const fromNodeId = orderedPlannerIds[i - 1];
    const toNodeId = orderedPlannerIds[i];
    edges.push({
      fromId: subtreeBoundaryLeaves(planner, fromNodeId).lastLeafId,
      toId: subtreeBoundaryLeaves(planner, toNodeId).firstLeafId,
      source: "queue",
      queueId,
      fromNodeId,
      toNodeId,
    });
  }
  return edges;
}

/**
 * Mutation shape 2: adding a planner to a queue at a position (defaults to
 * the end). Returns the cycle the insertion would close, or null.
 */
export function wouldCreateCycleAddingQueueMember(
  queues: Queue[],
  dependencies: PlannerDependency[],
  queueId: string,
  plannerId: string,
  atIndex?: number,
  planner: Planner[] = [],
): PrecedenceEdge[] | null {
  const queue = queues.find((q) => q.id === queueId);
  if (!queue) return null;
  const order = sortMembers(queue.members).map((m) => m.plannerId);
  const index = atIndex === undefined ? order.length : atIndex;
  order.splice(Math.max(0, Math.min(index, order.length)), 0, plannerId);
  return findCycleInGraph(
    contractPrecedenceEdges(
      edgesWithQueueOrder(queues, dependencies, queueId, order, planner),
      detourComponentMap(planner),
    ),
  );
}

/**
 * Mutation shape 3: moving an existing member to a new position within its
 * queue. `toIndex` addresses the order AFTER the member is removed from its
 * old slot. Returns the cycle the reorder would close, or null.
 */
export function wouldCreateCycleReorderingQueueMember(
  queues: Queue[],
  dependencies: PlannerDependency[],
  queueId: string,
  plannerId: string,
  toIndex: number,
  planner: Planner[] = [],
): PrecedenceEdge[] | null {
  const queue = queues.find((q) => q.id === queueId);
  if (!queue) return null;
  const order = sortMembers(queue.members)
    .map((m) => m.plannerId)
    .filter((id) => id !== plannerId);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, plannerId);
  return findCycleInGraph(
    contractPrecedenceEdges(
      edgesWithQueueOrder(queues, dependencies, queueId, order, planner),
      detourComponentMap(planner),
    ),
  );
}
