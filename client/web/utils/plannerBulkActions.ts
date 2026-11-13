import type { Planner } from "@/types/prisma";
import { getTaskTreeIds } from "@/utils/goalPageHandlers";

export function collectTreeIds(
  planner: Planner[],
  rootIds: string[],
): Set<string> {
  const ids = new Set<string>();
  for (const rootId of rootIds) {
    for (const id of getTaskTreeIds(planner, rootId)) ids.add(id);
  }
  return ids;
}

export function deleteSubtrees(
  planner: Planner[],
  rootIds: string[],
): Planner[] {
  const doomed = collectTreeIds(planner, rootIds);
  return planner.filter((p) => !doomed.has(p.id));
}

// Category lives on the root only; descendants are cleared so they inherit via
// the parent-chain walk. When the new category carries a location, rows
// without their own location switch to inheriting it.
export function assignCategoryToSubtrees(
  planner: Planner[],
  rootIds: string[],
  categoryId: string | null,
  categoryHasLocation: boolean,
): Planner[] {
  const now = new Date().toISOString();
  const roots = new Set(rootIds);
  const descendants = collectTreeIds(planner, rootIds);
  for (const id of roots) descendants.delete(id);

  return planner.map((p) => {
    if (roots.has(p.id)) {
      const updated: Planner = { ...p, categoryId, updatedAt: now };
      if (categoryHasLocation && !p.locationId) {
        updated.useParentLocation = true;
      }
      return updated;
    }
    if (!descendants.has(p.id)) return p;
    const inheritLocation =
      categoryHasLocation && !p.locationId && !p.useParentLocation;
    if (p.categoryId === null && !inheritLocation) return p;
    const updated: Planner = { ...p, categoryId: null, updatedAt: now };
    if (inheritLocation) updated.useParentLocation = true;
    return updated;
  });
}

// A goal and its subtasks read as one block on the calendar, so color cascades
// over the whole subtree.
export function setColorOnSubtrees(
  planner: Planner[],
  rootIds: string[],
  color: string,
): Planner[] {
  const now = new Date().toISOString();
  const ids = collectTreeIds(planner, rootIds);
  return planner.map((p) =>
    ids.has(p.id) && p.color !== color
      ? { ...p, color, updatedAt: now }
      : p,
  );
}

export function setPriorityOnRoots(
  planner: Planner[],
  rootIds: string[],
  priority: number,
): Planner[] {
  const roots = new Set(rootIds);
  const now = new Date().toISOString();
  return planner.map((p) =>
    roots.has(p.id) && p.priority !== priority
      ? { ...p, priority, updatedAt: now }
      : p,
  );
}
