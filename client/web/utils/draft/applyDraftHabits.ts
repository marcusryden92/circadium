import type { Habit, HabitBucket, HabitItem, Planner } from "@/types/prisma";
import { parsePlanRecurrence } from "@/utils/planRecurrence";
import type { DraftHabit, DraftHabitsState } from "./draftHabits";

// Save-time habit apply. Habits live OUTSIDE the OCC diff sync (direct
// actions), so the assistant's changes are expressed as a delta the server
// replays — not a wholesale array the sync diffs. Semantics mirror
// applyDraftPrecedence's concurrent-safety rules:
// - deletes: only buckets/habits that STILL exist (one deleted concurrently
//   stays deleted; nothing is resurrected)
// - creates: engine-minted uuids become the DB ids (queue precedent) for both
//   buckets and habits; item references to draft planner ids are remapped
//   through nodeIdMap — an unmapped draft id (a proposal that was never
//   saved) is dropped
// - updates: per-field deltas, only where the assistant actually changed the
//   field vs canonical, so concurrent edits elsewhere win on untouched fields
// - item adds/removes: set deltas per habit; a tracked item removed
//   concurrently stays removed, and concurrent additions are preserved
// - items must resolve to top-level REPEATING rows in the SAVED planner —
//   habits count occurrences, so a non-repeating reference is dropped
export interface HabitChangeSet {
  bucketDeletes: string[];
  bucketCreates: { id: string; name: string; color: string | null }[];
  bucketUpdates: { id: string; name?: string; color?: string | null }[];
  deletes: string[];
  creates: {
    id: string;
    name: string;
    color: string | null;
    bucketId: string | null;
    itemPlannerIds: string[];
  }[];
  updates: {
    id: string;
    name?: string;
    color?: string | null;
    bucketId?: string | null;
  }[];
  addItems: { habitId: string; plannerId: string }[];
  removeItems: { habitId: string; plannerId: string }[];
}

function changeSetEmpty(changes: HabitChangeSet): boolean {
  return (
    changes.bucketDeletes.length === 0 &&
    changes.bucketCreates.length === 0 &&
    changes.bucketUpdates.length === 0 &&
    changes.deletes.length === 0 &&
    changes.creates.length === 0 &&
    changes.updates.length === 0 &&
    changes.addItems.length === 0 &&
    changes.removeItems.length === 0
  );
}

export function buildHabitChangeSet({
  canonical,
  working,
  currentBuckets,
  currentHabits,
  currentItems,
  nextPlanner,
  nodeIdMap,
}: {
  canonical: DraftHabitsState;
  working: DraftHabitsState;
  currentBuckets: HabitBucket[];
  currentHabits: Habit[];
  currentItems: HabitItem[];
  // The SAVED planner array (post forest-apply): item references must resolve
  // to a top-level repeating row in it.
  nextPlanner: Planner[];
  nodeIdMap: ReadonlyMap<string, string>;
}): HabitChangeSet | null {
  const canonicalBucketById = new Map(
    canonical.buckets.map((b) => [b.id, b]),
  );
  const workingBucketIds = new Set(working.buckets.map((b) => b.id));
  const currentBucketIds = new Set(currentBuckets.map((b) => b.id));
  const canonicalById = new Map(canonical.habits.map((h) => [h.id, h]));
  const workingIds = new Set(working.habits.map((h) => h.id));
  const currentIds = new Set(currentHabits.map((h) => h.id));
  const trackableRootIds = new Set(
    nextPlanner
      .filter(
        (p) =>
          !p.parentId &&
          p.isTriaged &&
          parsePlanRecurrence(p.recurrence) !== null,
      )
      .map((p) => p.id),
  );
  const currentItemKeys = new Set(
    currentItems.map((i) => `${i.habitId}|${i.plannerId}`),
  );

  const changes: HabitChangeSet = {
    bucketDeletes: [],
    bucketCreates: [],
    bucketUpdates: [],
    deletes: [],
    creates: [],
    updates: [],
    addItems: [],
    removeItems: [],
  };

  for (const bucket of canonical.buckets) {
    if (!workingBucketIds.has(bucket.id) && currentBucketIds.has(bucket.id)) {
      changes.bucketDeletes.push(bucket.id);
    }
  }
  const deletedBuckets = new Set(changes.bucketDeletes);
  const createdBuckets = new Set<string>();

  for (const bucket of working.buckets) {
    const before = canonicalBucketById.get(bucket.id);
    if (!before) {
      changes.bucketCreates.push({
        id: bucket.id,
        name: bucket.name,
        color: bucket.color,
      });
      createdBuckets.add(bucket.id);
      continue;
    }
    // A bucket deleted concurrently elsewhere is never resurrected by edits.
    if (!currentBucketIds.has(bucket.id)) continue;
    const update: HabitChangeSet["bucketUpdates"][number] = { id: bucket.id };
    let touched = false;
    if (bucket.name !== before.name) {
      update.name = bucket.name;
      touched = true;
    }
    if ((bucket.color ?? null) !== (before.color ?? null)) {
      update.color = bucket.color;
      touched = true;
    }
    if (touched) changes.bucketUpdates.push(update);
  }

  // A bucket reference is valid when it survives this save: an existing row
  // the assistant didn't delete, or one of its own creates.
  const validBucketId = (bucketId: string | null): string | null =>
    bucketId &&
    ((currentBucketIds.has(bucketId) && !deletedBuckets.has(bucketId)) ||
      createdBuckets.has(bucketId))
      ? bucketId
      : null;

  const remapItems = (habit: DraftHabit): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const rawId of habit.itemPlannerIds) {
      const mapped = nodeIdMap.get(rawId) ?? rawId;
      if (seen.has(mapped)) continue;
      if (!trackableRootIds.has(mapped)) continue;
      seen.add(mapped);
      out.push(mapped);
    }
    return out;
  };

  for (const habit of canonical.habits) {
    if (!workingIds.has(habit.id) && currentIds.has(habit.id)) {
      changes.deletes.push(habit.id);
    }
  }

  for (const habit of working.habits) {
    const before = canonicalById.get(habit.id);
    if (!before) {
      changes.creates.push({
        id: habit.id,
        name: habit.name,
        color: habit.color,
        bucketId: validBucketId(habit.bucketId),
        itemPlannerIds: remapItems(habit),
      });
      continue;
    }
    // A habit deleted concurrently elsewhere is never resurrected by edits.
    if (!currentIds.has(habit.id)) continue;

    const update: HabitChangeSet["updates"][number] = { id: habit.id };
    let touched = false;
    if (habit.name !== before.name) {
      update.name = habit.name;
      touched = true;
    }
    if ((habit.color ?? null) !== (before.color ?? null)) {
      update.color = habit.color;
      touched = true;
    }
    if ((habit.bucketId ?? null) !== (before.bucketId ?? null)) {
      update.bucketId = validBucketId(habit.bucketId);
      touched = true;
    }
    if (touched) changes.updates.push(update);

    const beforeItems = new Set(
      before.itemPlannerIds.map((id) => nodeIdMap.get(id) ?? id),
    );
    const afterItems = remapItems(habit);
    const afterSet = new Set(afterItems);
    for (const plannerId of afterItems) {
      if (beforeItems.has(plannerId)) continue;
      if (currentItemKeys.has(`${habit.id}|${plannerId}`)) continue;
      changes.addItems.push({ habitId: habit.id, plannerId });
    }
    for (const plannerId of beforeItems) {
      if (afterSet.has(plannerId)) continue;
      // Only remove links that actually exist right now.
      if (!currentItemKeys.has(`${habit.id}|${plannerId}`)) continue;
      changes.removeItems.push({ habitId: habit.id, plannerId });
    }
  }

  return changeSetEmpty(changes) ? null : changes;
}
