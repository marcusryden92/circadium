import type { EventInput } from "@fullcalendar/core/index.js";
import { EventType } from "@/types/prisma";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";
import { tileColors, tileExtendedProps } from "./tileEvent";

// CalendarEvent -> FullCalendar EventInput. The colors and the extendedProps
// bag come from the same functions the own renderer uses (tileEvent.ts); what
// stays here is FullCalendar-only: display modes and resize locks.
export function toFullCalendarInput(event: CalendarEvent): EventInput {
  const base = {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    ...tileColors(event),
  };
  const extendedProps = tileExtendedProps(event);

  switch (event.kind) {
    case EventType.planner:
    case EventType.template:
    case EventType.travel:
      return { ...base, editable: event.editable, extendedProps };

    case EventType.category:
      return {
        ...base,
        display: "background",
        editable: event.editable,
        extendedProps,
      };

    case EventType.external:
      return {
        ...base,
        editable: event.editable,
        durationEditable: false,
        extendedProps,
      };

    default: {
      const unreachable: never = event;
      throw new Error(
        `Unhandled calendar event kind: ${(unreachable as CalendarEvent).kind}`,
      );
    }
  }
}
