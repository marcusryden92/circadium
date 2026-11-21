import { DEFAULT_LOGIN_REDIRECT, authRoutes } from "@/routes";

/**
 * Where to go after signing in. `callbackUrl` comes from the query string, so
 * anyone can put one in a login link; only paths on this site are honored, or
 * a phishing link could send a freshly signed-in user on to a look-alike site.
 * The parsed path is returned rather than the input, so tricks the URL parser
 * would resolve to another host (`//evil.example`, `/\evil.example`, embedded
 * tabs) are judged by where the browser would actually go.
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  origin: string,
): string {
  if (!raw) return DEFAULT_LOGIN_REDIRECT;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return DEFAULT_LOGIN_REDIRECT;
  }
  if (url.origin !== origin) return DEFAULT_LOGIN_REDIRECT;
  // Pages for signed-out visitors would bounce straight back to the dashboard.
  if (authRoutes.includes(url.pathname)) return DEFAULT_LOGIN_REDIRECT;
  return `${url.pathname}${url.search}${url.hash}`;
}
