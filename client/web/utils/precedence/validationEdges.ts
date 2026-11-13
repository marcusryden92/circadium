import type { Queue, PlannerDependency, Planner } from "@/types/prisma";
import type { PrecedenceEdge } from "./types";
import {
  getRootParentId,
  getSortedTreeBottomLayer,
} from "@/utils/goalPageHandlers";

// Boundary leaves of a node's subtree in structural (sortOrder-DFS) order. A
// childless node is its own bottom layer, so the expansion is uniform for
// leaves, branches, and roots. When no planner array is available (legacy
// callers), an endpoint stands for itself.
export function subtreeBoundaryLeaves(
  planner: Planner[],
  id: string,
): { firstLeafId: string; lastLeafId: string } {
  if (planner.length === 0) return { firstLeafId: id, lastLeafId: id };
  const leaves = getSortedTreeBottomLayer(planner, id);
  if (leaves.length === 0) return { firstLeafId: id, lastLeafId: id };
  return {
    firstLeafId: leaves[0].id,
    lastLeafId: leaves[leaves.length - 1].id,
  };
}

// VALIDATION graph builder — deliberately distinct from the engine's gated
// builder (buildPrecedenceEdges in calendar-generation/helpers/Scheduler/
// precedenceEdges.ts). This one uses each queue's FULL logical member order:
// completed and unready members still produce edges, because transparency
// affects gating, never legality — un-completing an item must not be able to
// resurrect a latent cycle. Do NOT "unify" the two.
//
// With `planner` provided, the whole graph lives at LEAF granularity: every
// endpoint (root or interior node) expands to its subtree's boundary leaves —
// predecessor → last leaf, successor → first leaf — and each root's internal
// chain (consecutive-pair `internal` edges over its sortOrder-DFS bottom
// layer, completed leaves INCLUDED) joins the graph. That is what lets a
// node-level dependency cycle thread through two goals' internal orders and
// still be caught. Detours are handled by contraction, never by splicing here.
export function collectValidationEdges(
  queues: Queue[],
  dependencies: PlannerDependency[],
  planner: Planner[] = [],
): PrecedenceEdge[] {
  const edges: PrecedenceEdge[] = [];
  const boundary = (id: string) => subtreeBoundaryLeaves(planner, id);

  for (const queue of queues) {
    const ordered = [...queue.members].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    for (let i = 1; i < ordered.length; i++) {
      const fromNodeId = ordered[i - 1].plannerId;
      const toNodeId = ordered[i].plannerId;
      edges.push({
        fromId: boundary(fromNodeId).lastLeafId,
        toId: boundary(toNodeId).firstLeafId,
        source: "queue",
        queueId: queue.id,
        fromNodeId,
        toNodeId,
      });
    }
  }

  for (const dependency of dependencies) {
    edges.push({
      fromId: boundary(dependency.predecessorId).lastLeafId,
      toId: boundary(dependency.successorId).firstLeafId,
      source: "dependency",
      fromNodeId: dependency.predecessorId,
      toNodeId: dependency.successorId,
    });
  }

  for (const root of planner) {
    if (root.parentId != null) continue;
    const leaves = getSortedTreeBottomLayer(planner, root.id);
    for (let i = 1; i < leaves.length; i++) {
      edges.push({
        fromId: leaves[i - 1].id,
        toId: leaves[i].id,
        source: "internal",
      });
    }
  }

  return edges;
}

// A detour splices the target's work INSIDE the host's sequence, making host
// and target mutually ordered — for cycle legality they are one node. This
// union-find map contracts every detour-connected component to a
// representative planner id; queue/dependency edges are validated over the
// contracted graph, so any path connecting a host with its spliced target (in
// either direction) closes a cycle and is refused. Unready/completed targets
// still count — legality, not gating, same rule as queue members. The map
// covers EVERY node of an involved component's subtrees (not just roots), so
// leaf-granular edges contract correctly.
export function detourComponentMap(planner: Planner[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    let current = id;
    while (current !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const p of planner) {
    if (!p.linkedItemId) continue;
    const hostRoot = getRootParentId(planner, p.id) ?? p.id;
    parent.set(hostRoot, parent.get(hostRoot) ?? hostRoot);
    parent.set(p.linkedItemId, parent.get(p.linkedItemId) ?? p.linkedItemId);
    union(hostRoot, p.linkedItemId);
  }

  const repr = new Map<string, string>();
  for (const id of parent.keys()) repr.set(id, find(id));
  if (repr.size === 0) return repr;

  // Interior nodes resolve through their structural root, so a boundary-leaf
  // endpoint inside a detour component contracts like the root itself.
  for (const p of planner) {
    if (p.parentId == null) continue;
    const root = getRootParentId(planner, p.id) ?? p.id;
    const contracted = repr.get(root);
    if (contracted !== undefined) repr.set(p.id, contracted);
  }
  return repr;
}

// Rewrite edge endpoints through the detour component map. Identity when the
// map is empty, so detour-free callers see the exact same graph. INTERNAL
// edges that collapse into a self-loop are contraction artifacts and are
// dropped — a contracted component's internal order is invisible to
// cross-component checks (the accepted fidelity loss for detours). Queue and
// dependency self-loops are KEPT: an ordering edge within one contracted
// component is a genuine contradiction (mutual ordering = deadlock) and
// findCycle treats fromId === toId as a cycle.
export function contractPrecedenceEdges(
  edges: PrecedenceEdge[],
  repr: Map<string, string>,
): PrecedenceEdge[] {
  if (repr.size === 0) return edges;
  const result: PrecedenceEdge[] = [];
  for (const e of edges) {
    const fromId = repr.get(e.fromId) ?? e.fromId;
    const toId = repr.get(e.toId) ?? e.toId;
    if (fromId === toId && e.source === "internal") continue;
    result.push(
      fromId === e.fromId && toId === e.toId ? e : { ...e, fromId, toId },
    );
  }
  return result;
}
