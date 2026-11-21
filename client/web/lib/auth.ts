import { auth } from "@/auth";
import type { Session } from "@/lib/session/session";

export const currentUser = async () => {
  const session = await auth();

  return session?.user;
};

export const currentRole = async () => {
  const session = await auth();

  return session?.user.role;
};

/**
 * The admin tools show other people's data, so a password alone must not open
 * them: the session has to have signed in with the emailed code too.
 */
export const isAdminSession = (session: Session | null | undefined): boolean =>
  session?.user.role === "ADMIN" && session.twoFactorVerified;
