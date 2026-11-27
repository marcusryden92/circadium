import { travelEventsToCalendarEvents } from "../../../calendar-core/model/travelEventsToCalendarEvents";
import type { TravelEvent } from "../../../contracts";

function travelEvent(overrides: Partial<TravelEvent> = {}): TravelEvent {
  return {
    id: "t1",
    start: "2026-06-08T07:00:00.000Z",
    end: "2026-06-08T07:20:00.000Z",
    fromLocationId: "home",
    toLocationId: "office",
    travelMinutes: 20,
    requiredTravelMinutes: 25,
    insufficientTravel: true,
    overconstrained: false,
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
    ...overrides,
  };
}

const locations = [
  { id: "home", name: "Home" },
  { id: "office", name: "Office" },
];

describe("travelEventsToCalendarEvents", () => {
  it("joins location names into the title and carries the travel facts", () => {
    const [event] = travelEventsToCalendarEvents([travelEvent()], locations);
    expect(event).toEqual({
      kind: "travel",
      id: "t1",
      title: "Home → Office",
      start: new Date("2026-06-08T07:00:00.000Z"),
      end: new Date("2026-06-08T07:20:00.000Z"),
      editable: false,
      fromLocationId: "home",
      toLocationId: "office",
      fromLocationName: "Home",
      toLocationName: "Office",
      travelMinutes: 20,
      requiredTravelMinutes: 25,
      insufficientTravel: true,
      overconstrained: false,
    });
  });

  it("names a null location Anywhere and an unknown one Unknown", () => {
    const [event] = travelEventsToCalendarEvents(
      [travelEvent({ fromLocationId: null, toLocationId: "deleted" })],
      locations,
    );
    expect(event.title).toBe("Anywhere → Unknown");
    expect(event.fromLocationName).toBe("Anywhere");
    expect(event.toLocationName).toBe("Unknown");
  });

  it("defaults to no locations", () => {
    const [event] = travelEventsToCalendarEvents([travelEvent()]);
    expect(event.title).toBe("Unknown → Unknown");
  });
});
