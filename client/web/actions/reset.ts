"use server";

import * as z from "zod";

import { ResetSchema } from "@/schemas";
import { getUserByEmail } from "@/data/user";

import { sendPasswordResetEmail } from "@/lib/mail";
import { generatePasswordResetToken } from "@/lib/tokens";

export const reset = async (values: z.infer<typeof ResetSchema>) => {
  const validatedFields = ResetSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Invalid email" };
  }

  const { email } = validatedFields.data;

  // Same response whether or not the account exists — a distinct "not found"
  // error would let anyone probe which emails are registered. Only send for
  // credentials accounts: an OAuth-only user has no password to reset, and
  // this flow shouldn't silently mint one.
  const existingUser = await getUserByEmail(email);

  if (existingUser?.password) {
    const passwordResetToken = await generatePasswordResetToken(email);

    await sendPasswordResetEmail(
      passwordResetToken.email,
      passwordResetToken.token
    );
  }

  return { success: "If an account exists for that email, a reset link is on its way." };
};
