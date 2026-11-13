import type { Planner, Queue } from "@/types/prisma";

/**
 * Queue category inheritance, applied once at the engine's input boundary.
 * A queue's optional categoryId is an inherited default: root members with no
 * category of their own resolve to it, so windows/strictness/location follow
 * the normal category machinery downstream (buildPlannerCategoryMap,
 * resolveCategoryLocation, capacityCheck, eligibility matching) with zero
 * signature changes. Members with their own category keep it.
 *
 * Planner rows never flow out of the engine, so the substitution is
 * diff-safe. Identity discipline: returns the SAME array reference when no
 * member needed patching.
 */
export function applyQueueCategoryInheritance(
  planners: Planner[],
  queues: Queue[],
): Planner[] {
  if (queues.length === 0) return planners;

  const queueCategoryByPlannerId = new Map<string, string>();
  for (const queue of queues) {
    if (!queue.categoryId) continue;
    for (const member of queue.members) {
      queueCategoryByPlannerId.set(member.plannerId, queue.categoryId);
    }
  }
  if (queueCategoryByPlannerId.size === 0) return planners;

  let changed = false;
  const next = planners.map((p) => {
    if (p.parentId != null || p.categoryId != null) return p;
    const inherited = queueCategoryByPlannerId.get(p.id);
    if (!inherited) return p;
    changed = true;
    return { ...p, categoryId: inherited };
  });

  return changed ? next : planners;
}
