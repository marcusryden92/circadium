"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/client";

// AI-assistant chat history. Conversations are read and written wholesale
// (the messages Json column is the entire ordered array) and are NOT part of
// the calendar diff sync — no OCC, no dataVersion.

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_TOOL_NOTE_CHARS = 1_000;
const MAX_TITLE_CHARS = 80;
const MAX_ID_CHARS = 64;

export interface DraftConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  // App-authored ledger of the tools that actually ran in an assistant turn;
  // fed back to the model with the prose so later turns see ground truth.
  toolNote?: string;
}

export interface DraftConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DraftConversationPayload extends DraftConversationSummary {
  messages: DraftConversationMessage[];
}

// The Json column is schemaless by design — a lenient reader means a future
// message-shape change needs no migration, just a wider parser here.
function sanitizeMessages(raw: unknown): DraftConversationMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: DraftConversationMessage[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, role, content, toolNote } = entry as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) continue;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || content.trim().length === 0) continue;
    messages.push({
      id,
      role,
      content: content.slice(0, MAX_MESSAGE_CHARS),
      ...(typeof toolNote === "string" && toolNote.trim().length > 0
        ? { toolNote: toolNote.slice(0, MAX_TOOL_NOTE_CHARS) }
        : {}),
    });
    if (messages.length >= MAX_MESSAGES) break;
  }
  return messages;
}

export async function listDraftConversations(): Promise<
  DraftConversationSummary[]
> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return db.draftConversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: MAX_CONVERSATIONS,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getDraftConversation(
  id: string,
): Promise<DraftConversationPayload> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const row = await db.draftConversation.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) throw new Error("Not Found");

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
    messages: sanitizeMessages(row.messages),
  };
}

export async function upsertDraftConversation(input: {
  id: string;
  title: string;
  messages: DraftConversationMessage[];
}): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (id.length === 0 || id.length > MAX_ID_CHARS) {
    throw new Error("Invalid conversation id");
  }
  const messages = sanitizeMessages(input.messages);
  if (messages.length === 0) throw new Error("Nothing to save");
  const title =
    (typeof input.title === "string" ? input.title.trim() : "").slice(
      0,
      MAX_TITLE_CHARS,
    ) || "Untitled";

  // The id is client-minted, so an upsert keyed on it must not be allowed to
  // update another user's row.
  const existing = await db.draftConversation.findUnique({ where: { id } });
  if (existing && existing.userId !== userId) {
    throw new Error("Not Found");
  }

  const now = new Date().toISOString();
  await db.draftConversation.upsert({
    where: { id },
    update: {
      title,
      messages: messages as unknown as Prisma.InputJsonValue,
      updatedAt: now,
    },
    create: {
      id,
      title,
      messages: messages as unknown as Prisma.InputJsonValue,
      userId,
      updatedAt: now,
    },
  });

  const overflow = await db.draftConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    skip: MAX_CONVERSATIONS,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await db.draftConversation.deleteMany({
      where: { userId, id: { in: overflow.map((c) => c.id) } },
    });
  }
}

export async function deleteDraftConversation(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.draftConversation.deleteMany({
    where: { id, userId: session.user.id },
  });
}
