"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { OccurrenceCompletion } from "@/types/prisma";

// Occurrence completion log: one row per completed occurrence of a recurring
// task/goal leaf, or per checked-off plan occurrence. Direct actions,
// deliberately OUTSIDE the OCC diff sync (the viewState / external-calendar
// pattern): logging a completion must never bump User.dataVersion or contend
// with the calendar transaction. One row per (plannerId, occurrenceKey) — the
// composite that also forms the occurrence event id
// `${plannerId}|${occurrenceKey}`.

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function getOccurrenceCompletions(): Promise<
  OccurrenceCompletion[]
> {
  const userId = await requireUserId();
  return db.occurrenceCompletion.findMany({ where: { userId } });
}

export async function logOccurrenceCompletion(input: {
  plannerId: string;
  occurrenceKey: string;
  start: string;
  end: string;
}): Promise<OccurrenceCompletion> {
  const userId = await requireUserId();
  // Scope the write to a planner row the caller owns.
  const planner = await db.planner.findFirst({
    where: { id: input.plannerId, userId },
    select: { id: true },
  });
  if (!planner) throw new Error("Item not found");

  const now = new Date().toISOString();
  return db.occurrenceCompletion.upsert({
    where: {
      plannerId_occurrenceKey: {
        plannerId: input.plannerId,
        occurrenceKey: input.occurrenceKey,
      },
    },
    create: {
      plannerId: input.plannerId,
      userId,
      occurrenceKey: input.occurrenceKey,
      start: input.start,
      end: input.end,
      createdAt: now,
    },
    update: { start: input.start, end: input.end },
  });
}

export async function unlogOccurrenceCompletion(input: {
  plannerId: string;
  occurrenceKey: string;
}): Promise<void> {
  const userId = await requireUserId();
  // deleteMany (not delete) so a missing row is a no-op, never a P2025.
  await db.occurrenceCompletion.deleteMany({
    where: {
      userId,
      plannerId: input.plannerId,
      occurrenceKey: input.occurrenceKey,
    },
  });
}
