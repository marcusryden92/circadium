// A Google Calendar *sharing* link (calendar.google.com/calendar/u/0?cid=…)
// is an HTML page, not a feed. The cid parameter is the base64url-encoded
// calendar id; decoding it lets the add-flow try that calendar's public ICS
// feed, and name the fix precisely when the calendar isn't public.
export function googleShareLinkCalendarId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "calendar.google.com") return null;
    if (parsed.pathname.includes("/ical/")) return null;
    const cid = parsed.searchParams.get("cid");
    if (!cid) return null;
    const base64 = cid.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    return decoded.includes("@") ? decoded : null;
  } catch {
    return null;
  }
}

export function googlePublicIcsUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
    calendarId,
  )}/public/basic.ics`;
}

// Feed URLs are accepted as https:// or webcal:// (the subscription scheme
// Google/Outlook/Apple hand out); webcal is plain https underneath.
export function normalizeIcsUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^(https?|webcal):\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const normalized = withScheme.replace(/^webcal:\/\//i, "https://");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
