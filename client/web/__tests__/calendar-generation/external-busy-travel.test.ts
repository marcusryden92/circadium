import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { deriveExternalBusyEvents } from "@/utils/external-calendar/deriveExternalBusyEvents";
import { serializeLocationExceptions } from "@/utils/external-calendar/locationExceptions";
import {
  ExternalCalendarKind,
  ExternalCalendarMode,
  type EventTemplate,
  type ExternalCalendarSource,
  type ExternalEvent,
  type TravelEvent,
} from "@/types/prisma";

// A located imported busy block behaves like a fixed anchor pinned to that
// location: the static travel pass injects travel legs around it. This proves
// the whole point of ExternalCalendarSource.locationId — importing a shift and
// getting travel scheduled to/from it.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const HOME = "loc-home";
const BAR = "loc-hotel-bar";
const TRAVEL_MINUTES = 30;

// Home-anchored sleep gives the night before/after a HOME location, so a
// BAR-located daytime block sits between two HOME anchors.
const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: HOME,
  recurrenceExceptions: null,
  createdAt: FAKE_TODAY.toISOString(),
  updatedAt: FAKE_TODAY.toISOString(),
})) as unknown as EventTemplate[];

const travelEntry = (from: string, to: string) => ({
  fromLocationId: from,
  toLocationId: to,
  rushHourMinutes: TRAVEL_MINUTES,
  regularMinutes: TRAVEL_MINUTES,
  nightMinutes: TRAVEL_MINUTES,
});
const TRAVEL_MATRIX = new Map([
  [`${HOME}->${BAR}`, travelEntry(HOME, BAR)],
  [`${BAR}->${HOME}`, travelEntry(BAR, HOME)],
]);

const SOURCE: ExternalCalendarSource = {
  id: "src-1",
  userId: USER_ID,
  kind: ExternalCalendarKind.ICS,
  url: "https://app.quinyx.com/webcal/?id=x",
  name: "Quinyx shifts",
  color: null,
  enabled: true,
  mode: ExternalCalendarMode.BUSY,
  modeExceptions: null,
  locationId: null,
  locationExceptions: null,
  lastFetchedAt: null,
  lastError: null,
  createdAt: FAKE_TODAY.toISOString(),
  updatedAt: FAKE_TODAY.toISOString(),
};

// A midday Monday shift with morning/evening gaps around it for travel legs.
const SHIFT: ExternalEvent = {
  id: `src-1|shift-1|2026-01-05T10:00:00.000Z`,
  sourceId: "src-1",
  userId: USER_ID,
  uid: "shift-1",
  title: "Bar shift",
  start: new Date("2026-01-05T10:00:00").toISOString(),
  end: new Date("2026-01-05T17:00:00").toISOString(),
  allDay: false,
};

let consoleSpies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  jest.setSystemTime(FAKE_TODAY);
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "info").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  jest.useRealTimers();
});

function run(source: ExternalCalendarSource) {
  const busy = deriveExternalBusyEvents([source], [SHIFT]);
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, [], [], {
    injectTravelEvents: true,
    travelTimeMatrix: TRAVEL_MATRIX,
    externalBusyEvents: busy,
  });
}

function barLegs(travelEvents: TravelEvent[]) {
  return travelEvents.filter(
    (t) => t.fromLocationId === BAR || t.toLocationId === BAR,
  );
}

describe("travel around located external busy blocks", () => {
  it("a source location makes the scheduler inject travel to and from the shift", () => {
    const { travelEvents } = run({ ...SOURCE, locationId: BAR });
    const legs = barLegs(travelEvents);
    expect(legs.some((t) => t.toLocationId === BAR)).toBe(true); // inbound
    expect(legs.some((t) => t.fromLocationId === BAR)).toBe(true); // outbound
  });

  it("no source location means no travel around the block (Anywhere)", () => {
    const { travelEvents } = run(SOURCE);
    expect(barLegs(travelEvents)).toHaveLength(0);
  });

  it("a per-event Anywhere override cancels travel despite the source default", () => {
    const { travelEvents } = run({
      ...SOURCE,
      locationId: BAR,
      locationExceptions: serializeLocationExceptions({ "shift-1": null }),
    });
    expect(barLegs(travelEvents)).toHaveLength(0);
  });
});
