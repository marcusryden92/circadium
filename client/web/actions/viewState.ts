"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// Canvas view preferences (graph + mindmap), one row per user. Direct
// actions, deliberately outside the OCC diff sync: view tweaks must never
// bump dataVersion or contend with calendar transactions.

export type ViewStateKind = "graph" | "mindmap";

export async function getViewState(): Promise<{
  graph: string | null;
  mindmap: string | null;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const row = await db.userViewState.findUnique({
    where: { userId: session.user.id },
  });
  return { graph: row?.graph ?? null, mindmap: row?.mindmap ?? null };
}

export async function saveViewState(
  kind: ViewStateKind,
  state: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const data = kind === "graph" ? { graph: state } : { mindmap: state };
  await db.userViewState.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });
}
