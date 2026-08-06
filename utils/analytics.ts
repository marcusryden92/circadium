import posthog from "posthog-js";

type AnalyticsEvent =
  | "item_captured"
  | "item_created"
  | "calendar_refreshed"
  | "assistant_message_sent"
  | "assistant_draft_saved"
  | "onboarding_step_completed"
  | "onboarding_finished";

// Never send user content (titles, notes, chat text) — properties are for
// counts, flags, and step indices only.
export function captureEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }
  posthog.capture(event, properties);
}
