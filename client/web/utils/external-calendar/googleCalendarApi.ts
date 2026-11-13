// Server-only: Google Calendar API access on the user's offline grant.
// Import from server actions and API routes exclusively.
import type { ExternalEvent } from "@/types/prisma";

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPE =
  "openid email https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_calendar_oauth_state";

export function googleCallbackUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured");
  }
  return { clientId, clientSecret };
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = clientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; email: string | null }> {
  const { clientId, clientSecret } = clientCredentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }
  const data = (await response.json()) as {
    refresh_token?: string;
    id_token?: string;
  };
  if (!data.refresh_token) {
    throw new Error("Google did not return an offline grant");
  }
  return {
    refreshToken: data.refresh_token,
    email: emailFromIdToken(data.id_token),
  };
}

// Display-only claim; the token came straight from Google over TLS, so
// signature verification adds nothing here.
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string };
    return typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return null;
  }
}

export async function getGoogleAccessToken(
  refreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = clientCredentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 400 || response.status === 401
        ? "Google access was revoked — reconnect your Google account in Settings"
        : `Google token refresh failed (${response.status})`,
    );
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google returned no access token");
  return data.access_token;
}

// Best-effort: returns false if Google's grant couldn't be revoked (network
// failure or an already-invalid token), so the caller can tell the user to
// remove access from their Google account settings. The local token copy is
// deleted regardless.
export async function revokeGoogleToken(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`,
      { method: "POST" },
    );
    // A 400 for an already-revoked/expired token is a benign outcome: the
    // grant is gone either way.
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
  accessRole: string;
}

export async function listGoogleCalendarList(
  accessToken: string,
): Promise<GoogleCalendarListEntry[]> {
  const entries: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      minAccessRole: "freeBusyReader",
      maxResults: "250",
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await fetch(
      `${API_BASE}/users/me/calendarList?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new Error(`Google calendar list failed (${response.status})`);
    }
    const data = (await response.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        summaryOverride?: string;
        backgroundColor?: string;
        primary?: boolean;
        accessRole?: string;
      }>;
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      entries.push({
        id: item.id,
        summary: item.summaryOverride || item.summary || item.id,
        backgroundColor: item.backgroundColor ?? null,
        primary: !!item.primary,
        accessRole: item.accessRole ?? "reader",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return entries;
}

export async function getGoogleCalendarSummary(
  accessToken: string,
  calendarId: string,
): Promise<string | null> {
  const response = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { summary?: string };
  return data.summary ?? null;
}

// The raw shape of one item from events.list with singleEvents=true.
export interface GoogleApiEvent {
  id?: string;
  status?: string;
  summary?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/**
 * Map Google API event instances to ExternalEvent rows: deterministic ids
 * `${sourceId}|${uid}|${occurrenceStartISO}` where uid is the series id for
 * recurring instances (so one mode exception covers the whole series, like an
 * ICS UID), cancelled and out-of-window instances skipped. Free/busy-only
 * calendars omit titles; those render as "Busy".
 */
export function mapGoogleEventsToExternalEvents(
  items: GoogleApiEvent[],
  args: {
    sourceId: string;
    userId: string;
    windowStart: Date;
    windowEnd: Date;
  },
): ExternalEvent[] {
  const { sourceId, userId, windowStart, windowEnd } = args;
  const byId = new Map<string, ExternalEvent>();

  for (const item of items) {
    if (!item.id || item.status === "cancelled") continue;
    const allDay = !!item.start?.date;
    const startRaw = item.start?.dateTime ?? item.start?.date;
    const endRaw = item.end?.dateTime ?? item.end?.date;
    if (!startRaw) continue;
    const start = new Date(startRaw);
    if (isNaN(start.getTime())) continue;
    let end = endRaw ? new Date(endRaw) : null;
    if (!end || isNaN(end.getTime())) {
      end = allDay ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : start;
    }
    if (end.getTime() <= start.getTime()) continue;
    if (start >= windowEnd || end <= windowStart) continue;

    const uid = item.recurringEventId ?? item.id;
    const startIso = start.toISOString();
    const id = `${sourceId}|${uid}|${startIso}`;
    byId.set(id, {
      id,
      sourceId,
      userId,
      uid,
      title: item.summary || "Busy",
      start: startIso,
      end: end.toISOString(),
      allDay,
    });
  }

  return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchGoogleCalendarEvents(args: {
  accessToken: string;
  calendarId: string;
  sourceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
}): Promise<ExternalEvent[]> {
  const { accessToken, calendarId, sourceId, userId, windowStart, windowEnd } =
    args;
  const items: GoogleApiEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      maxResults: "2500",
      fields:
        "items(id,status,summary,recurringEventId,start,end),nextPageToken",
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await fetch(
      `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Google couldn't find that calendar for your account"
          : response.status === 403
            ? "Your Google account doesn't have access to that calendar"
            : `Google events fetch failed (${response.status})`,
      );
    }
    const data = (await response.json()) as {
      items?: GoogleApiEvent[];
      nextPageToken?: string;
    };
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return mapGoogleEventsToExternalEvents(items, {
    sourceId,
    userId,
    windowStart,
    windowEnd,
  });
}
