import type { EventType, SimpleEventExtendedProps } from "../../contracts";

// The window a renderer is showing. `end` is exclusive.
export interface CalendarRange {
  start: Date;
  end: Date;
}

interface CalendarEventBase {
  // Unique per rendered occurrence and stable across regens, so a renderer can
  // key tiles on it without remounting them.
  id: string;
  title: string;
  start: Date;
  end: Date;
  // Whether the user may move or resize this event. Renderer-specific
  // restrictions (e.g. resize-only locks) are the renderer's concern.
  editable: boolean;
}

// The renderer-agnostic view of one calendar tile. Colors here are the user's
// own data (item, template, category, source colors); theme fallbacks are
// resolved by each renderer, since theme tokens are platform-specific.
export type CalendarEvent =
  | PlannerCalendarEvent
  | TemplateCalendarEvent
  | CategoryCalendarEvent
  | TravelCalendarEvent
  | ExternalCalendarEvent;

export interface PlannerCalendarEvent extends CalendarEventBase {
  kind: typeof EventType.planner;
  color: string;
  borderColor: string;
  // Passed through verbatim from the persisted row: a row without props must
  // stay without them, because renderers branch on the eventType inside.
  props: SimpleEventExtendedProps | null;
}

export interface TemplateCalendarEvent extends CalendarEventBase {
  kind: typeof EventType.template;
  templateId: string;
  occurrenceKey: string;
  moved: boolean;
  color: string;
}

export interface CategoryCalendarEvent extends CalendarEventBase {
  kind: typeof EventType.category;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  isStrict: boolean;
  trespassingStart: boolean;
  trespassingEnd: boolean;
}

export interface TravelCalendarEvent extends CalendarEventBase {
  kind: typeof EventType.travel;
  fromLocationId: string | null;
  toLocationId: string | null;
  fromLocationName: string;
  toLocationName: string;
  travelMinutes: number;
  requiredTravelMinutes: number | null;
  insufficientTravel: boolean;
  overconstrained: boolean;
}

export interface ExternalCalendarEvent extends CalendarEventBase {
  kind: typeof EventType.external;
  sourceId: string;
  uid: string;
  busy: boolean;
  allDay: boolean;
  sourceName: string;
  accent: string | null;
}
