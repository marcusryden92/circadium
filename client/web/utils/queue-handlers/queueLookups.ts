import type { Queue } from "@/types/prisma";

// Shared lookup seam for queue-derived display facts, used by every surface
// that renders queue membership or effective category (queues page, item
// detail, dashboard, library/search badges) so they all agree with the
// engine's applyQueueCategoryInheritance.

// Root planner id -> the categoryId its queue would lend it. Only queues
// with a category contribute; a member with its own category ignores this
// at the read site (getEffectiveCategoryId checks own chain first).
export function buildQueueCategoryByRootId(
  queues: Queue[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const queue of queues) {
    if (!queue.categoryId) continue;
    for (const member of queue.members) {
      map.set(member.plannerId, queue.categoryId);
    }
  }
  return map;
}

// Root planner id -> the queue containing it (at most one, DB-enforced).
export function buildQueueByPlannerId(queues: Queue[]): Map<string, Queue> {
  const map = new Map<string, Queue>();
  for (const queue of queues) {
    for (const member of queue.members) {
      map.set(member.plannerId, queue);
    }
  }
  return map;
}
