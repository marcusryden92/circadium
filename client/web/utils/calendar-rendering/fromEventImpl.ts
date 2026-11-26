import type { EventImpl } from "@fullcalendar/core/internal";
import type { TileEvent } from "./tileEvent";

// The FullCalendar renderer's shim onto the shared components: copies the
// EventImpl surface they read into a TileEvent. Goes away with FullCalendar.
export function tileEventFromEventImpl(event: EventImpl): TileEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    backgroundColor: event.backgroundColor,
    borderColor: event.borderColor,
    extendedProps: event.extendedProps,
  };
}
