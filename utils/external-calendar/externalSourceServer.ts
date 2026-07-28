// Server-only: db access. Shared by the external-calendar server actions
// (actions/externalCalendars.ts + actions/googleCalendar.ts), which cannot
// export sync helpers themselves ("use server" modules may only export async
// server functions).
import { db } from "@/lib/db";
import {
  ExternalCalendarKind,
  ExternalCalendarMode,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "@/types/prisma";
import {
  getGoogleAccessToken,
  getGoogleCalendarSummary,
  fetchGoogleCalendarEvents,
} from "./googleCalendarApi";
import {
  refreshMicrosoftTokens,
  getMicrosoftCalendarName,
  fetchMicrosoftCalendarEvents,
} from "./microsoftGraphApi";
import {
  EXTERNAL_EVENT_PAST_WINDOW_DAYS,
  EXTERNAL_EVENT_FUTURE_WINDOW_DAYS,
} from "./refreshPolicy";

type SourceRow = Awaited<
  ReturnType<typeof db.externalCalendarSource.findFirstOrThrow>
>;

export function serializeSource(row: SourceRow): ExternalCalendarSource {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastFetchedAt: row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null,
  };
}

export function expansionWindow(now: Date): {
  windowStart: Date;
  windowEnd: Date;
} {
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    windowStart: new Date(
      now.getTime() - EXTERNAL_EVENT_PAST_WINDOW_DAYS * dayMs,
    ),
    windowEnd: new Date(
      now.getTime() + EXTERNAL_EVENT_FUTURE_WINDOW_DAYS * dayMs,
    ),
  };
}

/**
 * Resolve a fresh Graph access token for the user's connection, persisting the
 * rotated refresh token Microsoft returns — the old one invalidates on a
 * rolling window, so skipping the write would strand the grant.
 */
export async function getMicrosoftAccessTokenForUser(
  userId: string,
): Promise<string> {
  const connection = await db.microsoftCalendarConnection.findUnique({
    where: { userId },
  });
  if (!connection) {
    throw new Error(
      "Microsoft account disconnected — reconnect it under Connected calendars",
    );
  }
  const { accessToken, refreshToken } = await refreshMicrosoftTokens(
    connection.refreshToken,
  );
  if (refreshToken !== connection.refreshToken) {
    await db.microsoftCalendarConnection.update({
      where: { userId },
      data: { refreshToken },
    });
  }
  return accessToken;
}

/**
 * Create a MICROSOFT-kind source for a calendar the connected account can
 * read: verifies access by fetching the window's events first (the source id
 * is minted ahead so the deterministic event ids can reference it), then
 * writes source + events in one transaction. Throws on any Graph failure.
 */
export async function createMicrosoftCalendarSource(args: {
  userId: string;
  calendarId: string;
  name?: string;
  color?: string | null;
  mode?: ExternalCalendarMode;
}): Promise<{ source: ExternalCalendarSource; events: ExternalEvent[] }> {
  const { userId, calendarId } = args;

  const existing = await db.externalCalendarSource.findFirst({
    where: { userId, kind: ExternalCalendarKind.MICROSOFT, url: calendarId },
  });
  if (existing) {
    throw new Error(`"${existing.name}" is already connected`);
  }

  const accessToken = await getMicrosoftAccessTokenForUser(userId);
  const now = new Date();
  const { windowStart, windowEnd } = expansionWindow(now);
  const sourceId = crypto.randomUUID();

  const events = await fetchMicrosoftCalendarEvents({
    accessToken,
    calendarId,
    sourceId,
    userId,
    windowStart,
    windowEnd,
  });
  const name =
    args.name?.trim() ||
    (await getMicrosoftCalendarName(accessToken, calendarId)) ||
    calendarId;

  const [source] = await db.$transaction([
    db.externalCalendarSource.create({
      data: {
        id: sourceId,
        userId,
        kind: ExternalCalendarKind.MICROSOFT,
        url: calendarId,
        name,
        color: args.color ?? null,
        mode: args.mode ?? ExternalCalendarMode.BUSY,
        lastFetchedAt: now,
      },
    }),
    db.externalEvent.createMany({ data: events }),
  ]);

  return { source: serializeSource(source), events };
}

/**
 * Create a GOOGLE-kind source for a calendar the connected account can read:
 * verifies access by fetching the window's events first (the source id is
 * minted ahead so the deterministic event ids can reference it), then writes
 * source + events in one transaction. Throws on any Google failure.
 */
export async function createGoogleCalendarSource(args: {
  userId: string;
  refreshToken: string;
  calendarId: string;
  name?: string;
  color?: string | null;
  mode?: ExternalCalendarMode;
}): Promise<{ source: ExternalCalendarSource; events: ExternalEvent[] }> {
  const { userId, refreshToken, calendarId } = args;

  const existing = await db.externalCalendarSource.findFirst({
    where: { userId, kind: ExternalCalendarKind.GOOGLE, url: calendarId },
  });
  if (existing) {
    throw new Error(`"${existing.name}" is already connected`);
  }

  const accessToken = await getGoogleAccessToken(refreshToken);
  const now = new Date();
  const { windowStart, windowEnd } = expansionWindow(now);
  const sourceId = crypto.randomUUID();

  const events = await fetchGoogleCalendarEvents({
    accessToken,
    calendarId,
    sourceId,
    userId,
    windowStart,
    windowEnd,
  });
  const name =
    args.name?.trim() ||
    (await getGoogleCalendarSummary(accessToken, calendarId)) ||
    calendarId;

  const [source] = await db.$transaction([
    db.externalCalendarSource.create({
      data: {
        id: sourceId,
        userId,
        kind: ExternalCalendarKind.GOOGLE,
        url: calendarId,
        name,
        color: args.color ?? null,
        mode: args.mode ?? ExternalCalendarMode.BUSY,
        lastFetchedAt: now,
      },
    }),
    db.externalEvent.createMany({ data: events }),
  ]);

  return { source: serializeSource(source), events };
}
