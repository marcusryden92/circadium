import type { EventInput } from "@fullcalendar/core/index.js";
import {
  EventType,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "@/types/prisma";
import { isExternalEventBusy } from "@/utils/external-calendar/deriveExternalBusyEvents";
import { vars } from "@/lib/theme";

// Imported external-calendar events as a read-only render stream. Busy-ness
// resolves through the same helper the engine input uses, so the tile always
// agrees with what the scheduler actually blocked on. The global calendar CSS
// forces every .fc-event background transparent, so the fill is painted by
// ExternalEventContent from the accent passed in extendedProps — an EventInput
// backgroundColor would be dead on arrival.
export function externalEventsToEventInput(
  externalEvents: ExternalEvent[],
  sources: ExternalCalendarSource[],
): EventInput[] {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const inputs: EventInput[] = [];

  for (const event of externalEvents) {
    const source = sourceById.get(event.sourceId);
    if (!source || !source.enabled) continue;
    // The calendar renders with allDaySlot disabled, so all-day rows have
    // nowhere to paint; they also never block scheduling in v1.
    if (event.allDay) continue;
    const busy = isExternalEventBusy(source, event);
    const accent = source.color ?? vars.muted;

    inputs.push({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      editable: false,
      durationEditable: false,
      extendedProps: {
        eventType: EventType.external,
        eventId: event.id,
        plannerType: null,
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
        externalSourceId: event.sourceId,
        externalUid: event.uid,
        externalBusy: busy,
        externalAllDay: event.allDay,
        externalSourceName: source.name,
        externalAccent: accent,
      },
    } satisfies EventInput);
  }

  return inputs;
}
