"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  ExternalCalendarKind,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "@/types/prisma";
import {
  getGoogleAccessToken,
  listGoogleCalendarList,
  revokeGoogleToken,
  type GoogleCalendarListEntry,
} from "@/utils/external-calendar/googleCalendarApi";
import { createGoogleCalendarSource } from "@/utils/external-calendar/externalSourceServer";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function getGoogleCalendarStatus(): Promise<
  { connected: true; email: string | null } | { connected: false }
> {
  try {
    const userId = await requireUserId();
    const connection = await db.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (!connection) return { connected: false };
    return { connected: true, email: connection.email };
  } catch {
    return { connected: false };
  }
}

export async function listGoogleCalendars(): Promise<
  | { success: true; calendars: GoogleCalendarListEntry[] }
  | { success: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const connection = await db.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      return { success: false, error: "Google account not connected" };
    }
    const accessToken = await getGoogleAccessToken(connection.refreshToken);
    const calendars = await listGoogleCalendarList(accessToken);
    return { success: true, calendars };
  } catch (error) {
    console.error("Failed to list Google calendars:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to list calendars",
    };
  }
}

export async function addGoogleCalendarSource(input: {
  calendarId: string;
  name?: string;
  color?: string | null;
}): Promise<
  | { success: true; source: ExternalCalendarSource; events: ExternalEvent[] }
  | { success: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const connection = await db.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      return { success: false, error: "Google account not connected" };
    }
    const created = await createGoogleCalendarSource({
      userId,
      refreshToken: connection.refreshToken,
      calendarId: input.calendarId,
      name: input.name,
      color: input.color,
    });
    return { success: true, ...created };
  } catch (error) {
    console.error("Failed to add Google calendar:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to add the calendar",
    };
  }
}

export async function disconnectGoogleCalendar(): Promise<
  | { success: true; removedSourceIds: string[]; revoked: boolean }
  | { success: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const connection = await db.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (!connection)
      return { success: true, removedSourceIds: [], revoked: true };

    const revoked = await revokeGoogleToken(connection.refreshToken);
    const sources = await db.externalCalendarSource.findMany({
      where: { userId, kind: ExternalCalendarKind.GOOGLE },
      select: { id: true },
    });
    // API-backed sources can't refresh without the grant; they go with it
    // (events cascade with each source row).
    await db.$transaction([
      db.externalCalendarSource.deleteMany({
        where: { userId, kind: ExternalCalendarKind.GOOGLE },
      }),
      db.googleCalendarConnection.delete({ where: { userId } }),
    ]);
    return { success: true, removedSourceIds: sources.map((s) => s.id), revoked };
  } catch (error) {
    console.error("Failed to disconnect Google Calendar:", error);
    return { success: false, error: "Failed to disconnect" };
  }
}
