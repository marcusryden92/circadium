import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  EventTemplate,
  Planner,
  SimpleEvent,
  EngineMessage,
} from "@/types/prisma";

// Trespass markers: overlapping items whose locations differ get red border
// flags (trespassingStart/trespassingEnd on extendedProps, persisted columns
// since add_event_trespass_flags) and a LOCATION_OVERLAP console row. Guards
// the June-2026 regression where template occurrences left the assembled
// event list and took item-over-template detection with them.
const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday

const USER_ID = "test-user";

function makePlan(
  id: string,
  starts: Date,
  locationId: string | null,
  duration = 60,
): Planner {
  const ts = FAKE_TODAY.toISOString();
  return {
    id,
    title: `Plan ${id}`,
    parentId: null,
    plannerType: "plan",
    isReady: true,
    isTriaged: true,
    duration,
    deadline: null,
    starts: starts.toISOString(),
    recurrence: null,
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 5,
    userId: USER_ID,
    color: null,
    locationId,
    useParentLocation: false,
    categoryId: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

function makeTemplate(
  id: string,
  startDay: number,
  startTime: string,
  duration: number,
  locationId: string | null,
): EventTemplate {
  const ts = FAKE_TODAY.toISOString();
  return {
    id,
    title: `Template ${id}`,
    startDay: startDay as EventTemplate["startDay"],
    startTime,
    duration,
    color: null,
    locationId,
    recurrenceExceptions: null,
    userId: USER_ID,
    createdAt: ts,
    updatedAt: ts,
  };
}

function trespassFlags(event: SimpleEvent | undefined): {
  trespassingStart?: boolean;
  trespassingEnd?: boolean;
} {
  return (event?.extendedProps ?? {}) as {
    trespassingStart?: boolean;
    trespassingEnd?: boolean;
  };
}

function overlapMessages(messages: EngineMessage[]) {
  return messages.filter((m) => m.type === "LOCATION_OVERLAP");
}

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

function runGenerate(
  planners: Planner[],
  templates: EventTemplate[] = [],
  prevCalendar: SimpleEvent[] = [],
) {
  return generateCalendar(USER_ID, 1, templates, planners, prevCalendar, {
    categories: [],
    injectTravelEvents: false,
  });
}

// Tuesday Jan 6 2026, local wall-clock times.
const tue = (time: string) => new Date(`2026-01-06T${time}:00`);

describe("plan-vs-plan trespass", () => {
  it("marks the infringing side and emits one LOCATION_OVERLAP row", () => {
    const planners = [
      makePlan("plan-a", tue("10:00"), "loc-a"),
      makePlan("plan-b", tue("10:30"), "loc-b"),
    ];

    const { events, messages } = runGenerate(planners);
    const byId = new Map(events.map((e) => [e.id, e]));

    // A runs into B: A's bottom border reads red, and both events carry
    // explicit booleans (persisted columns — absent keys would phantom-diff
    // against DB rows).
    expect(trespassFlags(byId.get("plan-a"))).toMatchObject({
      trespassingStart: false,
      trespassingEnd: true,
    });
    expect(trespassFlags(byId.get("plan-b"))).toMatchObject({
      trespassingStart: false,
      trespassingEnd: false,
    });

    const rows = overlapMessages(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0].tone).toBe("fail");
    expect(rows[0].payload).toMatchObject({
      type: "LOCATION_OVERLAP",
      firstKind: "planner",
      firstId: "plan-a",
      secondKind: "planner",
      secondId: "plan-b",
      firstLocationId: "loc-a",
      secondLocationId: "loc-b",
      affectedCount: 1,
    });
  });

  it("same-location overlap is not a trespass", () => {
    const planners = [
      makePlan("plan-a", tue("10:00"), "loc-a"),
      makePlan("plan-b", tue("10:30"), "loc-a"),
    ];

    const { events, messages } = runGenerate(planners);
    const byId = new Map(events.map((e) => [e.id, e]));

    expect(trespassFlags(byId.get("plan-a")).trespassingEnd).toBe(false);
    expect(overlapMessages(messages)).toHaveLength(0);
  });
});

describe("plan-vs-template trespass", () => {
  // Template Tuesday 09:00-17:00 at loc-b; startDay 2 = Tuesday (JS getDay).
  const workTemplate = makeTemplate("tpl-work", 2, "09:00", 480, "loc-b");

  it("a plan inside a different-location template block gets both borders and a row", () => {
    const planners = [makePlan("plan-a", tue("10:00"), "loc-a")];

    const { events, messages } = runGenerate(planners, [workTemplate]);
    const byId = new Map(events.map((e) => [e.id, e]));

    expect(trespassFlags(byId.get("plan-a"))).toMatchObject({
      trespassingStart: true,
      trespassingEnd: true,
    });

    const rows = overlapMessages(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      type: "LOCATION_OVERLAP",
      firstKind: "planner",
      firstId: "plan-a",
      secondKind: "template",
      secondId: "tpl-work",
      firstLocationId: "loc-a",
      secondLocationId: "loc-b",
    });
  });

  it("a plan straddling the template's end gets a start border only", () => {
    const planners = [makePlan("plan-a", tue("16:30"), "loc-a")];

    const { events } = runGenerate(planners, [workTemplate]);
    const byId = new Map(events.map((e) => [e.id, e]));

    expect(trespassFlags(byId.get("plan-a"))).toMatchObject({
      trespassingStart: true,
      trespassingEnd: false,
    });
  });

  it("an Anywhere template never conflicts", () => {
    const anywhere = makeTemplate("tpl-any", 2, "09:00", 480, null);
    const planners = [makePlan("plan-a", tue("10:00"), "loc-a")];

    const { events, messages } = runGenerate(planners, [anywhere]);
    const byId = new Map(events.map((e) => [e.id, e]));

    expect(trespassFlags(byId.get("plan-a")).trespassingStart).toBe(false);
    expect(overlapMessages(messages)).toHaveLength(0);
  });

  it("weekly recurrence of the same conflict folds into one row with a count", () => {
    const recurring = makePlan("plan-a", tue("10:00"), "loc-a");
    recurring.recurrence = JSON.stringify({
      freq: "weekly",
      interval: 1,
      until: null,
    });

    const { messages } = runGenerate([recurring], [workTemplate]);

    const rows = overlapMessages(messages);
    expect(rows).toHaveLength(1);
    const payload = rows[0].payload as { affectedCount: number };
    expect(payload.affectedCount).toBeGreaterThan(1);
  });
});

describe("flag lifecycle across regens", () => {
  it("clears persisted flags once the overlap is resolved", () => {
    const overlapping = [
      makePlan("plan-a", tue("10:00"), "loc-a"),
      makePlan("plan-b", tue("10:30"), "loc-b"),
    ];
    const first = runGenerate(overlapping);
    expect(trespassFlags(first.events[0]).trespassingEnd).toBe(true);

    // Move plan-b out of the way; the previous calendar still carries the
    // stale trespassingEnd on plan-a's row.
    const resolved = [
      makePlan("plan-a", tue("10:00"), "loc-a"),
      makePlan("plan-b", tue("14:00"), "loc-b"),
    ];
    const second = runGenerate(resolved, [], first.events);
    const byId = new Map(second.events.map((e) => [e.id, e]));

    expect(trespassFlags(byId.get("plan-a"))).toMatchObject({
      trespassingStart: false,
      trespassingEnd: false,
    });
    expect(overlapMessages(second.messages)).toHaveLength(0);
  });

  it("an idle regen re-emits identical flags and rows", () => {
    const planners = [
      makePlan("plan-a", tue("10:00"), "loc-a"),
      makePlan("plan-b", tue("10:30"), "loc-b"),
    ];
    const first = runGenerate(planners);
    const second = runGenerate(planners, [], first.events);

    const firstById = new Map(first.events.map((e) => [e.id, e]));
    for (const event of second.events) {
      expect(trespassFlags(event)).toEqual(
        trespassFlags(firstById.get(event.id)),
      );
    }
    expect(overlapMessages(second.messages).map((m) => m.id)).toEqual(
      overlapMessages(first.messages).map((m) => m.id),
    );
  });
});
