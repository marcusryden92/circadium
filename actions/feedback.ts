"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sendFeedbackEmail } from "@/lib/mail";
import { exportUserData } from "@/actions/dataExport";
import { FeedbackMessageSchema, SuggestionSchema } from "@/schemas";
import type { Prisma } from "@/generated/client";

// Support messages + the suggestion wall. Direct actions, entirely outside
// the OCC diff sync — nothing here touches calendar data or dataVersion.

const MAX_SUGGESTIONS_PER_USER = 25;
const MAX_SUGGESTIONS_LISTED = 300;

export interface SuggestionView {
  id: string;
  title: string;
  body: string | null;
  authorName: string;
  isMine: boolean;
  score: number;
  upvotes: number;
  downvotes: number;
  myVote: number;
  createdAt: string;
}

export async function sendSupportMessage(input: {
  message: string;
  includeSnapshot: boolean;
}): Promise<{ reportId: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const parsed = FeedbackMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid message");
  }
  const { message, includeSnapshot } = parsed.data;

  let snapshot: Prisma.InputJsonValue | undefined;
  if (includeSnapshot) {
    const result = await exportUserData();
    if (!result.success) {
      throw new Error(
        "Could not capture your data snapshot — try again, or send without it.",
      );
    }
    snapshot = result.data as Prisma.InputJsonValue;
  }

  const report = await db.feedbackReport.create({
    data: { message, userId, ...(snapshot ? { dataSnapshot: snapshot } : {}) },
    select: { id: true },
  });

  // The report row is the source of truth; a failed notification email must
  // not fail the action (the admin view lists every report regardless).
  try {
    await sendFeedbackEmail({
      reportId: report.id,
      userName: session.user.name ?? null,
      userEmail: session.user.email ?? "unknown",
      message,
      hasSnapshot: includeSnapshot,
    });
  } catch (error) {
    console.error("Failed to send feedback notification email:", error);
  }

  return { reportId: report.id };
}

function toSuggestionView(
  row: {
    id: string;
    title: string;
    body: string | null;
    userId: string;
    createdAt: string;
    user: { name: string | null };
    votes: { userId: string; value: number }[];
  },
  currentUserId: string,
): SuggestionView {
  let upvotes = 0;
  let downvotes = 0;
  let myVote = 0;
  for (const vote of row.votes) {
    if (vote.value > 0) upvotes += 1;
    else if (vote.value < 0) downvotes += 1;
    if (vote.userId === currentUserId) myVote = Math.sign(vote.value);
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    authorName: row.user.name ?? "Anonymous",
    isMine: row.userId === currentUserId,
    score: upvotes - downvotes,
    upvotes,
    downvotes,
    myVote,
    createdAt: row.createdAt,
  };
}

const suggestionInclude = {
  user: { select: { name: true } },
  votes: { select: { userId: true, value: true } },
} as const;

export async function getSuggestions(): Promise<SuggestionView[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const rows = await db.suggestion.findMany({
    include: suggestionInclude,
    orderBy: { createdAt: "desc" },
    take: MAX_SUGGESTIONS_LISTED,
  });

  return rows.map((row) => toSuggestionView(row, userId));
}

export async function createSuggestion(input: {
  title: string;
  body?: string;
}): Promise<SuggestionView> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const parsed = SuggestionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid suggestion");
  }

  const existing = await db.suggestion.count({ where: { userId } });
  if (existing >= MAX_SUGGESTIONS_PER_USER) {
    throw new Error(
      "You have reached the suggestion limit — delete one of yours to post a new one.",
    );
  }

  const row = await db.suggestion.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body || null,
      userId,
      votes: { create: { userId, value: 1 } },
    },
    include: suggestionInclude,
  });

  return toSuggestionView(row, userId);
}

export async function voteSuggestion(
  suggestionId: string,
  value: 1 | -1 | 0,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  if (value !== 1 && value !== -1 && value !== 0) {
    throw new Error("Invalid vote");
  }

  if (value === 0) {
    await db.suggestionVote.deleteMany({ where: { suggestionId, userId } });
    return;
  }

  await db.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    update: { value },
    create: { suggestionId, userId, value },
  });
}

export async function deleteSuggestion(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const where =
    session.user.role === "ADMIN" ? { id } : { id, userId: session.user.id };
  await db.suggestion.deleteMany({ where });
}
