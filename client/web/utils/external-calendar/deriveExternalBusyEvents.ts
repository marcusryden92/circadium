import {
  EventType,
  ExternalCalendarMode,
  type ExternalCalendarSource,
  type ExternalEvent,
  type SimpleEvent,
} from "@/types/prisma";
import { parseModeExceptions } from "./modeExceptions";
import { parseLocationExceptions } from "./locationExceptions";

// Resolves which imported events actually block the engine: a BUSY source's
// events minus its exceptions, plus a VISUAL source's excepted events. All-day
// events never block in v1. The result is SimpleEvent-shaped so the blocks
// ride the engine's fixed-event pathway; they are filtered back out of the
// engine's persisted output at final assembly (eventType external).
export function deriveExternalBusyEvents(
  sources: ExternalCalendarSource[],
  events: ExternalEvent[],
): SimpleEvent[] {
  if (events.length === 0) return [];
  const sourceById = new Map(
    sources.map((source) => [
      source.id,
      {
        enabled: source.enabled,
        busyByDefault: source.mode === ExternalCalendarMode.BUSY,
        exceptions: new Set(parseModeExceptions(source.modeExceptions)),
        defaultLocationId: source.locationId ?? null,
        locationExceptions: parseLocationExceptions(source.locationExceptions),
      },
    ]),
  );

  const busy: SimpleEvent[] = [];
  for (const event of events) {
    const source = sourceById.get(event.sourceId);
    if (!source || !source.enabled) continue;
    if (event.allDay) continue;
    const excepted = source.exceptions.has(event.uid);
    if (source.busyByDefault === excepted) continue;
    if (event.end <= event.start) continue;
    const locationId = Object.prototype.hasOwnProperty.call(
      source.locationExceptions,
      event.uid,
    )
      ? source.locationExceptions[event.uid]
      : source.defaultLocationId;
    busy.push({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      duration: Math.round(
        (new Date(event.end).getTime() - new Date(event.start).getTime()) /
          60000,
      ),
      userId: event.userId,
      rrule: null,
      backgroundColor: "",
      borderColor: "",
      createdAt: event.start,
      updatedAt: event.start,
      extendedProps: {
        id: event.id,
        plannerType: null,
        eventType: EventType.external,
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
        eventId: event.id,
        locationId,
      },
    });
  }
  return busy;
}

// True busy-ness for a single event, shared by the renderer (popover toggle
// state) and anything else that needs the resolved value outside the engine.
export function isExternalEventBusy(
  source: Pick<ExternalCalendarSource, "enabled" | "mode" | "modeExceptions">,
  event: Pick<ExternalEvent, "uid" | "allDay">,
): boolean {
  if (!source.enabled || event.allDay) return false;
  const excepted = parseModeExceptions(source.modeExceptions).includes(
    event.uid,
  );
  return (source.mode === ExternalCalendarMode.BUSY) !== excepted;
}
