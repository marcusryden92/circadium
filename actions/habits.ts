"use server";

import { v4 as uuidv4 } from "uuid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { parsePlanRecurrence } from "@/utils/planRecurrence";
import type { Habit, HabitBucket, HabitItem } from "@/types/prisma";

// Habit trackers: direct actions OUTSIDE the OCC diff sync (viewState /
// occurrence-completion pattern). Results are mirrored wholesale into the
// habits Redux slice; the engine never reads any of this, so a habit edit
// never triggers a regen or bumps User.dataVersion.
//
// Buckets are the habits surface's own grouping — a separate entity from the
// item Category tree, deliberately.

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

async function validBucketId(
  userId: string,
  bucketId: string | null | undefined,
): Promise<string | null> {
  if (!bucketId) return null;
  const bucket = await db.habitBucket.findFirst({
    where: { id: bucketId, userId },
    select: { id: true },
  });
  return bucket ? bucketId : null;
}

// Only repeating items feed a habit: a top-level row whose recurrence parses
// (flexible rule on a task/goal, occurrence rule on a plan).
function plannerIsTrackable(planner: {
  parentId: string | null;
  recurrence: string | null;
}): boolean {
  return !planner.parentId && parsePlanRecurrence(planner.recurrence) !== null;
}

async function fetchHabitState(userId: string): Promise<{
  buckets: HabitBucket[];
  habits: Habit[];
  items: HabitItem[];
}> {
  const [buckets, habits, items] = await Promise.all([
    db.habitBucket.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.habit.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.habitItem.findMany({ where: { userId } }),
  ]);
  return { buckets, habits, items };
}

export async function getHabitData(): Promise<{
  buckets: HabitBucket[];
  habits: Habit[];
  items: HabitItem[];
}> {
  return fetchHabitState(await requireUserId());
}

export async function createHabitBucket(input: {
  name: string;
  color?: string | null;
}): Promise<HabitBucket> {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) throw new Error("Bucket name is required");
  const now = new Date().toISOString();
  const last = await db.habitBucket.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return db.habitBucket.create({
    data: {
      id: uuidv4(),
      userId,
      name,
      color: input.color ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function updateHabitBucket(input: {
  bucketId: string;
  name?: string;
  color?: string | null;
  sortOrder?: number;
}): Promise<HabitBucket> {
  const userId = await requireUserId();
  const existing = await db.habitBucket.findFirst({
    where: { id: input.bucketId, userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Bucket not found");

  const data: {
    name?: string;
    color?: string | null;
    sortOrder?: number;
    updatedAt: string;
  } = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Bucket name is required");
    data.name = name;
  }
  if (input.color !== undefined) data.color = input.color;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  return db.habitBucket.update({ where: { id: input.bucketId }, data });
}

// Habits in the bucket survive as unsorted (bucketId SetNull).
export async function deleteHabitBucket(input: {
  bucketId: string;
}): Promise<void> {
  const userId = await requireUserId();
  await db.habitBucket.deleteMany({ where: { id: input.bucketId, userId } });
}

export async function createHabit(input: {
  name: string;
  color?: string | null;
  bucketId?: string | null;
}): Promise<Habit> {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) throw new Error("Habit name is required");
  const now = new Date().toISOString();
  return db.habit.create({
    data: {
      id: uuidv4(),
      userId,
      name,
      color: input.color ?? null,
      bucketId: await validBucketId(userId, input.bucketId),
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function updateHabit(input: {
  habitId: string;
  name?: string;
  color?: string | null;
  bucketId?: string | null;
  sortOrder?: number;
}): Promise<Habit> {
  const userId = await requireUserId();
  const existing = await db.habit.findFirst({
    where: { id: input.habitId, userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Habit not found");

  const data: {
    name?: string;
    color?: string | null;
    bucketId?: string | null;
    sortOrder?: number;
    updatedAt: string;
  } = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Habit name is required");
    data.name = name;
  }
  if (input.color !== undefined) data.color = input.color;
  if (input.bucketId !== undefined) {
    data.bucketId = await validBucketId(userId, input.bucketId);
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  return db.habit.update({ where: { id: input.habitId }, data });
}

export async function deleteHabit(input: { habitId: string }): Promise<void> {
  const userId = await requireUserId();
  // deleteMany scoped by userId so a foreign id is a no-op, never a P2025.
  await db.habit.deleteMany({ where: { id: input.habitId, userId } });
}

export async function addHabitItem(input: {
  habitId: string;
  plannerId: string;
}): Promise<HabitItem> {
  const userId = await requireUserId();
  const [habit, planner] = await Promise.all([
    db.habit.findFirst({
      where: { id: input.habitId, userId },
      select: { id: true },
    }),
    db.planner.findFirst({
      where: { id: input.plannerId, userId },
      select: { id: true, parentId: true, recurrence: true },
    }),
  ]);
  if (!habit) throw new Error("Habit not found");
  if (!planner) throw new Error("Item not found");
  if (!plannerIsTrackable(planner)) {
    throw new Error("Only repeating items can feed a habit");
  }

  const existing = await db.habitItem.findUnique({
    where: {
      habitId_plannerId: {
        habitId: input.habitId,
        plannerId: input.plannerId,
      },
    },
  });
  if (existing) return existing;

  return db.habitItem.create({
    data: {
      id: uuidv4(),
      habitId: input.habitId,
      plannerId: input.plannerId,
      userId,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function removeHabitItem(input: {
  habitId: string;
  plannerId: string;
}): Promise<void> {
  const userId = await requireUserId();
  await db.habitItem.deleteMany({
    where: {
      userId,
      habitId: input.habitId,
      plannerId: input.plannerId,
    },
  });
}

// Batch apply for the AI assistant's habit deltas (see
// utils/draft/applyDraftHabits.ts for the delta semantics). One transaction,
// every reference scoped to the caller; unknown ids are skipped rather than
// failing the batch, matching the concurrent-safety rules the delta was built
// under. Returns the fresh full state for a wholesale slice mirror.
export async function applyHabitChanges(changes: {
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
}): Promise<{ buckets: HabitBucket[]; habits: Habit[]; items: HabitItem[] }> {
  const userId = await requireUserId();
  const now = new Date().toISOString();

  await db.$transaction(async (tx) => {
    if (changes.bucketDeletes.length > 0) {
      await tx.habitBucket.deleteMany({
        where: { userId, id: { in: changes.bucketDeletes } },
      });
    }

    if (changes.bucketCreates.length > 0) {
      const last = await tx.habitBucket.findFirst({
        where: { userId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      let nextOrder = (last?.sortOrder ?? -1) + 1;
      for (const create of changes.bucketCreates) {
        const name = create.name.trim();
        if (!name) continue;
        await tx.habitBucket.create({
          data: {
            id: create.id,
            userId,
            name,
            color: create.color,
            sortOrder: nextOrder++,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    }

    for (const update of changes.bucketUpdates) {
      const existing = await tx.habitBucket.findFirst({
        where: { id: update.id, userId },
        select: { id: true },
      });
      if (!existing) continue;
      const data: {
        name?: string;
        color?: string | null;
        updatedAt: string;
      } = { updatedAt: now };
      if (update.name !== undefined) {
        const name = update.name.trim();
        if (name) data.name = name;
      }
      if (update.color !== undefined) data.color = update.color;
      await tx.habitBucket.update({ where: { id: update.id }, data });
    }

    if (changes.deletes.length > 0) {
      await tx.habit.deleteMany({
        where: { userId, id: { in: changes.deletes } },
      });
    }

    const resolveBucketId = async (
      bucketId: string | null | undefined,
    ): Promise<string | null> => {
      if (!bucketId) return null;
      const bucket = await tx.habitBucket.findFirst({
        where: { id: bucketId, userId },
        select: { id: true },
      });
      return bucket ? bucketId : null;
    };

    for (const create of changes.creates) {
      const name = create.name.trim();
      if (!name) continue;
      await tx.habit.create({
        data: {
          id: create.id,
          userId,
          name,
          color: create.color,
          bucketId: await resolveBucketId(create.bucketId),
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    for (const update of changes.updates) {
      const existing = await tx.habit.findFirst({
        where: { id: update.id, userId },
        select: { id: true },
      });
      if (!existing) continue;
      const data: {
        name?: string;
        color?: string | null;
        bucketId?: string | null;
        updatedAt: string;
      } = { updatedAt: now };
      if (update.name !== undefined) {
        const name = update.name.trim();
        if (name) data.name = name;
      }
      if (update.color !== undefined) data.color = update.color;
      if (update.bucketId !== undefined) {
        data.bucketId = await resolveBucketId(update.bucketId);
      }
      await tx.habit.update({ where: { id: update.id }, data });
    }

    const wantedLinks = [
      ...changes.addItems,
      ...changes.creates.flatMap((c) =>
        c.itemPlannerIds.map((plannerId) => ({ habitId: c.id, plannerId })),
      ),
    ];
    if (wantedLinks.length > 0) {
      const habitIds = [...new Set(wantedLinks.map((l) => l.habitId))];
      const plannerIds = [...new Set(wantedLinks.map((l) => l.plannerId))];
      const ownedHabits = new Set(
        (
          await tx.habit.findMany({
            where: { userId, id: { in: habitIds } },
            select: { id: true },
          })
        ).map((h) => h.id),
      );
      const trackablePlanners = new Set(
        (
          await tx.planner.findMany({
            where: { userId, id: { in: plannerIds } },
            select: { id: true, parentId: true, recurrence: true },
          })
        )
          .filter(plannerIsTrackable)
          .map((p) => p.id),
      );
      const rows = wantedLinks
        .filter(
          (l) =>
            ownedHabits.has(l.habitId) && trackablePlanners.has(l.plannerId),
        )
        .map((l) => ({
          id: uuidv4(),
          habitId: l.habitId,
          plannerId: l.plannerId,
          userId,
          createdAt: now,
        }));
      if (rows.length > 0) {
        await tx.habitItem.createMany({ data: rows, skipDuplicates: true });
      }
    }

    for (const removal of changes.removeItems) {
      await tx.habitItem.deleteMany({
        where: {
          userId,
          habitId: removal.habitId,
          plannerId: removal.plannerId,
        },
      });
    }
  });

  return fetchHabitState(userId);
}
