import { EventType, type SerializedLocation, type TravelEvent } from "../../contracts";
import type { TravelCalendarEvent } from "./calendarEvent";

// Locations are joined at render time so renaming one takes effect without
// touching every materialized travel row.
export function travelEventsToCalendarEvents(
  travelEvents: TravelEvent[],
  locations: Pick<SerializedLocation, "id" | "name">[] = [],
): TravelCalendarEvent[] {
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const nameFor = (id: string | null): string => {
    if (!id) return "Anywhere";
    return locationById.get(id)?.name ?? "Unknown";
  };

  return travelEvents.map((event) => {
    const fromLocationName = nameFor(event.fromLocationId);
    const toLocationName = nameFor(event.toLocationId);
    return {
      kind: EventType.travel,
      id: event.id,
      title: `${fromLocationName} → ${toLocationName}`,
      start: new Date(event.start),
      end: new Date(event.end),
      editable: false,
      fromLocationId: event.fromLocationId,
      toLocationId: event.toLocationId,
      fromLocationName,
      toLocationName,
      travelMinutes: event.travelMinutes,
      requiredTravelMinutes: event.requiredTravelMinutes,
      insufficientTravel: event.insufficientTravel,
      overconstrained: event.overconstrained,
    };
  });
}
