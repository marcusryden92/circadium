import { AiMode } from "@/types/prisma";
import { apiRequest } from "@/lib/api/client";

// The small profile settings, on the Java API (plan 2.4): display name, AI
// mode/model, onboarding completion. Everything that decides who can sign in
// (email, password, two-factor, deletion) lives in lib/api/auth.ts and
// re-checks the current password. The settings-shaped calls keep the retired
// actions' {success}/{error} result shape (AiAccessContext and ProfileSection
// branch on it); completeOnboarding throws, which its caller already catches.

export async function settings(values: {
  name?: string;
}): Promise<{ success?: string; error?: string }> {
  try {
    await apiRequest<void>("/account/profile", {
      method: "PATCH",
      body: { name: values.name },
      authenticated: true,
    });
    return { success: "Settings updated!" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function updateAiMode(
  mode: AiMode,
): Promise<{ success?: string; error?: string }> {
  try {
    await apiRequest<void>("/account/ai-mode", {
      method: "PUT",
      body: { mode },
      authenticated: true,
    });
    return { success: "AI settings updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function updateAiModel(
  modelId: string,
): Promise<{ success?: string; error?: string }> {
  try {
    await apiRequest<void>("/account/ai-model", {
      method: "PUT",
      body: { model: modelId },
      authenticated: true,
    });
    return { success: "AI model updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export function completeOnboarding(): Promise<void> {
  return apiRequest<void>("/account/onboarding-complete", {
    method: "POST",
    body: {},
    authenticated: true,
  });
}
