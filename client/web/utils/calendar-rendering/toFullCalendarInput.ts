import type { EventInput } from "@fullcalendar/core/index.js";
import { EventType } from "@/types/prisma";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";
import { vars } from "@/lib/theme";

// The extendedProps every non-planner tile carries so the event-content
// components can branch on eventType without a planner row behind them.
const NON_PLANNER_PROPS = {
  plannerType: null,
  completedStartTime: null,
  completedEndTime: null,
  parentId: null,
} as const;

// CalendarEvent -> FullCalendar EventInput. Everything FullCalendar- or
// theme-specific lives here: display modes, resize locks, theme color
// fallbacks, and the extendedProps bag the tile and popover components read.
export function toFullCalendarInput(event: CalendarEvent): EventInput {
  switch (event.kind) {
    case EventType.planner:
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        backgroundColor: event.color,
        borderColor: event.borderColor,
        editable: event.editable,
        // Props spread verbatim: a row without props must reach EventContent
        // without an injected eventType.
        extendedProps: {
          ...event.props,
          backgroundColor: event.color,
        },
      };

    case EventType.template:
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        backgroundColor: event.color,
        borderColor: "transparent",
        editable: event.editable,
        extendedProps: {
          ...NON_PLANNER_PROPS,
          eventType: EventType.template,
          isTemplateItem: true,
          // The template row id; event.id is the composite occurrence id.
          eventId: event.templateId,
        },
      };

    case EventType.category: {
      const color = event.categoryColor ?? vars.accent.primary;
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        backgroundColor: color,
        borderColor: color,
        display: "background",
        editable: event.editable,
        extendedProps: {
          ...NON_PLANNER_PROPS,
          eventType: EventType.category,
          eventId: "",
          categoryId: event.categoryId,
          categoryName: event.categoryName,
          categoryColor: event.categoryColor,
          isStrict: event.isStrict,
          wrapperId: event.id,
          trespassingStart: event.trespassingStart,
          trespassingEnd: event.trespassingEnd,
        },
      };
    }

    case EventType.travel: {
      let backgroundColor: string = vars.muted;
      let borderColor: string = vars.inkSoft;
      if (event.insufficientTravel) {
        backgroundColor = vars.status.error;
        borderColor = vars.status.error;
      } else if (event.overconstrained) {
        backgroundColor = vars.status.warning;
        borderColor = vars.status.warning;
      }
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        backgroundColor,
        borderColor,
        editable: event.editable,
        extendedProps: {
          ...NON_PLANNER_PROPS,
          eventType: EventType.travel,
          eventId: event.id,
          fromLocationId: event.fromLocationId,
          toLocationId: event.toLocationId,
          fromLocationName: event.fromLocationName,
          toLocationName: event.toLocationName,
          travelMinutes: event.travelMinutes,
          insufficientTravel: event.insufficientTravel,
          overconstrained: event.overconstrained,
          requiredTravelMinutes: event.requiredTravelMinutes,
        },
      };
    }

    case EventType.external:
      // No backgroundColor: the global calendar CSS forces .fc-event
      // backgrounds transparent, so ExternalEventContent paints the fill from
      // externalAccent instead.
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        editable: event.editable,
        durationEditable: false,
        extendedProps: {
          ...NON_PLANNER_PROPS,
          eventType: EventType.external,
          eventId: event.id,
          externalSourceId: event.sourceId,
          externalUid: event.uid,
          externalBusy: event.busy,
          externalAllDay: event.allDay,
          externalSourceName: event.sourceName,
          externalAccent: event.accent ?? vars.muted,
        },
      };

    default: {
      const unreachable: never = event;
      throw new Error(
        `Unhandled calendar event kind: ${(unreachable as CalendarEvent).kind}`,
      );
    }
  }
}
