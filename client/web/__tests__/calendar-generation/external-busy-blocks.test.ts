import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { deriveExternalBusyEvents } from "@/utils/external-calendar/deriveExternalBusyEvents";
import { serializeModeExceptions } from "@/utils/external-calendar/modeExceptions";
import {
  ExternalCalendarKind,
  ExternalCalendarMode,
  type Category,
  type ExternalCalendarSource,
  type ExternalEvent,
  type EventTemplate,
  type Planner,
  type SimpleEvent,
} from "@/types/prisma";

// Imported external-calendar events resolved to busy blocks must subtract
// from the free-slot fabric like any fixed event, while never leaking into
// the engine's persisted output. The mode/exception resolution runs through
// the real deriveExternalBusyEvents so this exercises the actual pipeline.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";

// Nightly sleep gives the week occupied structure — without it the fabric has
// no gaps and nothing schedules. Daytime 06:00-22:00 stays Available.
const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  recurrenceExceptions: null,
  createdAt: FAKE_TODAY.toISOString(),
  updatedAt: FAKE_TODAY.toISOString(),
})) as unknown as EventTemplate[];

function makeTask(id: string, overrides: Partial<Planner> = {}): Planner {
  const ts = FAKE_TODAY.toISOString();
  return {
    id,
    title: id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: null,
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
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

// Blocks the whole remaining Monday daytime (08:00-22:00 local).
const BLOCK_START = new Date("2026-01-05T08:00:00");
const BLOCK_END = new Date("2026-01-05T22:00:00");

const SOURCE: ExternalCalendarSource = {
  id: "src-1",
  userId: USER_ID,
  kind: ExternalCalendarKind.ICS,
  url: "https://example.com/cal.ics",
  name: "Work feed",
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

const EXTERNAL_EVENT: ExternalEvent = {
  id: `src-1|uid-1|${BLOCK_START.toISOString()}`,
  sourceId: "src-1",
  userId: USER_ID,
  uid: "uid-1",
  title: "Offsite",
  start: BLOCK_START.toISOString(),
  end: BLOCK_END.toISOString(),
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

function run(
  planners: Planner[],
  externalBusyEvents: SimpleEvent[],
  prevCalendar: SimpleEvent[] = [],
) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, prevCalendar, {
    injectTravelEvents: false,
    externalBusyEvents,
  });
}

function findEvent(events: SimpleEvent[], id: string): SimpleEvent {
  const event = events.find((e) => e.id === id);
  expect(event).toBeDefined();
  return event!;
}

function overlaps(event: SimpleEvent, start: Date, end: Date): boolean {
  return (
    new Date(event.start).getTime() < end.getTime() &&
    new Date(event.end).getTime() > start.getTime()
  );
}

describe("external busy blocks", () => {
  it("a busy block keeps the span free; the exception frees it again", () => {
    const task = makeTask("task-a");

    const blocked = deriveExternalBusyEvents([SOURCE], [EXTERNAL_EVENT]);
    expect(blocked).toHaveLength(1);
    const { events: blockedEvents } = run([task], blocked);
    const placedBlocked = findEvent(blockedEvents, "task-a");
    expect(overlaps(placedBlocked, BLOCK_START, BLOCK_END)).toBe(false);

    // Same feed with the event excepted resolves to zero busy blocks, and
    // the task lands inside the previously blocked Monday span.
    const excepted = deriveExternalBusyEvents(
      [{ ...SOURCE, modeExceptions: serializeModeExceptions(["uid-1"]) }],
      [EXTERNAL_EVENT],
    );
    expect(excepted).toHaveLength(0);
    const { events: freeEvents } = run([task], excepted);
    const placedFree = findEvent(freeEvents, "task-a");
    expect(overlaps(placedFree, BLOCK_START, BLOCK_END)).toBe(true);
  });

  it("external blocks never appear in the engine's persisted output", () => {
    const task = makeTask("task-a");
    const blocked = deriveExternalBusyEvents([SOURCE], [EXTERNAL_EVENT]);

    const { events } = run([task], blocked);

    expect(events.some((e) => e.id === EXTERNAL_EVENT.id)).toBe(false);
    expect(
      events.some((e) => e.extendedProps?.eventType === "external"),
    ).toBe(false);
  });

  it("an idle regen with the same blocks re-emits identical placements", () => {
    const task = makeTask("task-a");
    const blocked = deriveExternalBusyEvents([SOURCE], [EXTERNAL_EVENT]);

    const first = run([task], blocked);
    const second = run([task], blocked, first.events);

    const firstById = new Map(first.events.map((e) => [e.id, e]));
    expect(second.events).toHaveLength(first.events.length);
    for (const event of second.events) {
      const prev = firstById.get(event.id);
      expect(prev).toBeDefined();
      expect(event.start).toBe(prev!.start);
      expect(event.end).toBe(prev!.end);
    }
  });

  it("a realistic feed (many rows, overlaps, past events, beyond-horizon events) still places every task", () => {
    const feedEvents: ExternalEvent[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    const push = (uid: string, start: Date, end: Date) => {
      feedEvents.push({
        id: `${SOURCE.id}|${uid}|${start.toISOString()}`,
        sourceId: SOURCE.id,
        userId: USER_ID,
        uid,
        title: uid,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
      });
    };
    for (let offset = -30; offset <= 180; offset++) {
      const day = new Date(FAKE_TODAY.getTime() + offset * dayMs);
      const at = (h: number, m = 0) => {
        const d = new Date(day);
        d.setHours(h, m, 0, 0);
        return d;
      };
      const weekday = day.getDay();
      if (weekday !== 0 && weekday !== 6) {
        push("standup", at(9, 0), at(9, 30));
        push("sync", at(13, 0), at(14, 0));
        // Overlapping pair, like double-booked meetings.
        push("review", at(13, 30), at(15, 0));
      }
      if (weekday === 3) {
        // Crosses midnight.
        push(
          "late-shift",
          at(20, 0),
          new Date(at(20, 0).getTime() + 6 * 3600000),
        );
      }
    }

    const tasks = [
      makeTask("task-a"),
      makeTask("task-b", { duration: 90 }),
      makeTask("task-c", { duration: 120 }),
    ];
    const busy = deriveExternalBusyEvents([SOURCE], feedEvents);
    expect(busy.length).toBeGreaterThan(300);

    const { events } = run(tasks, busy);
    for (const task of tasks) {
      expect(events.some((e) => e.id === task.id)).toBe(true);
    }
    expect(
      events.some((e) => e.extendedProps?.eventType === "external"),
    ).toBe(false);
  });

  it("blocks straddling category-window boundaries do not blank the output", () => {
    const category = {
      id: "category-work",
      name: "Work",
      parentId: null,
      icon: null,
      color: "#4a6fa5",
      sortOrder: 0,
      useTimeWindows: true,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: null,
      userId: USER_ID,
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
      timeSlots: [1, 2, 3, 4, 5].map((day) => ({
        id: `window-${day}`,
        categoryId: "category-work",
        day,
        startTime: "09:00",
        endTime: "17:00",
        recurrenceExceptions: null,
        userId: USER_ID,
      })),
    } as unknown as Category;

    const feedEvents: ExternalEvent[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    for (let offset = 0; offset <= 35; offset++) {
      const day = new Date(FAKE_TODAY.getTime() + offset * dayMs);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const at = (h: number, m = 0) => {
        const d = new Date(day);
        d.setHours(h, m, 0, 0);
        return d;
      };
      const push = (uid: string, start: Date, end: Date) => {
        feedEvents.push({
          id: `${SOURCE.id}|${uid}|${start.toISOString()}`,
          sourceId: SOURCE.id,
          userId: USER_ID,
          uid,
          title: uid,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
        });
      };
      push("straddle-start", at(8, 30), at(9, 30));
      push("inside", at(11, 0), at(12, 0));
      push("straddle-end", at(16, 30), at(17, 30));
    }

    const tasks = [
      makeTask("work-task", { categoryId: "category-work", duration: 90 }),
      makeTask("free-task", { duration: 60 }),
    ];
    const busy = deriveExternalBusyEvents([SOURCE], feedEvents);

    const result = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      tasks,
      [],
      {
        injectTravelEvents: false,
        categories: [category],
        externalBusyEvents: busy,
      },
    );

    expect(result.categoryEvents.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(result.events.some((e) => e.id === task.id)).toBe(true);
    }
  });
});
