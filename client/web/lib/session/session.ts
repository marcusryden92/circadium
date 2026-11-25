import { cache } from "react";
import { cookies } from "next/headers";

import type { AiMode, UserRole } from "@/types/prisma";
import { retry } from "@/lib/retry";
import { accessCookieName, apiUrl } from "@/lib/session/config";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  isTwoFactorEnabled: boolean;
  /** Signed up through a provider; such accounts have no password to change. */
  isOAuth: boolean;
  /** The providers this account signs in with (`google`, `microsoft`, `apple`). */
  signInProviders: string[];
  /** ISO instant, or null while the first-run setup is still owed. */
  onboardedAt: string | null;
  aiMode: AiMode | null;
  aiModel: string | null;
};

export type Session = {
  user: SessionUser;
  /**
   * ISO instant. The browser cannot read the HttpOnly cookie, so this is how a
   * freshly loaded page learns when to refresh it.
   */
  accessTokenExpiresAt: string;
  /**
   * This sign-in passed the emailed code as well as the password. The admin
   * tools require it; the account's 2FA setting alone says nothing about how
   * this particular session started.
   */
  twoFactorVerified: boolean;
};

/**
 * The signed-in user for this request, from the Java access cookie, or null.
 *
 * The token proves who the caller is; the rest comes from Java's DB-checked
 * `GET /auth/session`, which is also authoritative for the role. A deleted
 * account, an ended sign-in (signed out, or every session ended by a password
 * change or reset), or a token from before a password change answers 401 there
 * and counts as signed out, even though the token itself is still within its
 * lifetime. Any other failure throws, so callers can tell "signed out" from
 * "could not check".
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(accessCookieName())?.value;
  if (!token) return null;

  const response = await retry(async () => {
    const result = await fetch(`${apiUrl()}/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // 5xx (Java waking or restarting) is worth a retry; 401 is an answer.
    if (result.status >= 500) {
      throw new Error(`session check failed: ${result.status}`);
    }
    return result;
  });
  if (!response.ok) return null;

  return (await response.json()) as Session;
});
