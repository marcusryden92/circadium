import { buildCalendarEvents } from "../../../calendar-core/model/buildCalendarEvents";
import type {
  CategoryEvent,
  EventTemplate,
  ExternalCalendarSource,
  ExternalEvent,
  SimpleEvent,
  TravelEvent,
  WeekDayIntegers,
} from "../../../contracts";

const START = "2026-06-08T07:00:00.000Z";
const END = "2026-06-08T08:00:00.000Z";

const simple: SimpleEvent = {
  id: "s1",
  title: "Task",
  start: START,
  end: END,
  duration: 60,
  userId: "u",
  rrule: null,
  backgroundColor: "#111111",
  borderColor: "#222222",
  createdAt: "x",
  updatedAt: "x",
  extendedProps: null,
};

const template: EventTemplate = {
  id: "tpl-1",
  title: "Standup",
  startDay: 1 as WeekDayIntegers,
  startTime: "09:00",
  duration: 30,
  color: null,
  locationId: null,
  recurrenceExceptions: null,
  userId: "u",
  createdAt: "x",
  updatedAt: "x",
};

const categoryEvent: CategoryEvent = {
  id: "w1|2026-06-08",
  start: START,
  end: END,
  trespassingStart: false,
  trespassingEnd: false,
  categoryTimeWindowId: "w1",
  categoryId: "c1",
  userId: "u",
  createdAt: "x",
  updatedAt: "x",
};

const travelEvent: TravelEvent = {
  id: "t1",
  start: START,
  end: END,
  fromLocationId: null,
  toLocationId: null,
  travelMinutes: 10,
  requiredTravelMinutes: null,
  insufficientTravel: false,
  overconstrained: false,
  userId: "u",
  createdAt: "x",
  updatedAt: "x",
};

const externalSource: ExternalCalendarSource = {
  id: "src1",
  userId: "u",
  kind: "ICS",
  url: "https://example.invalid/cal.ics",
  name: "Work calendar",
  color: null,
  enabled: true,
  mode: "BUSY",
  modeExceptions: null,
  locationId: null,
  locationExceptions: null,
  lastError: null,
  lastFetchedAt: null,
  createdAt: "x",
  updatedAt: "x",
};

const externalEvent: ExternalEvent = {
  id: "e1",
  sourceId: "src1",
  userId: "u",
  uid: "uid1",
  title: "Meeting",
  start: START,
  end: END,
  allDay: false,
};

// The week of Monday June 8 2026.
const range = {
  start: new Date(2026, 5, 8, 0, 0),
  end: new Date(2026, 5, 15, 0, 0),
};

describe("buildCalendarEvents", () => {
  it("concatenates the five streams in their fixed order", () => {
    const events = buildCalendarEvents({
      calendar: [simple],
      templates: [template],
      categories: [{ id: "c1", name: "Work", color: null, isStrict: false }],
      categoryEvents: [categoryEvent],
      travelEvents: [travelEvent],
      locations: [],
      externalEvents: [externalEvent],
      externalSources: [externalSource],
      range,
    });
    expect(events.map((e) => [e.kind, e.id])).toEqual([
      ["planner", "s1"],
      ["template", "tpl-1|2026-06-08T09:00"],
      ["category", "w1|2026-06-08"],
      ["travel", "t1"],
      ["external", "e1"],
    ]);
  });

  it("treats missing inputs as empty", () => {
    expect(
      buildCalendarEvents({
        calendar: null,
        templates: undefined,
        categories: null,
        categoryEvents: null,
        travelEvents: null,
        locations: null,
        externalEvents: null,
        externalSources: null,
        range,
      }),
    ).toEqual([]);
  });
});
