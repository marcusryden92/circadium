import { Planner, PlannerType } from "@/types/prisma";
import {
  getEffectiveCategoryId,
  getRootParentId,
  getSubtasksById,
  getTaskTreeIds,
} from "@/utils/goalPageHandlers";
import { defaultReadyForType } from "@/utils/plannerReadiness";
import { fallbackCalendarColor } from "@/utils/colorUtils";

export interface PromoteError {
  error: string;
}

// Break a subtree out of its goal so it becomes its own top-level item. Pure
// and immutable (plannerBulkActions style); dispatch the result through
// updatePlannerArray so the thunk's central pruning, the regen, and one
// debounced sync all see the same snapshot. Ancestor-inherited constraints and
// location are live-resolved, not stored, so promotion drops them by
// construction — only the effective category is snapshotted onto the row (the
// root-only invariant: without it the subtree silently loses category,
// strict-window eligibility, and category-location inheritance).
export function promoteSubtree(
  planner: Planner[],
  itemId: string,
): Planner[] | PromoteError {
  const item = planner.find((p) => p.id === itemId);
  if (!item) return { error: "Item not found." };
  if (item.parentId == null) {
    return { error: "This item is already at the top level." };
  }
  if (item.plannerType === PlannerType.plan) {
    return { error: "Plans cannot be promoted." };
  }

  // Resolve BEFORE mutating: the parent-chain walk needs the old tree shape.
  // Queue category inheritance is deliberately not consulted — it is not a
  // structural property of the subtree.
  const resolvedCategory = getEffectiveCategoryId(planner, itemId);
  const oldRootId = getRootParentId(planner, itemId);
  const oldRoot = oldRootId
    ? planner.find((p) => p.id === oldRootId)
    : undefined;

  const now = new Date().toISOString();
  const hasChildren = getSubtasksById(planner, itemId).length > 0;
  const promotedType = hasChildren ? PlannerType.goal : PlannerType.task;
  const promotedReady = hasChildren
    ? item.deadline != null
      ? item.isReady === true
      : false
    : defaultReadyForType(PlannerType.task);

  const treeIds = new Set(getTaskTreeIds(planner, itemId));

  let next = planner.map((p) => {
    if (p.id === itemId) {
      return {
        ...p,
        parentId: null,
        sortOrder: 0,
        isTriaged: true,
        plannerType: promotedType,
        isReady: promotedReady,
        categoryId: resolvedCategory,
        linkedItemId: null,
        color: p.color || oldRoot?.color || fallbackCalendarColor(p.id),
        updatedAt: now,
      };
    }
    // Readiness is a whole-subtree property — stamp the resolved value over
    // every descendant, touching only rows whose value actually changes.
    if (treeIds.has(p.id) && (p.isReady === true) !== promotedReady) {
      return { ...p, isReady: promotedReady, updatedAt: now };
    }
    return p;
  });

  // Emptied-source fixup (deleteGoal parity): a childless ready goal root is
  // its own bottom-layer leaf and would start scheduling its own stale
  // duration.
  if (oldRootId && oldRootId !== itemId) {
    const rootChildren = getSubtasksById(next, oldRootId);
    const root = next.find((p) => p.id === oldRootId);
    if (
      rootChildren.length === 0 &&
      root &&
      root.plannerType === PlannerType.goal &&
      root.isReady !== false
    ) {
      next = next.map((p) =>
        p.id === oldRootId ? { ...p, isReady: false, updatedAt: now } : p,
      );
    }
  }

  return next;
}
