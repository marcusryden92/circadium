"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";

import { SettingsSchema } from "@/schemas";
import { db } from "@/lib/db";
import { getUserByEmail, getUserById } from "@/data/user";

import { currentUser } from "@/lib/auth";
import { generateVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/mail";
import { AiMode } from "@/generated/client";
import { AI_MODELS } from "@/lib/aiModels";

export const settings = async (values: z.infer<typeof SettingsSchema>) => {
  const user = await currentUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  const dbUser = await getUserById(user.id as string);

  if (!dbUser) {
    return { error: "Unauthorized." };
  }

  // Runtime validation — the z.infer type is compile-time only, so a caller
  // can send arbitrary User columns without this.
  const parsed = SettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Invalid fields." };
  }
  const data = parsed.data;

  if (user.isOAuth) {
    data.email = undefined;
    data.password = undefined;
    data.newPassword = undefined;
    data.isTwoFactorEnabled = undefined;
  }

  if (data.email && data.email !== user.email) {
    const existingUser = await getUserByEmail(data.email);

    if (existingUser && existingUser.id !== user.id) {
      return { error: "Email already in use!" };
    }

    // Bind the token to the user id — the new email doesn't resolve to any
    // user row yet, so newVerification can't look the account up by email.
    const verificationToken = await generateVerificationToken(
      data.email,
      dbUser.id,
    );

    await sendVerificationEmail(
      verificationToken.email,
      verificationToken.token
    );

    return { success: "Verification email sent!" };
  }

  // Explicit whitelist — never spread client input into the update. The User
  // row also carries role, emailVerified, and the OCC dataVersion counter;
  // none of those are settable from here.
  const update: {
    name?: string;
    password?: string;
    passwordChangedAt?: Date;
    isTwoFactorEnabled?: boolean;
  } = {};

  if (data.name !== undefined) {
    update.name = data.name;
  }
  if (data.isTwoFactorEnabled !== undefined) {
    update.isTwoFactorEnabled = data.isTwoFactorEnabled;
  }

  if (data.password && data.newPassword && dbUser.password) {
    const passwordsMatch = await bcrypt.compare(data.password, dbUser.password);

    if (!passwordsMatch) {
      return { error: "Incorrect password!" };
    }

    update.password = await bcrypt.hash(data.newPassword, 10);
    update.passwordChangedAt = new Date();
  }

  if (Object.keys(update).length === 0) {
    return { success: "Settings updated!" };
  }

  await db.user.update({
    where: { id: dbUser.id },
    data: update,
  });

  return { success: "Settings updated!" };
};

// The mode is the only server-known part of the AI setup: the API key itself
// stays encrypted on the user's device (BYOK) and must never appear in any
// request to this server. MANAGED is reserved for a future app-key paid mode
// and is not settable until that ships.
export const updateAiMode = async (mode: AiMode) => {
  const user = await currentUser();

  if (!user?.id) {
    return { error: "Unauthorized." };
  }

  if (mode !== AiMode.BYOK && mode !== AiMode.OFF) {
    return { error: "Invalid mode." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { aiMode: mode },
  });

  return { success: "AI settings updated." };
};

// Which model BYOK requests use. The id is validated against the current
// lineup so a stale/forged value can never reach the Anthropic API; the engine
// falls back to the default for anything unknown regardless.
export const updateAiModel = async (modelId: string) => {
  const user = await currentUser();

  if (!user?.id) {
    return { error: "Unauthorized." };
  }

  if (!AI_MODELS.some((m) => m.id === modelId)) {
    return { error: "Invalid model." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { aiModel: modelId },
  });

  return { success: "AI model updated." };
};
