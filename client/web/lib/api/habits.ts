import type { Habit, HabitBucket, HabitItem } from "@circadium/shared/contracts";
import type { HabitChangeSet } from "@circadium/shared/draft/applyDraftHabits";
import { apiRequest } from "@/lib/api/client";

// Habit trackers on the Java API: buckets, habits, tracked-item links and the
// assistant's batched delta. Outside the OCC diff sync — nothing here bumps
// dataVersion; results mirror wholesale into the habits slice.

export interface HabitData {
  buckets: HabitBucket[];
  habits: Habit[];
  items: HabitItem[];
}

// The wire's tri-state field: the delta builder distinguishes "leave the
// field alone" (absent) from "set it to null", which plain JSON nullability
// cannot carry — so the wire says it outright.
type PatchField = { set: true; value: string | null } | null;

function patch(value: string | null | undefined): PatchField {
  return value === undefined ? null : { set: true, value: value ?? null };
}

export function getHabitData(): Promise<HabitData> {
  return apiRequest<HabitData>("/habits", { authenticated: true });
}

export function createHabitBucket(input: {
  name: string;
  color?: string | null;
}): Promise<HabitBucket> {
  return apiRequest<HabitBucket>("/habits/buckets", {
    body: input,
    authenticated: true,
  });
}

export function updateHabitBucket(input: {
  bucketId: string;
  name: string;
  color?: string | null;
}): Promise<HabitBucket> {
  return apiRequest<HabitBucket>(
    `/habits/buckets/${encodeURIComponent(input.bucketId)}`,
    {
      method: "PATCH",
      body: { name: input.name, color: patch(input.color) },
      authenticated: true,
    },
  );
}

export function deleteHabitBucket(input: { bucketId: string }): Promise<void> {
  return apiRequest<void>(
    `/habits/buckets/${encodeURIComponent(input.bucketId)}`,
    { method: "DELETE", authenticated: true },
  );
}

export function createHabit(input: {
  name: string;
  color?: string | null;
  bucketId?: string | null;
}): Promise<Habit> {
  return apiRequest<Habit>("/habits", { body: input, authenticated: true });
}

export function deleteHabit(input: { habitId: string }): Promise<void> {
  return apiRequest<void>(`/habits/${encodeURIComponent(input.habitId)}`, {
    method: "DELETE",
    authenticated: true,
  });
}

export function addHabitItem(input: {
  habitId: string;
  plannerId: string;
}): Promise<HabitItem> {
  return apiRequest<HabitItem>(
    `/habits/${encodeURIComponent(input.habitId)}/items`,
    { method: "PUT", body: { plannerId: input.plannerId }, authenticated: true },
  );
}

export function removeHabitItem(input: {
  habitId: string;
  plannerId: string;
}): Promise<void> {
  const query = new URLSearchParams({ plannerId: input.plannerId }).toString();
  return apiRequest<void>(
    `/habits/${encodeURIComponent(input.habitId)}/items?${query}`,
    { method: "DELETE", authenticated: true },
  );
}

export function applyHabitChanges(changes: HabitChangeSet): Promise<HabitData> {
  return apiRequest<HabitData>("/habits/apply", {
    body: {
      bucketDeletes: changes.bucketDeletes,
      bucketCreates: changes.bucketCreates,
      bucketUpdates: changes.bucketUpdates.map((update) => ({
        id: update.id,
        name: patch(update.name),
        color: patch(update.color),
      })),
      deletes: changes.deletes,
      creates: changes.creates,
      updates: changes.updates.map((update) => ({
        id: update.id,
        name: patch(update.name),
        color: patch(update.color),
        bucketId: patch(update.bucketId),
      })),
      addItems: changes.addItems,
      removeItems: changes.removeItems,
    },
    authenticated: true,
  });
}
