"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/client";

// Admin-only surface over FeedbackReport rows. The inspector renders the
// stored snapshot blob client-side; nothing here ever hydrates the admin's
// own Redux state.

export interface FeedbackReportSummary {
  id: string;
  message: string;
  createdAt: string;
  hasSnapshot: boolean;
  userName: string | null;
  userEmail: string | null;
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function listFeedbackReports(): Promise<FeedbackReportSummary[]> {
  await requireAdmin();

  const [rows, withSnapshot] = await Promise.all([
    db.feedbackReport.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        message: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    // Snapshot blobs are large — never select them for the list; resolve
    // presence with a second id-only query instead.
    db.feedbackReport.findMany({
      where: { dataSnapshot: { not: Prisma.AnyNull } },
      select: { id: true },
    }),
  ]);

  const snapshotIds = new Set(withSnapshot.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    createdAt: row.createdAt,
    hasSnapshot: snapshotIds.has(row.id),
    userName: row.user.name,
    userEmail: row.user.email,
  }));
}

export async function getFeedbackReportSnapshot(
  id: string,
): Promise<Record<string, unknown> | null> {
  await requireAdmin();

  const row = await db.feedbackReport.findUnique({
    where: { id },
    select: { dataSnapshot: true },
  });
  if (!row?.dataSnapshot || typeof row.dataSnapshot !== "object") return null;
  return row.dataSnapshot as Record<string, unknown>;
}

// GDPR hygiene: drop just the snapshot once a report is resolved, keeping the
// message thread for reference.
export async function clearFeedbackSnapshot(id: string): Promise<void> {
  await requireAdmin();

  await db.feedbackReport.update({
    where: { id },
    data: { dataSnapshot: Prisma.DbNull },
  });
}

export async function deleteFeedbackReport(id: string): Promise<void> {
  await requireAdmin();

  await db.feedbackReport.delete({ where: { id } });
}
