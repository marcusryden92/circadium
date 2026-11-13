export type EngineTone = "fail" | "warn" | "info" | "done";

// Severity rank: higher = more urgent. Used to fold a list of engine messages
// into the single "worst" tone for header pills.
export const TONE_SEVERITY: Record<EngineTone, number> = {
  fail: 3,
  warn: 2,
  info: 1,
  done: 0,
};

// Returns the most severe unresolved tone in a list of messages, or null
// when nothing is failing or warning.
export function worstUnresolved(
  messages: ReadonlyArray<{ tone: EngineTone }>,
): EngineTone | null {
  let worst: EngineTone | null = null;
  for (const m of messages) {
    if (m.tone === "fail" || m.tone === "warn") {
      if (!worst || TONE_SEVERITY[m.tone] > TONE_SEVERITY[worst]) {
        worst = m.tone;
      }
    }
  }
  return worst;
}
