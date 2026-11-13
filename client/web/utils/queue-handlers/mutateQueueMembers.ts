import { v4 as uuidv4 } from "uuid";
import type {
  Queue,
  QueueMember,
  PlannerDependency,
  Planner,
} from "@/types/prisma";
import type { PrecedenceEdge } from "@/utils/precedence/types";
import {
  wouldCreateCycleAddingQueueMember,
  wouldCreateCycleReorderingQueueMember,
} from "@/utils/precedence/findCycle";
import { insertKeyAt } from "./sortOrderKeys";

// The ONE seam every queue-member write goes through — the add-member modal,
// the member-list drag, and any future graph surface. Each mutation runs the
// merged-graph cycle validator before producing the next queues array; UI
// never assembles member arrays ad hoc.

export type QueueMutationResult =
  | { ok: true; queues: Queue[] }
  | { ok: false; cycle: PrecedenceEdge[] };

export function sortQueueMembers(members: QueueMember[]): QueueMember[] {
  return [...members].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export function addQueueMember({
  queues,
  dependencies,
  queueId,
  plannerId,
  userId,
  atIndex,
  planner = [],
}: {
  queues: Queue[];
  dependencies: PlannerDependency[];
  queueId: string;
  plannerId: string;
  userId: string;
  atIndex?: number;
  /** When provided, detour links join the cycle graph (host ↔ target). */
  planner?: Planner[];
}): QueueMutationResult {
  const queue = queues.find((q) => q.id === queueId);
  if (!queue) return { ok: true, queues };
  // One queue per planner — the DB unique enforces it; refuse silently here
  // rather than produce a doomed sync.
  if (queues.some((q) => q.members.some((m) => m.plannerId === plannerId))) {
    return { ok: true, queues };
  }

  const cycle = wouldCreateCycleAddingQueueMember(
    queues,
    dependencies,
    queueId,
    plannerId,
    atIndex,
    planner,
  );
  if (cycle) return { ok: false, cycle };

  const sorted = sortQueueMembers(queue.members);
  const index = atIndex === undefined ? sorted.length : atIndex;
  const { key, reindexed } = insertKeyAt(sorted, index);
  const now = new Date().toISOString();
  const member: QueueMember = {
    id: uuidv4(),
    sortOrder: key,
    queueId,
    plannerId,
    userId,
    createdAt: now,
    updatedAt: now,
  };

  const nextMembers = [
    ...queue.members.map((m) =>
      reindexed?.has(m.id)
        ? { ...m, sortOrder: reindexed.get(m.id)!, updatedAt: now }
        : m,
    ),
    member,
  ];

  return {
    ok: true,
    queues: queues.map((q) =>
      q.id === queueId ? { ...q, members: nextMembers } : q,
    ),
  };
}

// `toIndex` addresses the member order AFTER the moved row is removed.
export function reorderQueueMember({
  queues,
  dependencies,
  queueId,
  plannerId,
  toIndex,
  planner = [],
}: {
  queues: Queue[];
  dependencies: PlannerDependency[];
  queueId: string;
  plannerId: string;
  toIndex: number;
  /** When provided, detour links join the cycle graph (host ↔ target). */
  planner?: Planner[];
}): QueueMutationResult {
  const queue = queues.find((q) => q.id === queueId);
  if (!queue) return { ok: true, queues };
  const moved = queue.members.find((m) => m.plannerId === plannerId);
  if (!moved) return { ok: true, queues };

  const cycle = wouldCreateCycleReorderingQueueMember(
    queues,
    dependencies,
    queueId,
    plannerId,
    toIndex,
    planner,
  );
  if (cycle) return { ok: false, cycle };

  const withoutMoved = sortQueueMembers(queue.members).filter(
    (m) => m.plannerId !== plannerId,
  );
  const { key, reindexed } = insertKeyAt(
    withoutMoved,
    Math.max(0, Math.min(toIndex, withoutMoved.length)),
  );
  const now = new Date().toISOString();

  const nextMembers = queue.members.map((m) => {
    if (m.id === moved.id) return { ...m, sortOrder: key, updatedAt: now };
    if (reindexed?.has(m.id))
      return { ...m, sortOrder: reindexed.get(m.id)!, updatedAt: now };
    return m;
  });

  return {
    ok: true,
    queues: queues.map((q) =>
      q.id === queueId ? { ...q, members: nextMembers } : q,
    ),
  };
}

// Removals can never close a cycle — no validation needed.
export function removeQueueMember(
  queues: Queue[],
  plannerId: string,
): Queue[] {
  let changed = false;
  const next = queues.map((q) => {
    if (!q.members.some((m) => m.plannerId === plannerId)) return q;
    changed = true;
    return { ...q, members: q.members.filter((m) => m.plannerId !== plannerId) };
  });
  return changed ? next : queues;
}
