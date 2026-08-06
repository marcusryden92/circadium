"use server";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { getAccountDeletionTokenByToken } from "@/data/accountDeletionToken";
import { currentUser } from "@/lib/auth";
import { generateAccountDeletionToken } from "@/lib/tokens";
import { sendAccountDeletionEmail } from "@/lib/mail";
import { deletePosthogPerson } from "@/lib/posthogServer";

interface RequestInput {
  confirmEmail: string;
  password?: string;
}

/**
 * Step 1: user in Settings > Danger confirms their email (+ password for
 * credential accounts) and we mail them a signed link. Nothing is deleted
 * here — the account only goes away when the emailed link is confirmed.
 */
export const requestAccountDeletion = async (
  values: RequestInput,
): Promise<{ success?: string; error?: string }> => {
  const sessionUser = await currentUser();
  if (!sessionUser?.id) return { error: "Unauthorized." };

  const dbUser = await getUserById(sessionUser.id);
  if (!dbUser) return { error: "Unauthorized." };

  const normalizedConfirm = values.confirmEmail.trim().toLowerCase();
  const normalizedEmail = (dbUser.email ?? "").trim().toLowerCase();
  if (!normalizedEmail || normalizedConfirm !== normalizedEmail) {
    return { error: "Email confirmation didn't match." };
  }

  if (dbUser.password) {
    if (!values.password) return { error: "Password is required." };
    const passwordsMatch = await bcrypt.compare(
      values.password,
      dbUser.password,
    );
    if (!passwordsMatch) return { error: "Incorrect password." };
  }

  const token = await generateAccountDeletionToken(dbUser.id);
  try {
    await sendAccountDeletionEmail(normalizedEmail, token.token);
  } catch {
    // Roll back the token if the mailer fails so a stale token doesn't sit
    // in the DB unusable.
    await db.accountDeletionToken.delete({ where: { id: token.id } });
    return { error: "Could not send confirmation email. Try again." };
  }

  return { success: `Confirmation email sent to ${normalizedEmail}.` };
};

/**
 * Step 2: user clicked the emailed link. We require an active session that
 * matches the token owner so an intercepted email alone can't nuke someone's
 * account, then run the destructive transaction.
 */
export const confirmAccountDeletion = async (
  token: string,
): Promise<{ success?: string; error?: string }> => {
  if (!token) return { error: "Missing token." };

  const sessionUser = await currentUser();
  if (!sessionUser?.id) {
    return { error: "Sign in with the account you want to delete first." };
  }

  const existingToken = await getAccountDeletionTokenByToken(token);
  if (!existingToken) return { error: "This confirmation link is invalid." };

  if (existingToken.userId !== sessionUser.id) {
    return {
      error:
        "This confirmation link belongs to a different account. Sign out and sign back in as that account.",
    };
  }

  if (new Date(existingToken.expires) < new Date()) {
    await db.accountDeletionToken.delete({ where: { id: existingToken.id } });
    return {
      error: "This confirmation link has expired. Request a new one.",
    };
  }

  const dbUser = await getUserById(existingToken.userId);
  if (!dbUser) return { error: "Account not found." };

  try {
    await db.$transaction(
      async (tx) => {
        // UserSchedulingPreferences has no FK relation, so no cascade.
        await tx.userSchedulingPreferences.deleteMany({
          where: { userId: dbUser.id },
        });

        // Auth tokens are keyed by email, not userId.
        if (dbUser.email) {
          await tx.verificationToken.deleteMany({
            where: { email: dbUser.email },
          });
          await tx.passwordResetToken.deleteMany({
            where: { email: dbUser.email },
          });
          await tx.twoFactorToken.deleteMany({
            where: { email: dbUser.email },
          });
        }

        // Cascades handle: Account, SimpleEvent + EventExtendedProps,
        // Planner, EventTemplate, TwoFactorConfirmation,
        // AccountDeletionToken, Location + TravelTime, Category +
        // CategoryTimeWindow + CategoryEvent, TravelEvent, EngineMessage.
        await tx.user.delete({ where: { id: dbUser.id } });
      },
      { timeout: 30000 },
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Failed to delete account: ${err.message}`
          : "Failed to delete account.",
    };
  }

  // GDPR erasure completeness: analytics events are keyed by the user id, so
  // remove the PostHog person too. Best-effort — never blocks the deletion.
  await deletePosthogPerson(dbUser.id);

  return { success: "Account deleted." };
};
