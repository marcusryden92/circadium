import Anthropic from "@anthropic-ai/sdk";

export function parseGoalIds(input: unknown): string[] {
  const goalIds = (input as { goalIds?: unknown } | null)?.goalIds;
  if (!Array.isArray(goalIds)) return [];
  return goalIds.filter((id): id is string => typeof id === "string");
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

// The user's key is at work here, so surface Anthropic failures in words that
// point at the fix rather than raw SDK messages.
export function describeAssistantError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic rejected your API key — check it under Settings → AI assistant.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Your Anthropic account is rate-limited right now — wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Anthropic — check your connection and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    if (typeof err.status === "number" && err.status >= 500) {
      return "Anthropic is overloaded right now — try again in a moment.";
    }
    return `${err.status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
