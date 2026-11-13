import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import crypto from "crypto";

import { getVerificationTokenByEmail } from "@/data/verificationToken";
import { getPasswordResetTokenByEmail } from "@/data/passwordResetToken";
import { getTwoFactorTokenByEmail } from "@/data/twoFactorToken";
import { getAccountDeletionTokenByUserId } from "@/data/accountDeletionToken";

export const generateTwoFactorToken = async (email: string) => {
  const token = crypto.randomInt(100_000, 1_000_000).toString();
  const expires = new Date(new Date().getTime() + 5 * 60 * 1000);

  const existingToken = await getTwoFactorTokenByEmail(email);

  if (existingToken) {
    await db.twoFactorToken.delete({
      where: { id: existingToken.id },
    });
  }

  const twoFactorToken = await db.twoFactorToken.create({
    data: {
      email,
      token,
      expires,
    },
  });

  return twoFactorToken;
};

export const generatePasswordResetToken = async (email: string) => {
  const token = uuidv4();
  const expires = new Date(new Date().getTime() + 3600 * 1000);

  const existingToken = await getPasswordResetTokenByEmail(email);

  if (existingToken) {
    await db.passwordResetToken.delete({
      where: { id: existingToken.id },
    });
  }

  const passwordResetToken = await db.passwordResetToken.create({
    data: {
      email,
      token,
      expires,
    },
  });

  return passwordResetToken;
};

export const generateAccountDeletionToken = async (userId: string) => {
  const token = uuidv4();
  // Short window: user just clicked "send me a confirmation email" seconds ago.
  const expires = new Date(new Date().getTime() + 30 * 60 * 1000);

  const existingToken = await getAccountDeletionTokenByUserId(userId);
  if (existingToken) {
    await db.accountDeletionToken.delete({ where: { id: existingToken.id } });
  }

  return db.accountDeletionToken.create({
    data: { userId, token, expires },
  });
};

// userId is required for email-change verification: the token's email is the
// NEW address, which no user row has yet, so the consumer must resolve the
// user by id. Registration/login verification omits it (email matches a row).
export const generateVerificationToken = async (
  email: string,
  userId?: string,
) => {
  const token = uuidv4();
  const expires = new Date(new Date().getTime() + 3600 * 1000);

  const existingToken = await getVerificationTokenByEmail(email);

  if (existingToken) {
    await db.verificationToken.delete({
      where: {
        id: existingToken.id,
      },
    });
  }

  const verificationToken = await db.verificationToken.create({
    data: {
      email,
      token,
      expires,
      userId: userId ?? null,
    },
  });

  return verificationToken;
};
