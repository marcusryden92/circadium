import type {
  Category,
  CategoryEvent,
  EventTemplate,
  ExternalCalendarSource,
  ExternalEvent,
  SerializedLocation,
  SimpleEvent,
  TravelEvent,
} from "../../contracts";
import type { CalendarEvent, CalendarRange } from "./calendarEvent";
import { simpleEventsToCalendarEvents } from "./simpleEventsToCalendarEvents";
import { templatesToCalendarEvents } from "./templatesToCalendarEvents";
import { categoryEventsToCalendarEvents } from "./categoryEventsToCalendarEvents";
import { travelEventsToCalendarEvents } from "./travelEventsToCalendarEvents";
import { externalEventsToCalendarEvents } from "./externalEventsToCalendarEvents";

export interface BuildCalendarEventsInput {
  calendar: SimpleEvent[] | null | undefined;
  templates: EventTemplate[] | null | undefined;
  categories: Pick<Category, "id" | "name" | "color" | "isStrict">[] | null | undefined;
  categoryEvents: CategoryEvent[] | null | undefined;
  travelEvents: TravelEvent[] | null | undefined;
  locations: Pick<SerializedLocation, "id" | "name">[] | null | undefined;
  externalEvents: ExternalEvent[] | null | undefined;
  externalSources: ExternalCalendarSource[] | null | undefined;
  range: CalendarRange;
}

// The five render streams, each from its own source of truth:
//   1. persisted SimpleEvents (plans + scheduled tasks)
//   2. templates expanded from EventTemplate config over the visible range
//   3. category occurrences from the persisted CategoryEvent table
//   4. travel blocks from the persisted TravelEvent table
//   5. imported external-calendar events (read-only overlay)
// The order is kept stable: renderers that sort by duration and start still
// fall back to array order to break ties.
export function buildCalendarEvents(
  input: BuildCalendarEventsInput,
): CalendarEvent[] {
  return [
    ...simpleEventsToCalendarEvents(input.calendar ?? []),
    ...templatesToCalendarEvents(input.templates ?? [], input.range),
    ...categoryEventsToCalendarEvents(
      input.categoryEvents ?? [],
      input.categories ?? [],
    ),
    ...travelEventsToCalendarEvents(
      input.travelEvents ?? [],
      input.locations ?? [],
    ),
    ...externalEventsToCalendarEvents(
      input.externalEvents ?? [],
      input.externalSources ?? [],
    ),
  ];
}
