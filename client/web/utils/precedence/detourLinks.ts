import type { Planner, Queue, PlannerDependency } from "@/types/prisma";
import {
  getRootParentId,
  getSortedTreeBottomLayer,
} from "@/utils/goalPageHandlers";
import {
  collectValidationEdges,
  detourComponentMap,
  contractPrecedenceEdges,
  subtreeBoundaryLeaves,
} from "./validationEdges";

// Detour-link authoring rules. A placeholder subtask carries linkedItemId
// pointing at a root goal/task ("target") whose leaves the engine splices in.
// Legality is enforced here at authoring time; the engine never sees a cycle
// (its enumerator additionally cycle-guards defensively, and the scheduler
// force-fails deadlocked gates from stale data instead of burning budget).

// A target must be a triaged root task/goal — the same endpoint shape queues
// and dependencies require.
export function isValidDetourTarget(
  target: Planner | undefined,
): target is Planner {
  return (
    !!target &&
    target.parentId == null &&
    target.isTriaged &&
    (target.plannerType === "task" || target.plannerType === "goal")
  );
}

// Root-level detour graph: an edge rootOf(placeholder) -> linkedItemId for every
// existing link. A detour cycle is a cycle in this graph.
function buildDetourAdjacency(planner: Planner[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const p of planner) {
    if (!p.linkedItemId) continue;
    const root = getRootParentId(planner, p.id) ?? p.id;
    const set = adjacency.get(root);
    if (set) set.add(p.linkedItemId);
    else adjacency.set(root, new Set([p.linkedItemId]));
  }
  return adjacency;
}

function reaches(
  adjacency: Map<string, Set<string>>,
  from: string,
  to: string,
): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

// Would linking `placeholderId` to `targetId` close a detour cycle? True when
// the target already splices (transitively) back into the placeholder's own
// root — including the self case (linking a subtask to its own root).
export function wouldCreateDetourCycle(
  planner: Planner[],
  placeholderId: string,
  targetId: string,
): boolean {
  const placeholderRoot = getRootParentId(planner, placeholderId);
  if (!placeholderRoot) return false;
  if (targetId === placeholderRoot) return true;
  const adjacency = buildDetourAdjacency(planner);
  return reaches(adjacency, targetId, placeholderRoot);
}

export interface DetourLinkCheck {
  ok: boolean;
  reason?: "invalid-target" | "self" | "cycle";
}

function reachesAny(
  adjacency: Map<string, Set<string>>,
  from: string,
  targets: ReadonlySet<string>,
): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (targets.has(node)) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

// A link makes host and target mutually ordered (the target's work sits
// INSIDE the host's flow), so any existing queue/dependency path connecting
// their detour components — in EITHER direction — would deadlock at runtime
// and refuses as a cycle. Detour components contract exactly like the
// queue/dependency validators do, so the two authoring surfaces agree. The
// validation graph lives at leaf granularity, so the walk starts at a
// subtree's FIRST leaf (the internal chain reaches every later departure
// point) and arrives at ANY leaf of the other subtree — node-level
// dependency edges out of interior nodes are covered.
function precedencePathConnects(
  planner: Planner[],
  queues: Queue[],
  dependencies: PlannerDependency[],
  hostRootId: string,
  targetId: string,
): boolean {
  const repr = detourComponentMap(planner);
  if ((repr.get(hostRootId) ?? hostRootId) === (repr.get(targetId) ?? targetId)) {
    return false;
  }
  const edges = contractPrecedenceEdges(
    collectValidationEdges(queues, dependencies, planner),
    repr,
  );

  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    const set = adjacency.get(edge.fromId);
    if (set) set.add(edge.toId);
    else adjacency.set(edge.fromId, new Set([edge.toId]));
  }

  const contracted = (id: string) => repr.get(id) ?? id;
  const leafSet = (rootId: string): Set<string> =>
    new Set(
      getSortedTreeBottomLayer(planner, rootId).map((l) => contracted(l.id)),
    );
  const hostLeaves = leafSet(hostRootId);
  const targetLeaves = leafSet(targetId);
  const hostStart = contracted(
    subtreeBoundaryLeaves(planner, hostRootId).firstLeafId,
  );
  const targetStart = contracted(
    subtreeBoundaryLeaves(planner, targetId).firstLeafId,
  );
  return (
    reachesAny(adjacency, hostStart, targetLeaves) ||
    reachesAny(adjacency, targetStart, hostLeaves)
  );
}

export function canLinkAsDetour(
  planner: Planner[],
  placeholderId: string,
  targetId: string,
  queues: Queue[] = [],
  dependencies: PlannerDependency[] = [],
): DetourLinkCheck {
  const byId = new Map(planner.map((p) => [p.id, p]));
  if (!isValidDetourTarget(byId.get(targetId))) {
    return { ok: false, reason: "invalid-target" };
  }
  const placeholderRoot = getRootParentId(planner, placeholderId);
  if (targetId === placeholderRoot) return { ok: false, reason: "self" };
  if (wouldCreateDetourCycle(planner, placeholderId, targetId)) {
    return { ok: false, reason: "cycle" };
  }
  if (
    placeholderRoot &&
    precedencePathConnects(planner, queues, dependencies, placeholderRoot, targetId)
  ) {
    return { ok: false, reason: "cycle" };
  }
  return { ok: true };
}
