import type {
  DraftHabit,
  DraftHabitBucket,
  DraftHabitsState,
} from "./draftHabits";

// Review-pane diff for the habits domain: bucket entries plus one entry per
// habit that exists in either state (canonical-deleted appended last), with
// per-item added/removed badges. Field names are the friendly ones the pane
// renders directly.

export type DraftHabitDiffStatus =
  | "added"
  | "deleted"
  | "modified"
  | "unchanged";

export interface DraftHabitBucketDiff {
  bucket: DraftHabitBucket;
  status: DraftHabitDiffStatus;
  changedFields: string[];
}

export interface DraftHabitItemDiff {
  plannerId: string;
  status: "added" | "deleted" | "unchanged";
}

export interface DraftHabitDiff {
  habit: DraftHabit;
  status: DraftHabitDiffStatus;
  changedFields: string[];
  items: DraftHabitItemDiff[];
}

export interface DraftHabitsDiff {
  buckets: DraftHabitBucketDiff[];
  habits: DraftHabitDiff[];
}

export function diffDraftHabits(
  canonical: DraftHabitsState,
  working: DraftHabitsState,
): DraftHabitsDiff {
  const canonicalBucketById = new Map(
    canonical.buckets.map((b) => [b.id, b]),
  );
  const workingBucketIds = new Set(working.buckets.map((b) => b.id));
  const buckets: DraftHabitBucketDiff[] = [];

  for (const bucket of working.buckets) {
    const before = canonicalBucketById.get(bucket.id);
    if (!before) {
      buckets.push({ bucket, status: "added", changedFields: [] });
      continue;
    }
    const changedFields: string[] = [];
    if (bucket.name !== before.name) changedFields.push("renamed");
    if ((bucket.color ?? null) !== (before.color ?? null)) {
      changedFields.push("color");
    }
    buckets.push({
      bucket,
      status: changedFields.length > 0 ? "modified" : "unchanged",
      changedFields,
    });
  }
  for (const bucket of canonical.buckets) {
    if (workingBucketIds.has(bucket.id)) continue;
    buckets.push({ bucket, status: "deleted", changedFields: [] });
  }

  const canonicalById = new Map(canonical.habits.map((h) => [h.id, h]));
  const workingIds = new Set(working.habits.map((h) => h.id));
  const habits: DraftHabitDiff[] = [];

  for (const habit of working.habits) {
    const before = canonicalById.get(habit.id);
    if (!before) {
      habits.push({
        habit,
        status: "added",
        changedFields: [],
        items: habit.itemPlannerIds.map((plannerId) => ({
          plannerId,
          status: "added",
        })),
      });
      continue;
    }
    const changedFields: string[] = [];
    if (habit.name !== before.name) changedFields.push("renamed");
    if ((habit.color ?? null) !== (before.color ?? null)) {
      changedFields.push("color");
    }
    if ((habit.bucketId ?? null) !== (before.bucketId ?? null)) {
      changedFields.push("bucket");
    }
    const beforeItems = new Set(before.itemPlannerIds);
    const afterItems = new Set(habit.itemPlannerIds);
    const items: DraftHabitItemDiff[] = [
      ...habit.itemPlannerIds.map((plannerId) => ({
        plannerId,
        status: beforeItems.has(plannerId)
          ? ("unchanged" as const)
          : ("added" as const),
      })),
      ...before.itemPlannerIds
        .filter((plannerId) => !afterItems.has(plannerId))
        .map((plannerId) => ({ plannerId, status: "deleted" as const })),
    ];
    const itemsChanged = items.some((i) => i.status !== "unchanged");
    habits.push({
      habit,
      status:
        changedFields.length > 0 || itemsChanged ? "modified" : "unchanged",
      changedFields,
      items,
    });
  }

  for (const habit of canonical.habits) {
    if (workingIds.has(habit.id)) continue;
    habits.push({
      habit,
      status: "deleted",
      changedFields: [],
      items: habit.itemPlannerIds.map((plannerId) => ({
        plannerId,
        status: "deleted",
      })),
    });
  }

  return { buckets, habits };
}

export function countHabitChanges(diff: DraftHabitsDiff): number {
  return (
    diff.buckets.filter((b) => b.status !== "unchanged").length +
    diff.habits.filter((d) => d.status !== "unchanged").length
  );
}
