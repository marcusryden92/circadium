// Server-only: Microsoft Graph calendar access on the user's offline grant.
// Import from server actions and API routes exclusively.
import type { ExternalEvent } from "@/types/prisma";

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const MICROSOFT_CALENDAR_SCOPE =
  "openid email offline_access https://graph.microsoft.com/Calendars.Read";

export const MICROSOFT_OAUTH_STATE_COOKIE = "microsoft_calendar_oauth_state";

export function microsoftCallbackUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/microsoft/callback`;
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials are not configured");
  }
  return { clientId, clientSecret };
}

export function microsoftAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = clientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_CALENDAR_SCOPE,
    prompt: "select_account",
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
      scope: MICROSOFT_CALENDAR_SCOPE,
    }),
  });
  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed (${response.status})`);
  }
  const data = (await response.json()) as {
    refresh_token?: string;
    id_token?: string;
  };
  if (!data.refresh_token) {
    throw new Error("Microsoft did not return an offline grant");
  }
  return {
    refreshToken: data.refresh_token,
    email: emailFromIdToken(data.id_token),
  };
}

// Display-only claim; the token came straight from Microsoft over TLS, so
// signature verification adds nothing here.
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string; preferred_username?: string };
    if (typeof decoded.email === "string") return decoded.email;
    return typeof decoded.preferred_username === "string"
      ? decoded.preferred_username
      : null;
  } catch {
    return null;
  }
}

/**
 * Microsoft rotates refresh tokens: the response carries a NEW refresh token
 * that invalidates the old one on a rolling window. The caller MUST persist
 * the returned refreshToken (see getMicrosoftAccessTokenPersisting).
 */
export async function refreshMicrosoftTokens(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { clientId, clientSecret } = clientCredentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      scope: MICROSOFT_CALENDAR_SCOPE,
    }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 400 || response.status === 401
        ? "Microsoft access was revoked — reconnect your Microsoft account in Settings"
        : `Microsoft token refresh failed (${response.status})`,
    );
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!data.access_token) {
    throw new Error("Microsoft returned no access token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
  };
}

export interface MicrosoftCalendarListEntry {
  id: string;
  name: string;
  hexColor: string | null;
  isDefault: boolean;
}

export async function listMicrosoftCalendars(
  accessToken: string,
): Promise<MicrosoftCalendarListEntry[]> {
  const entries: MicrosoftCalendarListEntry[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/me/calendars?$select=id,name,hexColor,isDefaultCalendar&$top=100`;
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Microsoft calendar list failed (${response.status})`);
    }
    const data = (await response.json()) as {
      value?: Array<{
        id?: string;
        name?: string;
        hexColor?: string;
        isDefaultCalendar?: boolean;
      }>;
      "@odata.nextLink"?: string;
    };
    for (const item of data.value ?? []) {
      if (!item.id) continue;
      entries.push({
        id: item.id,
        name: item.name || item.id,
        hexColor: item.hexColor?.startsWith("#") ? item.hexColor : null,
        isDefault: !!item.isDefaultCalendar,
      });
    }
    url = data["@odata.nextLink"];
  }
  return entries;
}

export async function getMicrosoftCalendarName(
  accessToken: string,
  calendarId: string,
): Promise<string | null> {
  const response = await fetch(
    `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}?$select=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { name?: string };
  return data.name ?? null;
}

// The raw shape of one item from calendarView (occurrences pre-expanded).
export interface GraphApiEvent {
  id?: string;
  subject?: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  seriesMasterId?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
}

// Graph returns "2026-07-28T10:00:00.0000000" — no offset, 7 fraction digits.
// Requests carry Prefer: outlook.timezone="UTC", so an offset-less value is a
// UTC instant; the fraction is trimmed to the 3 digits Date reliably parses.
function parseGraphDateTime(value: string | undefined): Date | null {
  if (!value) return null;
  let normalized = value;
  const offsetless = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/,
  );
  if (offsetless) {
    const fraction = (offsetless[2] ?? "").padEnd(3, "0").slice(0, 3);
    normalized = `${offsetless[1]}.${fraction}Z`;
  }
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Map Graph calendarView instances to ExternalEvent rows: deterministic ids
 * `${sourceId}|${uid}|${occurrenceStartISO}` where uid is the series master id
 * for recurring instances (so one mode exception covers the whole series, like
 * an ICS UID), cancelled and out-of-window instances skipped. Private or
 * subject-less events render as "Busy".
 */
export function mapGraphEventsToExternalEvents(
  items: GraphApiEvent[],
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
    if (!item.id || item.isCancelled) continue;
    const allDay = !!item.isAllDay;
    const start = parseGraphDateTime(item.start?.dateTime);
    if (!start) continue;
    let end = parseGraphDateTime(item.end?.dateTime);
    if (!end) {
      end = allDay ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : start;
    }
    if (end.getTime() <= start.getTime()) continue;
    if (start >= windowEnd || end <= windowStart) continue;

    const uid = item.seriesMasterId ?? item.id;
    const startIso = start.toISOString();
    const id = `${sourceId}|${uid}|${startIso}`;
    byId.set(id, {
      id,
      sourceId,
      userId,
      uid,
      title: item.subject || "Busy",
      start: startIso,
      end: end.toISOString(),
      allDay,
    });
  }

  return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchMicrosoftCalendarEvents(args: {
  accessToken: string;
  calendarId: string;
  sourceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
}): Promise<ExternalEvent[]> {
  const { accessToken, calendarId, sourceId, userId, windowStart, windowEnd } =
    args;
  const items: GraphApiEvent[] = [];
  const params = new URLSearchParams({
    startDateTime: windowStart.toISOString(),
    endDateTime: windowEnd.toISOString(),
    $select: "id,subject,start,end,isAllDay,isCancelled,seriesMasterId",
    $top: "500",
  });
  let url: string | undefined =
    `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params.toString()}`;
  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Microsoft couldn't find that calendar for your account"
          : response.status === 403
            ? "Your Microsoft account doesn't have access to that calendar"
            : `Microsoft events fetch failed (${response.status})`,
      );
    }
    const data = (await response.json()) as {
      value?: GraphApiEvent[];
      "@odata.nextLink"?: string;
    };
    items.push(...(data.value ?? []));
    url = data["@odata.nextLink"];
  }

  return mapGraphEventsToExternalEvents(items, {
    sourceId,
    userId,
    windowStart,
    windowEnd,
  });
}
