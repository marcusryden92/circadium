import { apiUrl } from "@/lib/session/config";
import { hardNavigate } from "@/lib/session/navigation";

// "Continue with Google / Microsoft / Apple" runs through Java: the browser
// goes to the API, on to the provider, back to the API, and lands on
// /auth/oauth/complete with a one-time code. That code is redeemed together
// with a verifier that never left this tab (PKCE, RFC 7636), so a code seen in
// browser history or a log is useless, and a sign-in someone else started
// cannot be finished in this browser.

export type SignInProvider = "google" | "microsoft" | "apple";

export const SIGN_IN_PROVIDERS: readonly SignInProvider[] = [
  "google",
  "microsoft",
  "apple",
];

export const PROVIDER_NAMES: Record<SignInProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  apple: "Apple",
};

const PENDING_KEY = "circadium:oauth-sign-in";

export type PendingOAuthSignIn = {
  provider: SignInProvider;
  verifier: string;
  /** Unvalidated; checked with safeCallbackUrl where it is used. */
  callbackUrl: string | null;
};

export function isSignInProvider(value: unknown): value is SignInProvider {
  return (
    typeof value === "string" &&
    (SIGN_IN_PROVIDERS as readonly string[]).includes(value)
  );
}

/**
 * The providers to offer, from NEXT_PUBLIC_OAUTH_PROVIDERS (comma-separated,
 * all three when unset or blank). It must name the same set as the API's
 * OAUTH_PROVIDERS, which refuses a provider it does not offer; narrowing both
 * is how a provider is rolled out or held back.
 */
export function enabledSignInProviders(
  setting: string | undefined = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS,
): SignInProvider[] {
  if (!setting?.trim()) return [...SIGN_IN_PROVIDERS];
  const listed = new Set(setting.split(",").map((name) => name.trim()));
  return SIGN_IN_PROVIDERS.filter((provider) => listed.has(provider));
}

/**
 * Leaves the page for the provider. Throws when this browser cannot keep the
 * verifier (storage blocked) or hash it (no Web Crypto outside a secure
 * context).
 */
export async function startOAuthSignIn(
  provider: SignInProvider,
  callbackUrl: string | null,
): Promise<void> {
  const verifier = createVerifier();
  const challenge = await challengeFor(verifier);
  const pending: PendingOAuthSignIn = { provider, verifier, callbackUrl };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const query = new URLSearchParams({ client: "web", challenge });
  hardNavigate(`${apiUrl()}/oauth2/authorization/${provider}?${query}`);
}

/**
 * The sign-in this tab started, read once: the verifier is removed as it is
 * read, so a reload of the completion page cannot replay it.
 */
export function takePendingOAuthSignIn(): PendingOAuthSignIn | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingOAuthSignIn>;
    if (typeof value.verifier !== "string") return null;
    if (!isSignInProvider(value.provider)) return null;
    return {
      provider: value.provider,
      verifier: value.verifier,
      callbackUrl:
        typeof value.callbackUrl === "string" ? value.callbackUrl : null,
    };
  } catch {
    return null;
  }
}

/** 32 random bytes as base64url: 43 characters, the RFC 7636 minimum. */
export function createVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The S256 challenge: base64url of the verifier's SHA-256. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
