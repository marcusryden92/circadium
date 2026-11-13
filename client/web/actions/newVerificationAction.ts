"use server";

import { db } from "@/lib/db";
import { getUserByEmail, getUserById } from "@/data/user";
import { getVerificationTokenByToken } from "@/data/verificationToken";

export const newVerification = async (token: string) => {
  const existingToken = await getVerificationTokenByToken(token);

  if (!existingToken) {
    return { error: "Token does not exist" };
  }

  const hasExpired = new Date(existingToken.expires) < new Date();

  if (hasExpired) {
    return { error: "Token has expired" };
  }

  // Email-change tokens carry the userId (the new address has no user row
  // yet); registration tokens resolve by email.
  const existingUser = existingToken.userId
    ? await getUserById(existingToken.userId)
    : await getUserByEmail(existingToken.email);

  if (!existingUser) {
    return { error: "Email does not exist!" };
  }

  // The address may have been claimed by another account between the request
  // and the click — bail instead of hitting the unique constraint.
  const emailOwner = await getUserByEmail(existingToken.email);
  if (emailOwner && emailOwner.id !== existingUser.id) {
    return { error: "Email is already in use." };
  }

  await db.user.update({
    where: { id: existingUser.id },
    data: {
      emailVerified: new Date(),
      email: existingToken.email,
    },
  });

  await db.verificationToken.delete({
    where: { id: existingToken.id },
  });

  return { success: "Email verified!" };
};
