import { v4 as uuidv4 } from "uuid";
import type { DraftForest } from "./plannerForestToJson";
import type { DraftNode } from "./plannerTreeToJson";
import type {
  DraftHabit,
  DraftHabitBucket,
  DraftHabitsState,
} from "./draftHabits";

// Deterministic operations on the assistant's working habit-tracker state —
// the templates/windows mold: pure functions, engine-minted uuids that become
// the DB ids at Save, and each op's caller emits the full authoritative state.
// Buckets are validated against the WORKING bucket set (drafts included), so
// a habit can be filed into a bucket created earlier in the same turn.

export interface DraftHabitOpFailure {
  id: string | null;
  reason: string;
}

export interface DraftHabitOpsResult {
  state: DraftHabitsState;
  failures: DraftHabitOpFailure[];
}

function cloneState(state: DraftHabitsState): DraftHabitsState {
  return {
    buckets: state.buckets.map((b) => ({ ...b })),
    habits: state.habits.map((h) => ({
      ...h,
      itemPlannerIds: [...h.itemPlannerIds],
    })),
  };
}

// Tracked items must be top-level REPEATING rows — a habit counts occurrences,
// so there must be occurrences to count. Every root type carries its repeat
// rule in the draft contract now (plans included), so the contract check
// covers drafts and canonical rows alike; the canonical recurring-plan id set
// stays as a belt-and-braces fallback. Unknown or non-repeating ids fail loud
// so the model corrects them.
function resolveItemIds(
  raw: unknown,
  forest: DraftForest,
  recurringPlanIds: ReadonlySet<string>,
  failures: DraftHabitOpFailure[],
  habitLabel: string,
): string[] {
  const rootById = new Map<string, DraftNode>();
  for (const goal of forest.goals) {
    if (goal.id.length > 0) rootById.set(goal.id, goal);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of Array.isArray(raw) ? raw : []) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (seen.has(value)) continue;
    const root = rootById.get(value);
    if (!root) {
      failures.push({
        id: value,
        reason: `not a top-level item (habits track whole top-level items) — for ${habitLabel}`,
      });
      continue;
    }
    const repeats =
      (root.recurrence ?? null) !== null ||
      (root.plannerType === "plan" && recurringPlanIds.has(value));
    if (!repeats) {
      failures.push({
        id: value,
        reason: `"${root.title}" doesn't repeat — habits only track repeating items; give it a repeat rule first, then link it (for ${habitLabel})`,
      });
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function bucketIdSet(state: DraftHabitsState): Set<string> {
  return new Set(state.buckets.map((b) => b.id));
}

export function addDraftHabitBuckets(
  state: DraftHabitsState,
  rawBuckets: unknown[],
): DraftHabitOpsResult & { added: DraftHabitBucket[] } {
  const next = cloneState(state);
  const failures: DraftHabitOpFailure[] = [];
  const added: DraftHabitBucket[] = [];

  for (const raw of rawBuckets) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      failures.push({ id: null, reason: "a bucket needs a non-empty name" });
      continue;
    }
    const bucket: DraftHabitBucket = {
      id: uuidv4(),
      name,
      color:
        typeof b.color === "string" && b.color.length > 0 ? b.color : null,
    };
    next.buckets.push(bucket);
    added.push(bucket);
  }

  return { state: next, failures, added };
}

export interface DraftHabitBucketUpdate {
  id: string;
  name?: string;
  color?: string | null;
}

export function updateDraftHabitBuckets(
  state: DraftHabitsState,
  updates: DraftHabitBucketUpdate[],
): DraftHabitOpsResult {
  const next = cloneState(state);
  const failures: DraftHabitOpFailure[] = [];

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const bucket = next.buckets.find((b) => b.id === id);
    if (!bucket) {
      failures.push({ id: id || null, reason: "bucket not found" });
      continue;
    }
    if (update.name !== undefined) {
      const name = typeof update.name === "string" ? update.name.trim() : "";
      if (!name) {
        failures.push({ id, reason: "a bucket needs a non-empty name" });
        continue;
      }
      bucket.name = name;
    }
    if (update.color !== undefined) {
      bucket.color =
        typeof update.color === "string" && update.color.length > 0
          ? update.color
          : null;
    }
  }

  return { state: next, failures };
}

// Habits in a deleted bucket survive as unsorted (the DB SetNull mirrored).
export function deleteDraftHabitBuckets(
  state: DraftHabitsState,
  bucketIds: string[],
): DraftHabitOpsResult {
  const failures: DraftHabitOpFailure[] = [];
  const ids = new Set(bucketIds);
  const known = new Set(state.buckets.map((b) => b.id));
  for (const id of ids) {
    if (!known.has(id)) failures.push({ id, reason: "bucket not found" });
  }
  return {
    state: {
      buckets: state.buckets.filter((b) => !ids.has(b.id)),
      habits: state.habits.map((h) =>
        h.bucketId && ids.has(h.bucketId) ? { ...h, bucketId: null } : h,
      ),
    },
    failures,
  };
}

export function addDraftHabits(
  state: DraftHabitsState,
  rawHabits: unknown[],
  forest: DraftForest,
  recurringPlanIds: ReadonlySet<string>,
): DraftHabitOpsResult & { added: DraftHabit[] } {
  const next = cloneState(state);
  const failures: DraftHabitOpFailure[] = [];
  const added: DraftHabit[] = [];
  const buckets = bucketIdSet(next);

  for (const raw of rawHabits) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const name = typeof h.name === "string" ? h.name.trim() : "";
    if (!name) {
      failures.push({ id: null, reason: "a habit needs a non-empty name" });
      continue;
    }
    const bucketId =
      typeof h.bucketId === "string" && h.bucketId.length > 0
        ? h.bucketId
        : null;
    if (bucketId && !buckets.has(bucketId)) {
      failures.push({
        id: null,
        reason: `unknown bucketId for "${name}" — create the bucket first (add_habit_buckets)`,
      });
      continue;
    }
    const habit: DraftHabit = {
      id: uuidv4(),
      name,
      color:
        typeof h.color === "string" && h.color.length > 0 ? h.color : null,
      bucketId,
      itemPlannerIds: resolveItemIds(
        h.itemPlannerIds,
        forest,
        recurringPlanIds,
        failures,
        `"${name}"`,
      ),
    };
    next.habits.push(habit);
    added.push(habit);
  }

  return { state: next, failures, added };
}

export interface DraftHabitUpdate {
  id: string;
  name?: string;
  color?: string | null;
  bucketId?: string | null;
  // Full replacement of the tracked-item set when provided.
  itemPlannerIds?: string[];
}

export function updateDraftHabits(
  state: DraftHabitsState,
  updates: DraftHabitUpdate[],
  forest: DraftForest,
  recurringPlanIds: ReadonlySet<string>,
): DraftHabitOpsResult {
  const next = cloneState(state);
  const failures: DraftHabitOpFailure[] = [];
  const buckets = bucketIdSet(next);

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const habit = next.habits.find((h) => h.id === id);
    if (!habit) {
      failures.push({ id: id || null, reason: "habit not found" });
      continue;
    }
    if (update.name !== undefined) {
      const name = typeof update.name === "string" ? update.name.trim() : "";
      if (!name) {
        failures.push({ id, reason: "a habit needs a non-empty name" });
        continue;
      }
      habit.name = name;
    }
    if (update.color !== undefined) {
      habit.color =
        typeof update.color === "string" && update.color.length > 0
          ? update.color
          : null;
    }
    if (update.bucketId !== undefined) {
      if (update.bucketId !== null && !buckets.has(update.bucketId)) {
        failures.push({
          id,
          reason: "unknown bucketId — create the bucket first",
        });
        continue;
      }
      habit.bucketId = update.bucketId;
    }
    if (update.itemPlannerIds !== undefined) {
      habit.itemPlannerIds = resolveItemIds(
        update.itemPlannerIds,
        forest,
        recurringPlanIds,
        failures,
        `"${habit.name}"`,
      );
    }
  }

  return { state: next, failures };
}

export function deleteDraftHabits(
  state: DraftHabitsState,
  habitIds: string[],
): DraftHabitOpsResult {
  const failures: DraftHabitOpFailure[] = [];
  const ids = new Set(habitIds);
  const known = new Set(state.habits.map((h) => h.id));
  for (const id of ids) {
    if (!known.has(id)) failures.push({ id, reason: "habit not found" });
  }
  return {
    state: {
      buckets: state.buckets,
      habits: state.habits.filter((h) => !ids.has(h.id)),
    },
    failures,
  };
}

export function addDraftHabitItems(
  state: DraftHabitsState,
  args: { habitId: string; itemIds: string[] },
  forest: DraftForest,
  recurringPlanIds: ReadonlySet<string>,
): DraftHabitOpsResult {
  const next = cloneState(state);
  const failures: DraftHabitOpFailure[] = [];
  const habit = next.habits.find((h) => h.id === args.habitId);
  if (!habit) {
    return {
      state,
      failures: [{ id: args.habitId || null, reason: "habit not found" }],
    };
  }
  const resolved = resolveItemIds(
    args.itemIds,
    forest,
    recurringPlanIds,
    failures,
    `"${habit.name}"`,
  );
  for (const id of resolved) {
    if (!habit.itemPlannerIds.includes(id)) habit.itemPlannerIds.push(id);
  }
  return { state: next, failures };
}

export function removeDraftHabitItems(
  state: DraftHabitsState,
  args: { habitId: string; itemIds: string[] },
): DraftHabitOpsResult {
  const next = cloneState(state);
  const habit = next.habits.find((h) => h.id === args.habitId);
  if (!habit) {
    return {
      state,
      failures: [{ id: args.habitId || null, reason: "habit not found" }],
    };
  }
  const drop = new Set(args.itemIds);
  habit.itemPlannerIds = habit.itemPlannerIds.filter((id) => !drop.has(id));
  return { state: next, failures: [] };
}
