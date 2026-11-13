export type EventTier = "tiny" | "compact" | "regular";

// Three-tier responsive layout breakpoints for calendar event tiles. Tuned
// against FullCalendar's default slot density: a 30-min event renders at
// ~28-30px tall, so the "regular" cutoff at 24 gives it the time pill.
// A 15-min event (~14-16px) falls into "compact". Anything below 13 is
// title-suppressed ("tiny"). Same thresholds for both regular and travel
// event content components.
const COMPACT_BREAKPOINT = 13;
const REGULAR_BREAKPOINT = 24;

export function getEventTier(elementHeight: number): EventTier {
  if (elementHeight < COMPACT_BREAKPOINT) return "tiny";
  if (elementHeight < REGULAR_BREAKPOINT) return "compact";
  return "regular";
}
