import {
  deriveExternalBusyEvents,
  isExternalEventBusy,
} from "@/utils/external-calendar/deriveExternalBusyEvents";
import {
  parseModeExceptions,
  serializeModeExceptions,
  toggleModeException,
} from "@/utils/external-calendar/modeExceptions";
import {
  parseLocationExceptions,
  serializeLocationExceptions,
  setLocationException,
  clearLocationException,
  resolveExternalEventLocation,
  hasLocationException,
} from "@/utils/external-calendar/locationExceptions";
import {
  ExternalCalendarKind,
  ExternalCalendarMode,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "@/types/prisma";

function makeSource(
  overrides: Partial<ExternalCalendarSource> = {},
): ExternalCalendarSource {
  return {
    id: "src-1",
    userId: "user-1",
    kind: ExternalCalendarKind.ICS,
    url: "https://example.com/cal.ics",
    name: "Test feed",
    color: null,
    enabled: true,
    mode: ExternalCalendarMode.BUSY,
    modeExceptions: null,
    locationId: null,
    locationExceptions: null,
    lastFetchedAt: null,
    lastError: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    id: "src-1|uid-1|2026-07-10T12:00:00.000Z",
    sourceId: "src-1",
    userId: "user-1",
    uid: "uid-1",
    title: "Dentist",
    start: "2026-07-10T12:00:00.000Z",
    end: "2026-07-10T13:00:00.000Z",
    allDay: false,
    ...overrides,
  };
}

describe("deriveExternalBusyEvents", () => {
  it("includes a BUSY source's events as SimpleEvent-shaped external blocks", () => {
    const busy = deriveExternalBusyEvents([makeSource()], [makeEvent()]);

    expect(busy).toHaveLength(1);
    expect(busy[0].id).toBe("src-1|uid-1|2026-07-10T12:00:00.000Z");
    expect(busy[0].duration).toBe(60);
    expect(busy[0].extendedProps?.eventType).toBe("external");
  });

  it("an exception on a BUSY source makes the event visual-only", () => {
    const source = makeSource({
      modeExceptions: serializeModeExceptions(["uid-1"]),
    });
    expect(deriveExternalBusyEvents([source], [makeEvent()])).toHaveLength(0);
  });

  it("a VISUAL source blocks nothing except excepted events", () => {
    const visual = makeSource({ mode: ExternalCalendarMode.VISUAL });
    expect(deriveExternalBusyEvents([visual], [makeEvent()])).toHaveLength(0);

    const withException = makeSource({
      mode: ExternalCalendarMode.VISUAL,
      modeExceptions: serializeModeExceptions(["uid-1"]),
    });
    expect(
      deriveExternalBusyEvents([withException], [makeEvent()]),
    ).toHaveLength(1);
  });

  it("disabled sources, all-day events, and orphaned events never block", () => {
    expect(
      deriveExternalBusyEvents([makeSource({ enabled: false })], [makeEvent()]),
    ).toHaveLength(0);
    expect(
      deriveExternalBusyEvents(
        [makeSource()],
        [makeEvent({ allDay: true })],
      ),
    ).toHaveLength(0);
    expect(
      deriveExternalBusyEvents(
        [makeSource()],
        [makeEvent({ sourceId: "gone" })],
      ),
    ).toHaveLength(0);
  });

  it("stamps no location by default", () => {
    const busy = deriveExternalBusyEvents([makeSource()], [makeEvent()]);
    expect(busy[0].extendedProps?.locationId).toBeNull();
  });

  it("stamps the source's default location on every event", () => {
    const source = makeSource({ locationId: "loc-hotel" });
    const busy = deriveExternalBusyEvents([source], [makeEvent()]);
    expect(busy[0].extendedProps?.locationId).toBe("loc-hotel");
  });

  it("a per-event override wins over the source default", () => {
    const source = makeSource({
      locationId: "loc-hotel",
      locationExceptions: serializeLocationExceptions({ "uid-1": "loc-branch" }),
    });
    const busy = deriveExternalBusyEvents(
      [source],
      [makeEvent(), makeEvent({ id: "src-1|uid-2|x", uid: "uid-2" })],
    );
    const byUid = new Map(
      busy.map((b) => [b.id, b.extendedProps?.locationId]),
    );
    expect(byUid.get("src-1|uid-1|2026-07-10T12:00:00.000Z")).toBe("loc-branch");
    expect(byUid.get("src-1|uid-2|x")).toBe("loc-hotel");
  });

  it("a null per-event override pins the event to Anywhere despite a source default", () => {
    const source = makeSource({
      locationId: "loc-hotel",
      locationExceptions: serializeLocationExceptions({ "uid-1": null }),
    });
    const busy = deriveExternalBusyEvents([source], [makeEvent()]);
    expect(busy[0].extendedProps?.locationId).toBeNull();
  });

  it("isExternalEventBusy agrees with the derivation", () => {
    const busySource = makeSource();
    const exceptedSource = makeSource({
      modeExceptions: serializeModeExceptions(["uid-1"]),
    });
    expect(isExternalEventBusy(busySource, makeEvent())).toBe(true);
    expect(isExternalEventBusy(exceptedSource, makeEvent())).toBe(false);
    expect(isExternalEventBusy(busySource, makeEvent({ allDay: true }))).toBe(
      false,
    );
  });
});

describe("modeExceptions", () => {
  it("round-trips and toggles", () => {
    expect(parseModeExceptions(null)).toEqual([]);
    expect(parseModeExceptions("not json")).toEqual([]);
    expect(serializeModeExceptions([])).toBeNull();

    const once = toggleModeException(null, "uid-1");
    expect(parseModeExceptions(once)).toEqual(["uid-1"]);
    const twice = toggleModeException(once, "uid-1");
    expect(twice).toBeNull();

    const mixed = toggleModeException(once, "uid-2");
    expect(parseModeExceptions(mixed)).toEqual(["uid-1", "uid-2"]);
  });
});

describe("locationExceptions", () => {
  it("parses defensively", () => {
    expect(parseLocationExceptions(null)).toEqual({});
    expect(parseLocationExceptions("not json")).toEqual({});
    expect(parseLocationExceptions("[1,2]")).toEqual({});
    expect(parseLocationExceptions('{"a":1,"b":"loc","c":null}')).toEqual({
      b: "loc",
      c: null,
    });
    expect(serializeLocationExceptions({})).toBeNull();
  });

  it("sets, clears, and resolves overrides, distinguishing null from absent", () => {
    const source = { locationId: "loc-default", locationExceptions: null as string | null };

    // Absent → inherits the source default.
    expect(resolveExternalEventLocation(source, "uid-1")).toBe("loc-default");
    expect(hasLocationException(source.locationExceptions, "uid-1")).toBe(false);

    // Pinned to a specific location.
    source.locationExceptions = setLocationException(
      source.locationExceptions,
      "uid-1",
      "loc-branch",
    );
    expect(resolveExternalEventLocation(source, "uid-1")).toBe("loc-branch");
    expect(hasLocationException(source.locationExceptions, "uid-1")).toBe(true);

    // Explicit Anywhere override — present key, null value, beats the default.
    source.locationExceptions = setLocationException(
      source.locationExceptions,
      "uid-2",
      null,
    );
    expect(resolveExternalEventLocation(source, "uid-2")).toBeNull();
    expect(hasLocationException(source.locationExceptions, "uid-2")).toBe(true);

    // Clearing falls back to the source default again.
    source.locationExceptions = clearLocationException(
      source.locationExceptions,
      "uid-1",
    );
    expect(resolveExternalEventLocation(source, "uid-1")).toBe("loc-default");
    expect(hasLocationException(source.locationExceptions, "uid-1")).toBe(false);
  });
});
