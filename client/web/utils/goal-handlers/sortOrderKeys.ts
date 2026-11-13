import { Planner } from "@/types/prisma";

export const SORT_ORDER_STEP = 1024;

// Below this gap a float64 midpoint stops being reliably distinct from its
// bounds, so the sibling group reindexes to clean multiples of the step.
const MIN_GAP = 1e-6;

export function compareSiblings(a: Planner, b: Planner): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function sortSiblings(tasks: Planner[]): Planner[] {
  return [...tasks].sort(compareSiblings);
}

export function appendKey(siblings: Planner[]): number {
  let max = 0;
  for (const s of siblings) if (s.sortOrder > max) max = s.sortOrder;
  return max + SORT_ORDER_STEP;
}

export interface InsertKey {
  key: number;
  // Non-null when the neighboring keys were too close for a distinct
  // midpoint: sibling id -> new sortOrder for the whole group. Apply together
  // with the inserted row's key in the same immutable update.
  reindexed: Map<string, number> | null;
}

// Key for inserting at `index` (0 = first) into an already-sorted sibling
// group. The group must not contain the row being inserted.
export function insertKeyAt(
  sortedSiblings: Planner[],
  index: number,
): InsertKey {
  const prev = index > 0 ? sortedSiblings[index - 1].sortOrder : null;
  const next =
    index < sortedSiblings.length ? sortedSiblings[index].sortOrder : null;

  if (prev === null && next === null)
    return { key: SORT_ORDER_STEP, reindexed: null };
  if (prev === null)
    return { key: (next as number) - SORT_ORDER_STEP, reindexed: null };
  if (next === null) return { key: prev + SORT_ORDER_STEP, reindexed: null };

  if (next - prev >= MIN_GAP)
    return { key: prev + (next - prev) / 2, reindexed: null };

  const reindexed = new Map<string, number>();
  sortedSiblings.forEach((s, i) => {
    reindexed.set(s.id, (i < index ? i + 1 : i + 2) * SORT_ORDER_STEP);
  });
  return { key: (index + 1) * SORT_ORDER_STEP, reindexed };
}
