import type { Planner, PlannerDependency } from "@/types/prisma";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import { getTaskTreeIds } from "@/utils/goalPageHandlers";

// Authoring-time readiness gate helpers. A goal cannot be marked ready while
// a dependency predecessor sits under an unready goal root; symmetrically,
// un-readying a goal that a READY goal depends on is refused. Node-level
// edges resolve through their CONTAINING ROOT (a task-typed subtask under an
// unready goal still blocks — the engine would otherwise break the promise
// with DEPENDENCY_BROKEN), and edges into a goal's SUBTREE gate the goal.
// Completed endpoints and completed roots never block (transparent).

export interface DependencyGateEntry {
  edgeId: string;
  // The authored endpoint on the other side of the edge.
  endpoint: Planner;
  // The endpoint's structural root — where readiness actually lives. Equals
  // `endpoint` for root-level edges.
  root: Planner;
}

function rootRowOf(
  byId: Map<string, Planner>,
  row: Planner,
): Planner | undefined {
  const seen = new Set<string>([row.id]);
  let current: Planner | undefined = row;
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || seen.has(parent.id)) return undefined;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

export function dependencyReadyBlockers(
  plannerId: string,
  dependencies: PlannerDependency[],
  planner: Planner[],
): DependencyGateEntry[] {
  const plannerById = new Map(planner.map((p) => [p.id, p]));
  if (!plannerById.has(plannerId)) return [];
  const subtree = new Set(getTaskTreeIds(planner, plannerId));
  const blockers: DependencyGateEntry[] = [];
  for (const dependency of dependencies) {
    if (!subtree.has(dependency.successorId)) continue;
    const endpoint = plannerById.get(dependency.predecessorId);
    if (!endpoint) continue;
    if (plannerIsCompleted(endpoint)) continue;
    const root = rootRowOf(plannerById, endpoint);
    if (!root) continue;
    if (root.plannerType !== "goal") continue;
    if (root.isReady === true) continue;
    if (plannerIsCompleted(root)) continue;
    blockers.push({ edgeId: dependency.id, endpoint, root });
  }
  return blockers;
}

export function readyDependents(
  plannerId: string,
  dependencies: PlannerDependency[],
  planner: Planner[],
): DependencyGateEntry[] {
  const plannerById = new Map(planner.map((p) => [p.id, p]));
  if (!plannerById.has(plannerId)) return [];
  const subtree = new Set(getTaskTreeIds(planner, plannerId));
  const dependents: DependencyGateEntry[] = [];
  for (const dependency of dependencies) {
    if (!subtree.has(dependency.predecessorId)) continue;
    // A completed predecessor endpoint stays transparent even under an
    // unready root, so un-readying cannot break that successor.
    const predecessor = plannerById.get(dependency.predecessorId);
    if (!predecessor || plannerIsCompleted(predecessor)) continue;
    const endpoint = plannerById.get(dependency.successorId);
    if (!endpoint) continue;
    const root = rootRowOf(plannerById, endpoint);
    if (!root) continue;
    if (root.plannerType !== "goal") continue;
    if (root.isReady !== true) continue;
    if (plannerIsCompleted(root)) continue;
    dependents.push({ edgeId: dependency.id, endpoint, root });
  }
  return dependents;
}
