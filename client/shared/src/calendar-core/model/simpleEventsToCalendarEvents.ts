import { EventType, type SimpleEvent } from "../../contracts";
import type { PlannerCalendarEvent } from "./calendarEvent";

// Persisted engine output (plans + scheduled tasks). A row whose start or end
// does not parse has no place on a time grid and is dropped.
export function simpleEventsToCalendarEvents(
  events: SimpleEvent[],
): PlannerCalendarEvent[] {
  const result: PlannerCalendarEvent[] = [];
  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    result.push({
      kind: EventType.planner,
      id: event.id,
      title: event.title,
      start,
      end,
      editable: true,
      color: event.backgroundColor,
      borderColor: event.borderColor,
      props: event.extendedProps,
    });
  }
  return result;
}
