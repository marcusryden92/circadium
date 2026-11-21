// Outside a production build these fall back to the local Java server, so
// `pnpm dev` needs no extra env. A production build without them throws on
// first use rather than quietly pointing every session check at localhost.

const LOCAL_API_URL = "http://localhost:8080";
const LOCAL_ACCESS_COOKIE = "circadium_access";

export const ACCESS_TOKEN_AUDIENCE = "circadium-api";

function setting(
  name: string,
  value: string | undefined,
  localDefault: string,
): string {
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return localDefault;
  throw new Error(`${name} must be set in a production build.`);
}

/**
 * The Java API's origin. It is also the `iss` of every access token, because
 * the server's issuer is its own public origin in each environment.
 */
export function apiUrl(): string {
  return setting(
    "NEXT_PUBLIC_API_URL",
    process.env.NEXT_PUBLIC_API_URL,
    LOCAL_API_URL,
  ).replace(/\/+$/, "");
}

/**
 * Differs per environment: prod's access cookie is scoped to `circadium.app`
 * and so also reaches staging's subdomains, which therefore use their own name.
 */
export function accessCookieName(): string {
  return setting(
    "AUTH_ACCESS_COOKIE",
    process.env.AUTH_ACCESS_COOKIE,
    LOCAL_ACCESS_COOKIE,
  );
}
