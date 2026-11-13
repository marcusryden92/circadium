import { SimpleEvent, EventType } from "@/types/prisma";

// Final SimpleEvent[] returned by the engine. Templates, category wrappers,
// travel events, and external busy blocks are deliberately excluded:
// templates are rendered at runtime from the EventTemplate config (RRule
// unfolds them); category occurrences live in their own CategoryEvent[]
// alongside this output; travel events live in their own TravelEvent[];
// external blocks live in ExternalEvent rows owned by the refresh path.
// Only plans + scheduled tasks (including completed) ride in this array.
export function assembleFinalEventList(
  scheduledEvents: SimpleEvent[],
): SimpleEvent[] {
  return scheduledEvents.filter(
    (e) =>
      e.extendedProps?.eventType !== EventType.template &&
      e.extendedProps?.eventType !== EventType.external,
  );
}
