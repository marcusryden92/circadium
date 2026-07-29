import type { Habit, HabitBucket, HabitItem } from "@/types/prisma";
import type { DraftForest } from "./plannerForestToJson";

// The assistant's habit-tracker contract. A habit is a named tracker (with an
// optional color) over a set of top-level REPEATING planner items; completion
// history is derived from those items and is never part of the contract.
// Buckets are the habits surface's own grouping — a separate entity from item
// categories, referenced by habits via bucketId. Habit AND bucket ids are
// engine-minted uuids that become the DB ids at Save (the queue/template
// precedent); item ids may be draft planner ids, remapped through nodeIdMap at
// Save. Bucket-list order, habit-list order, and item order are all
// non-semantic — states compare as sets.

export interface DraftHabitBucket {
  id: string;
  name: string;
  color: string | null;
}

export interface DraftHabit {
  id: string;
  name: string;
  color: string | null;
  bucketId: string | null;
  itemPlannerIds: string[];
}

export interface DraftHabitsState {
  buckets: DraftHabitBucket[];
  habits: DraftHabit[];
}

export function habitsToDraftState(
  buckets: HabitBucket[],
  habits: Habit[],
  items: HabitItem[],
): DraftHabitsState {
  const itemsByHabit = new Map<string, string[]>();
  for (const item of items) {
    const list = itemsByHabit.get(item.habitId);
    if (list) list.push(item.plannerId);
    else itemsByHabit.set(item.habitId, [item.plannerId]);
  }
  return {
    buckets: buckets.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color ?? null,
    })),
    habits: habits.map((h) => ({
      id: h.id,
      name: h.name,
      color: h.color ?? null,
      bucketId: h.bucketId ?? null,
      itemPlannerIds: itemsByHabit.get(h.id) ?? [],
    })),
  };
}

// Event-seam normalization (the templates/windows pattern): the engine emits
// the full authoritative state; the caller re-validates the shape before
// adopting it.
export function normalizeDraftHabitsState(
  raw: unknown,
): DraftHabitsState | null {
  if (!raw || typeof raw !== "object") return null;
  const bucketsRaw = (raw as { buckets?: unknown }).buckets;
  const habitsRaw = (raw as { habits?: unknown }).habits;
  if (!Array.isArray(bucketsRaw) || !Array.isArray(habitsRaw)) return null;
  const buckets: DraftHabitBucket[] = [];
  for (const entry of bucketsRaw) {
    if (!entry || typeof entry !== "object") return null;
    const b = entry as Record<string, unknown>;
    if (typeof b.id !== "string" || b.id.length === 0) return null;
    if (typeof b.name !== "string") return null;
    buckets.push({
      id: b.id,
      name: b.name,
      color: typeof b.color === "string" && b.color.length > 0 ? b.color : null,
    });
  }
  const habits: DraftHabit[] = [];
  for (const entry of habitsRaw) {
    if (!entry || typeof entry !== "object") return null;
    const h = entry as Record<string, unknown>;
    if (typeof h.id !== "string" || h.id.length === 0) return null;
    if (typeof h.name !== "string") return null;
    habits.push({
      id: h.id,
      name: h.name,
      color: typeof h.color === "string" && h.color.length > 0 ? h.color : null,
      bucketId:
        typeof h.bucketId === "string" && h.bucketId.length > 0
          ? h.bucketId
          : null,
      itemPlannerIds: Array.isArray(h.itemPlannerIds)
        ? h.itemPlannerIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          )
        : [],
    });
  }
  return { buckets, habits };
}

function itemSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== new Set(b).size) return false;
  return b.every((id) => set.has(id));
}

export function draftHabitBucketsEqual(
  a: DraftHabitBucket,
  b: DraftHabitBucket,
): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    (a.color ?? null) === (b.color ?? null)
  );
}

export function draftHabitsEqual(a: DraftHabit, b: DraftHabit): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    (a.color ?? null) === (b.color ?? null) &&
    (a.bucketId ?? null) === (b.bucketId ?? null) &&
    itemSetsEqual(a.itemPlannerIds, b.itemPlannerIds)
  );
}

// Bucket and habit list order are non-semantic: compare as id-keyed sets.
export function draftHabitsStateEqual(
  a: DraftHabitsState,
  b: DraftHabitsState,
): boolean {
  if (a.buckets.length !== b.buckets.length) return false;
  if (a.habits.length !== b.habits.length) return false;
  const bucketById = new Map(b.buckets.map((bucket) => [bucket.id, bucket]));
  if (
    !a.buckets.every((bucket) => {
      const other = bucketById.get(bucket.id);
      return !!other && draftHabitBucketsEqual(bucket, other);
    })
  ) {
    return false;
  }
  const byId = new Map(b.habits.map((h) => [h.id, h]));
  return a.habits.every((habit) => {
    const other = byId.get(habit.id);
    return !!other && draftHabitsEqual(habit, other);
  });
}

// Forest edits can orphan tracked-item references (a deleted goal must not
// linger inside a habit). Identity-preserving when nothing changed. Habits
// themselves survive with zero items — an empty tracker is valid — and
// buckets carry no forest references at all.
export function pruneDraftHabits(
  state: DraftHabitsState,
  forest: DraftForest,
): { state: DraftHabitsState; changed: boolean } {
  const rootIds = new Set(
    forest.goals.map((g) => g.id).filter((id) => id.length > 0),
  );
  let changed = false;
  const habits = state.habits.map((habit) => {
    const kept = habit.itemPlannerIds.filter((id) => rootIds.has(id));
    if (kept.length === habit.itemPlannerIds.length) return habit;
    changed = true;
    return { ...habit, itemPlannerIds: kept };
  });
  return changed
    ? { state: { buckets: state.buckets, habits }, changed }
    : { state, changed };
}
