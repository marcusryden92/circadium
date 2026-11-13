// Fractional sibling keys for {id, sortOrder} rows — the goal-handlers
// sortOrderKeys module generalized away from Planner (queue members carry the
// same fractional-key ordering discipline: one-row diff per drag).

export const SORT_ORDER_STEP = 1024;

// Below this gap a float64 midpoint stops being reliably distinct from its
// bounds, so the sibling group reindexes to clean multiples of the step.
const MIN_GAP = 1e-6;

export interface SortOrderedRow {
  id: string;
  sortOrder: number;
}

export function appendKey(rows: SortOrderedRow[]): number {
  let max = 0;
  for (const r of rows) if (r.sortOrder > max) max = r.sortOrder;
  return max + SORT_ORDER_STEP;
}

export interface InsertKey {
  key: number;
  // Non-null when the neighboring keys were too close for a distinct
  // midpoint: row id -> new sortOrder for the whole group. Apply together
  // with the inserted row's key in the same immutable update.
  reindexed: Map<string, number> | null;
}

// Key for inserting at `index` (0 = first) into an already-sorted group.
// The group must not contain the row being inserted.
export function insertKeyAt(
  sortedRows: SortOrderedRow[],
  index: number,
): InsertKey {
  const prev = index > 0 ? sortedRows[index - 1].sortOrder : null;
  const next = index < sortedRows.length ? sortedRows[index].sortOrder : null;

  if (prev === null && next === null)
    return { key: SORT_ORDER_STEP, reindexed: null };
  if (prev === null)
    return { key: (next as number) - SORT_ORDER_STEP, reindexed: null };
  if (next === null) return { key: prev + SORT_ORDER_STEP, reindexed: null };

  if (next - prev >= MIN_GAP)
    return { key: prev + (next - prev) / 2, reindexed: null };

  const reindexed = new Map<string, number>();
  sortedRows.forEach((r, i) => {
    reindexed.set(r.id, (i < index ? i + 1 : i + 2) * SORT_ORDER_STEP);
  });
  return { key: (index + 1) * SORT_ORDER_STEP, reindexed };
}
