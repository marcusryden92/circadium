import {
  EventType,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "../../contracts";
import { isExternalEventBusy } from "../../domain/external-calendar/externalBusy";
import type { ExternalCalendarEvent } from "./calendarEvent";

// Imported external-calendar events as a read-only stream. Busy-ness resolves
// through the same helper the engine input uses, so a tile always agrees with
// what the scheduler actually blocked on.
export function externalEventsToCalendarEvents(
  externalEvents: ExternalEvent[],
  sources: ExternalCalendarSource[],
): ExternalCalendarEvent[] {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const result: ExternalCalendarEvent[] = [];

  for (const event of externalEvents) {
    const source = sourceById.get(event.sourceId);
    if (!source || !source.enabled) continue;
    // The time grid has no all-day row, so all-day events have nowhere to
    // paint; they also never block scheduling in v1.
    if (event.allDay) continue;

    result.push({
      kind: EventType.external,
      id: event.id,
      title: event.title,
      start: new Date(event.start),
      end: new Date(event.end),
      editable: false,
      sourceId: event.sourceId,
      uid: event.uid,
      busy: isExternalEventBusy(source, event),
      allDay: event.allDay,
      sourceName: source.name,
      accent: source.color ?? null,
    });
  }

  return result;
}
