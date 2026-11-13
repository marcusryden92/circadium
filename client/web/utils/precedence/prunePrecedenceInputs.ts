import type { Planner, Queue, PlannerDependency } from "@/types/prisma";
import {
  isValidDependencyEndpoint,
  isValidPrecedenceEndpoint,
} from "./endpoints";

// Central pruning for precedence structures. Runs in the calendar thunk on
// every pass, so a member/endpoint planner that is deleted, retyped to plan,
// nested under a parent, or sent back to the triage queue is dropped wherever
// the mutation originated; DB cascade covers server-side deletes. Completed
// and unready rows are deliberately KEPT — they are valid transparent links /
// gate inputs (transparency affects gating, never membership).

export function pruneQueueMembers(
  queues: Queue[],
  planner: Planner[],
): Queue[] {
  if (queues.length === 0) return queues;
  const plannerById = new Map(planner.map((p) => [p.id, p]));

  let changed = false;
  const next = queues.map((queue) => {
    const members = queue.members.filter((m) =>
      isValidPrecedenceEndpoint(plannerById.get(m.plannerId)),
    );
    if (members.length === queue.members.length) return queue;
    changed = true;
    return { ...queue, members };
  });

  return changed ? next : queues;
}

// Dependencies alone accept node-level endpoints: any non-plan node whose
// structural root is triaged and non-plan. Queue members and detour targets
// keep the root predicate.
export function pruneDependencies(
  dependencies: PlannerDependency[],
  planner: Planner[],
): PlannerDependency[] {
  if (dependencies.length === 0) return dependencies;
  const plannerById = new Map(planner.map((p) => [p.id, p]));

  const next = dependencies.filter(
    (d) =>
      isValidDependencyEndpoint(plannerById, d.predecessorId) &&
      isValidDependencyEndpoint(plannerById, d.successorId),
  );

  return next.length === dependencies.length ? dependencies : next;
}

// Central pruning for detour links: clear a placeholder's linkedItemId when its
// target no longer resolves to a valid schedulable root (deleted, retyped to
// plan, nested under a parent, or untriaged). Deletes are also covered by the
// FK's onDelete: SetNull, but clearing client-side first keeps the sync
// transaction from writing a linkedItemId that references an about-to-be-deleted
// row. Identity-preserving on no-op.
export function prunePlannerDetours(planner: Planner[]): Planner[] {
  const byId = new Map(planner.map((p) => [p.id, p]));
  let changed = false;
  const next = planner.map((p) => {
    if (!p.linkedItemId) return p;
    if (isValidPrecedenceEndpoint(byId.get(p.linkedItemId))) return p;
    changed = true;
    return { ...p, linkedItemId: null };
  });
  return changed ? next : planner;
}
