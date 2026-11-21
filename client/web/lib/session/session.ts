import { cache } from "react";
import { cookies } from "next/headers";

import type { UserRole } from "@/generated/client";
import { db } from "@/lib/db";
import { retry } from "@/lib/retry";
import { verifyAccessToken } from "@/lib/session/accessToken";
import { accessCookieName } from "@/lib/session/config";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  isTwoFactorEnabled: boolean;
  /** Signed up through a provider; such accounts have no password to change. */
  isOAuth: boolean;
};

export type Session = {
  user: SessionUser;
  /**
   * ISO instant. The browser cannot read the HttpOnly cookie, so this is how a
   * freshly loaded page learns when to refresh it.
   */
  accessTokenExpiresAt: string;
};

/**
 * True when the token predates the account's last password change. JWT `iat`
 * has second granularity, so a token from the same second as the change is
 * accepted: it is ambiguous, and the login right after a reset lands there.
 */
export function issuedBeforePasswordChange(
  issuedAtSeconds: number,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt) return false;
  return issuedAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}

/**
 * The signed-in user for this request, from the Java access cookie, or null.
 *
 * The token proves who the caller is; the rest of the user comes from the
 * database, which is also authoritative for the role. A deleted account or a
 * token from before a password change counts as signed out, even though the
 * token itself is still within its lifetime.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(accessCookieName())?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  const user = await retry(() =>
    db.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isTwoFactorEnabled: true,
        passwordChangedAt: true,
        accounts: { select: { id: true }, take: 1 },
      },
    }),
  );
  if (!user) return null;
  if (issuedBeforePasswordChange(claims.issuedAt, user.passwordChangedAt)) {
    return null;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      isOAuth: user.accounts.length > 0,
    },
    accessTokenExpiresAt: new Date(claims.expiresAt * 1000).toISOString(),
  };
});
