import { Planner } from "@/types/prisma";

/**
 * Build a map of planner ID -> effective categoryId by walking up the parent chain.
 * Only the root item needs categoryId stored; descendants inherit it automatically.
 * Uses memoization so each node is resolved at most once — O(n) total regardless of tree depth.
 */
export function buildPlannerCategoryMap(
  planners: Planner[]
): Map<string, string | null> {
  const plannerMap = new Map(planners.map((p) => [p.id, p]));
  const result = new Map<string, string | null>();

  function resolve(id: string): string | null {
    if (result.has(id)) return result.get(id)!;

    const planner = plannerMap.get(id);
    if (!planner) {
      result.set(id, null);
      return null;
    }

    if (planner.categoryId) {
      result.set(id, planner.categoryId);
      return planner.categoryId;
    }

    const resolved = planner.parentId ? resolve(planner.parentId) : null;
    result.set(id, resolved);
    return resolved;
  }

  for (const planner of planners) {
    resolve(planner.id);
  }

  return result;
}
