import { externalEventsToCalendarEvents } from "../../../calendar-core/model/externalEventsToCalendarEvents";
import type { ExternalCalendarSource, ExternalEvent } from "../../../contracts";

function source(
  overrides: Partial<ExternalCalendarSource> = {},
): ExternalCalendarSource {
  return {
    id: "src1",
    userId: "u",
    kind: "ICS",
    url: "https://example.invalid/cal.ics",
    name: "Work calendar",
    color: "#00ff00",
    enabled: true,
    mode: "BUSY",
    modeExceptions: null,
    locationId: null,
    locationExceptions: null,
    lastError: null,
    lastFetchedAt: null,
    createdAt: "x",
    updatedAt: "x",
    ...overrides,
  };
}

function externalEvent(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    id: "e1",
    sourceId: "src1",
    userId: "u",
    uid: "uid1",
    title: "Meeting",
    start: "2026-06-08T07:00:00.000Z",
    end: "2026-06-08T08:00:00.000Z",
    allDay: false,
    ...overrides,
  };
}

describe("externalEventsToCalendarEvents", () => {
  it("maps a timed event onto a read-only external event", () => {
    const [event] = externalEventsToCalendarEvents(
      [externalEvent()],
      [source()],
    );
    expect(event).toEqual({
      kind: "external",
      id: "e1",
      title: "Meeting",
      start: new Date("2026-06-08T07:00:00.000Z"),
      end: new Date("2026-06-08T08:00:00.000Z"),
      editable: false,
      sourceId: "src1",
      uid: "uid1",
      busy: true,
      allDay: false,
      sourceName: "Work calendar",
      accent: "#00ff00",
    });
  });

  it("skips events of a disabled or missing source and all-day events", () => {
    const events = externalEventsToCalendarEvents(
      [
        externalEvent({ id: "disabled", sourceId: "off" }),
        externalEvent({ id: "orphan", sourceId: "nowhere" }),
        externalEvent({ id: "all-day", allDay: true }),
        externalEvent({ id: "kept" }),
      ],
      [source(), source({ id: "off", enabled: false })],
    );
    expect(events.map((e) => e.id)).toEqual(["kept"]);
  });

  it("resolves busy from the source mode flipped by its exceptions", () => {
    const events = externalEventsToCalendarEvents(
      [
        externalEvent({ id: "busy-default", uid: "a" }),
        externalEvent({ id: "busy-excepted", uid: "b" }),
        externalEvent({ id: "visual-default", sourceId: "vis", uid: "c" }),
        externalEvent({ id: "visual-excepted", sourceId: "vis", uid: "d" }),
      ],
      [
        source({ modeExceptions: JSON.stringify(["b"]) }),
        source({
          id: "vis",
          mode: "VISUAL",
          color: null,
          modeExceptions: JSON.stringify(["d"]),
        }),
      ],
    );
    expect(events.map((e) => [e.id, e.busy])).toEqual([
      ["busy-default", true],
      ["busy-excepted", false],
      ["visual-default", false],
      ["visual-excepted", true],
    ]);
    expect(events[2].accent).toBeNull();
  });
});
