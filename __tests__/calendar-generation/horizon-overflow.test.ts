import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";

// The horizon expands on demand until every placeable item is scheduled, and
// the per-item slot finder can reach any slot expansion builds. Regressions for
// (1) the finder's fixed afterDate+N day cap hiding already-built slots, and
// (2) the outer loop's fixed expansion ceiling stopping short of a far item.
// Both used to fail items with "No available time slots within the search
// horizon" while free space sat further out.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // Monday
const USER_ID = "test-user";
const DAY = 24 * 60 * 60 * 1000;

const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  createdAt: FAKE_TODAY.toISOString(),
  updatedAt: FAKE_TODAY.toISOString(),
})) as unknown as EventTemplate[];

function makePlanner(id: string, overrides: Partial<Planner> = {}): Planner {
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

// A full-day plan (06:00-22:00) that, together with the 22:00-06:00 sleep
// template, leaves no free time on its day.
function fullDayPlan(dayOffset: number): Planner {
  const start = new Date(FAKE_TODAY.getTime() + dayOffset * DAY);
  start.setHours(6, 0, 0, 0);
  return makePlanner(`fill-${dayOffset}`, {
    plannerType: "plan",
    starts: start.toISOString(),
    duration: 16 * 60,
  });
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

describe("horizon overflow — finder reaches expanded fabric", () => {
  it("places a today-anchored task in free space past the 90-day mark", () => {
    // Days 0-94 are fully occupied by plans + sleep, so the only room for the
    // unbounded victim task is day 95+ — well past the old 90-day finder cap.
    const FILL_DAYS = 95;
    const fillers: Planner[] = [];
    for (let d = 0; d < FILL_DAYS; d++) fillers.push(fullDayPlan(d));

    const victim = makePlanner("victim", { duration: 60 });
    const planner = [...fillers, victim];

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      planner,
      [],
      { injectTravelEvents: false },
    );

    const victimEvent = events.find(
      (e: SimpleEvent) => plannerIdFromEventId(e.id) === "victim",
    );
    const unschedulable = messages.filter(
      (m) =>
        m.type === "TASK_UNSCHEDULABLE" &&
        (m.payload as { plannerId?: string })?.plannerId === "victim",
    );

    expect(unschedulable).toEqual([]);
    expect(victimEvent).toBeDefined();
    const startOffsetDays =
      (new Date(victimEvent!.start).getTime() - FAKE_TODAY.getTime()) / DAY;
    // Proves the finder scanned past the old 90-day ceiling into fabric that
    // horizon expansion built.
    expect(startOffsetDays).toBeGreaterThan(90);
  });

  it("expands the horizon as far as needed to place a far-future item", () => {
    // ~400 days out — well past the old fixed 336/392-day expansion ceiling.
    // The scheduler must keep marching the horizon out to the item's earliest
    // start instead of giving up at a fixed number of expansions.
    const targetOffset = 400;
    const target = new Date(FAKE_TODAY.getTime() + targetOffset * DAY);
    target.setHours(0, 0, 0, 0);

    const nearTerm = makePlanner("near", { duration: 60 });
    const farItem = makePlanner("far", {
      duration: 60,
      earliestStartDate: target.toISOString(),
    });

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [nearTerm, farItem],
      [],
      { injectTravelEvents: false },
    );

    const farEvent = events.find(
      (e: SimpleEvent) => plannerIdFromEventId(e.id) === "far",
    );
    const unschedulable = messages.filter(
      (m) =>
        m.type === "TASK_UNSCHEDULABLE" &&
        (m.payload as { plannerId?: string })?.plannerId === "far",
    );

    expect(unschedulable).toEqual([]);
    expect(farEvent).toBeDefined();
    expect(new Date(farEvent!.start).getTime()).toBeGreaterThanOrEqual(
      target.getTime(),
    );
  });
});
