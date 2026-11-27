import { EventType } from "@/types/prisma";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";
import { vars } from "@/lib/theme";

// What the shared tile and popover components read from an event: exactly
// the slice of FullCalendar's EventImpl they used to take, so both renderers
// can hand them the same object. The FullCalendar renderer builds it from its
// EventImpl (fromEventImpl.ts), the own renderer straight from CalendarEvent.
export interface TileEvent {
  readonly id: string;
  readonly title: string;
  readonly start: Date | null;
  readonly end: Date | null;
  // "" when the event has no color of its own, matching EventImpl.
  readonly backgroundColor: string;
  readonly borderColor: string;
  // The components read loosely typed per-kind fields off this bag (eventType,
  // plannerType, travel and external markers), as they did off EventImpl.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly extendedProps: Record<string, any>;
}

export interface TileColors {
  backgroundColor?: string;
  borderColor?: string;
}

// The extendedProps every non-planner tile carries so the event-content
// components can branch on eventType without a planner row behind them.
const NON_PLANNER_PROPS = {
  plannerType: null,
  completedStartTime: null,
  completedEndTime: null,
  parentId: null,
} as const;

// Theme color fallbacks per kind. An absent key means the event has no color
// of its own: external tiles paint their fill from externalAccent instead.
export function tileColors(event: CalendarEvent): TileColors {
  switch (event.kind) {
    case EventType.planner:
      return { backgroundColor: event.color, borderColor: event.borderColor };
    case EventType.template:
      return { backgroundColor: event.color, borderColor: "transparent" };
    case EventType.category: {
      const color = event.categoryColor ?? vars.accent.primary;
      return { backgroundColor: color, borderColor: color };
    }
    case EventType.travel:
      if (event.insufficientTravel) {
        return {
          backgroundColor: vars.status.error,
          borderColor: vars.status.error,
        };
      }
      if (event.overconstrained) {
        return {
          backgroundColor: vars.status.warning,
          borderColor: vars.status.warning,
        };
      }
      return { backgroundColor: vars.muted, borderColor: vars.inkSoft };
    case EventType.external:
      return {};
    default: {
      const unreachable: never = event;
      throw new Error(
        `Unhandled calendar event kind: ${(unreachable as CalendarEvent).kind}`,
      );
    }
  }
}

// The extendedProps bag the tile and popover components read, per kind.
export function tileExtendedProps(
  event: CalendarEvent,
): TileEvent["extendedProps"] {
  switch (event.kind) {
    case EventType.planner:
      // Props spread verbatim: a row without props must reach EventContent
      // without an injected eventType.
      return { ...event.props, backgroundColor: event.color };
    case EventType.template:
      return {
        ...NON_PLANNER_PROPS,
        eventType: EventType.template,
        isTemplateItem: true,
        // The template row id; event.id is the composite occurrence id.
        eventId: event.templateId,
      };
    case EventType.category:
      return {
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
      };
    case EventType.travel:
      return {
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
      };
    case EventType.external:
      return {
        ...NON_PLANNER_PROPS,
        eventType: EventType.external,
        eventId: event.id,
        externalSourceId: event.sourceId,
        externalUid: event.uid,
        externalBusy: event.busy,
        externalAllDay: event.allDay,
        externalSourceName: event.sourceName,
        externalAccent: event.accent ?? vars.muted,
      };
    default: {
      const unreachable: never = event;
      throw new Error(
        `Unhandled calendar event kind: ${(unreachable as CalendarEvent).kind}`,
      );
    }
  }
}

export function tileEventFromCalendarEvent(event: CalendarEvent): TileEvent {
  const colors = tileColors(event);
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    backgroundColor: colors.backgroundColor ?? "",
    borderColor: colors.borderColor ?? "",
    extendedProps: tileExtendedProps(event),
  };
}
