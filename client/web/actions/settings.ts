"use server";

import * as z from "zod";

import { SettingsSchema } from "@/schemas";
import { db } from "@/lib/db";

import { currentUser } from "@/lib/auth";
import { AiMode } from "@/generated/client";
import { AI_MODELS } from "@/lib/aiModels";

/**
 * The display name. Everything that decides who can sign in (email, password,
 * two-factor) is a Java endpoint that re-checks the current password
 * (`lib/api/auth.ts`).
 */
export const settings = async (values: z.infer<typeof SettingsSchema>) => {
  const user = await currentUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  // Runtime validation — the z.infer type is compile-time only, so a caller
  // can send arbitrary User columns without this.
  const parsed = SettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Invalid fields." };
  }

  // Explicit whitelist — never spread client input into the update.
  if (parsed.data.name !== undefined) {
    await db.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name },
    });
  }
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
