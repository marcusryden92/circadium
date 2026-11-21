"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  ExternalCalendarKind,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "@/types/prisma";
import {
  listMicrosoftCalendars as graphListCalendars,
  type MicrosoftCalendarListEntry,
} from "@/utils/external-calendar/microsoftGraphApi";
import {
  getMicrosoftAccessTokenForUser,
  createMicrosoftCalendarSource,
} from "@/utils/external-calendar/externalSourceServer";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function getMicrosoftCalendarStatus(): Promise<
  { connected: true; email: string | null } | { connected: false }
> {
  try {
    const userId = await requireUserId();
    const connection = await db.microsoftCalendarConnection.findUnique({
      where: { userId },
    });
    if (!connection) return { connected: false };
    return { connected: true, email: connection.email };
  } catch {
    return { connected: false };
  }
}

export async function listMicrosoftCalendars(): Promise<
  | { success: true; calendars: MicrosoftCalendarListEntry[] }
  | { success: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const accessToken = await getMicrosoftAccessTokenForUser(userId);
    const calendars = await graphListCalendars(accessToken);
    return { success: true, calendars };
  } catch (error) {
    console.error("Failed to list Microsoft calendars:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to list calendars",
    };
  }
}

export async function addMicrosoftCalendarSource(input: {
  calendarId: string;
  name?: string;
  color?: string | null;
}): Promise<
  | { success: true; source: ExternalCalendarSource; events: ExternalEvent[] }
  | { success: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const created = await createMicrosoftCalendarSource({
      userId,
      calendarId: input.calendarId,
      name: input.name,
      color: input.color,
    });
    return { success: true, ...created };
  } catch (error) {
    console.error("Failed to add Microsoft calendar:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to add the calendar",
    };
  }
}

// Microsoft exposes no revoke endpoint for consumer grants: the local token
// copy is deleted (it ages out server-side), and the UI points the user at
// their Microsoft account's app permissions for a hard revoke.
export async function disconnectMicrosoftCalendar(): Promise<
  | { success: true; removedSourceIds: string[] }
  | { success: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const connection = await db.microsoftCalendarConnection.findUnique({
      where: { userId },
    });
    if (!connection) return { success: true, removedSourceIds: [] };

    const sources = await db.externalCalendarSource.findMany({
      where: { userId, kind: ExternalCalendarKind.MICROSOFT },
      select: { id: true },
    });
    // API-backed sources can't refresh without the grant; they go with it
    // (events cascade with each source row).
    await db.$transaction([
      db.externalCalendarSource.deleteMany({
        where: { userId, kind: ExternalCalendarKind.MICROSOFT },
      }),
      db.microsoftCalendarConnection.delete({ where: { userId } }),
    ]);
    return { success: true, removedSourceIds: sources.map((s) => s.id) };
  } catch (error) {
    console.error("Failed to disconnect Microsoft Calendar:", error);
    return { success: false, error: "Failed to disconnect" };
  }
}
