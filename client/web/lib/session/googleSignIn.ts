import { apiUrl } from "@/lib/session/config";
import { hardNavigate } from "@/lib/session/navigation";

// "Continue with Google" runs through Java: the browser goes to the API, on to
// Google, back to the API, and lands on /auth/oauth/complete with a one-time
// code. That code is redeemed together with a verifier that never left this
// tab (PKCE, RFC 7636), so a code seen in browser history or a log is useless,
// and a sign-in someone else started cannot be finished in this browser.

const PENDING_KEY = "circadium:google-sign-in";

export type PendingGoogleSignIn = {
  verifier: string;
  /** Unvalidated; checked with safeCallbackUrl where it is used. */
  callbackUrl: string | null;
};

/**
 * Leaves the page for Google. Throws when this browser cannot keep the
 * verifier (storage blocked) or hash it (no Web Crypto outside a secure
 * context).
 */
export async function startGoogleSignIn(
  callbackUrl: string | null,
): Promise<void> {
  const verifier = createVerifier();
  const challenge = await challengeFor(verifier);
  const pending: PendingGoogleSignIn = { verifier, callbackUrl };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const query = new URLSearchParams({ client: "web", challenge });
  hardNavigate(`${apiUrl()}/oauth2/authorization/google?${query}`);
}

/**
 * The sign-in this tab started, read once: the verifier is removed as it is
 * read, so a reload of the completion page cannot replay it.
 */
export function takePendingGoogleSignIn(): PendingGoogleSignIn | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingGoogleSignIn>;
    if (typeof value.verifier !== "string") return null;
    return {
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
