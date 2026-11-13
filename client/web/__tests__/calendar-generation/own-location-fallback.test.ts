import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { serializeTaskSplitting } from "@/utils/taskSplitting";
import type { Category, EventTemplate, Planner } from "@/types/prisma";

// Location resolution for tasks that carry an own locationId while
// useParentLocation is true. Historically resolveLocation dropped straight to
// "Anywhere" (ancestor/category yielded nothing), so the item scheduled
// location-less and got NO travel around it even though the UI showed a real
// location. resolveLocation now falls back to the item's own locationId when
// there is nothing to inherit — but a genuinely inheritable category location
// still wins, preserving the inherit semantics.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // Monday morning
const USER_ID = "test-user";
const HOME = "loc-home";
const WORK = "loc-work";
const GYM = "loc-gym";
const TRAVEL_MINUTES = 30;
const BUFFER_MINUTES = 10;

const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: HOME,
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
const TRAVEL_MATRIX = new Map(
  [
    [HOME, WORK],
    [WORK, HOME],
    [HOME, GYM],
    [GYM, HOME],
    [WORK, GYM],
    [GYM, WORK],
  ].map(([a, b]) => [`${a}->${b}`, travelEntry(a, b)]),
);

function makePlanner(id: string, overrides: Partial<Planner>): Planner {
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

function runWithTravel(planners: Planner[], categories: Category[] = []) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    injectTravelEvents: true,
    travelTimeMatrix: TRAVEL_MATRIX,
    bufferTimeMinutes: BUFFER_MINUTES,
    categories,
  });
}

function travelCount(
  travelEvents: { fromLocationId: string | null; toLocationId: string | null }[],
  from: string,
  to: string,
) {
  return travelEvents.filter(
    (t) => t.fromLocationId === from && t.toLocationId === to,
  ).length;
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

describe("own-location fallback when useParentLocation has nothing to inherit", () => {
  it("a WORK task with useParentLocation=true and no inheritable location gets travel (self-heal)", () => {
    const work = makePlanner("work-task", {
      duration: 120,
      locationId: WORK,
      useParentLocation: true, // no ancestor, no category -> nothing to inherit
      priority: 6,
    });
    const home = makePlanner("home-task", {
      duration: 90,
      locationId: HOME,
      priority: 5,
    });

    const { travelEvents } = runWithTravel([work, home]);

    // Before the fix this was 0/0 (WORK resolved to "Anywhere").
    expect(travelCount(travelEvents, HOME, WORK)).toBeGreaterThanOrEqual(1);
    expect(travelCount(travelEvents, WORK, HOME)).toBeGreaterThanOrEqual(1);
  });

  it("a SPLIT WORK task with useParentLocation=true and no inheritable location gets travel", () => {
    const work = makePlanner("work-split", {
      duration: 120,
      locationId: WORK,
      useParentLocation: true,
      priority: 6,
      splitting: serializeTaskSplitting({
        minMinutes: 60,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });
    const home = makePlanner("home-task", {
      duration: 90,
      locationId: HOME,
      priority: 5,
    });

    const { travelEvents } = runWithTravel([work, home]);

    expect(travelCount(travelEvents, HOME, WORK)).toBeGreaterThanOrEqual(1);
    expect(travelCount(travelEvents, WORK, HOME)).toBeGreaterThanOrEqual(1);
  });

  it("a genuinely inheritable category location still wins over the item's own locationId", () => {
    // Task carries locationId=WORK but useParentLocation=true, filed under a
    // category whose location is GYM. Inheritance must win: travel is to/from
    // GYM, never WORK.
    const category: Category = {
      id: "cat-gym",
      name: "Gym things",
      icon: null,
      color: "#000000",
      sortOrder: 0,
      parentId: null,
      useTimeWindows: false,
      isStrict: false,
      confineToOwnWindows: false,
      locationId: GYM,
      userId: USER_ID,
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
      timeSlots: [],
    } as unknown as Category;

    const task = makePlanner("cat-task", {
      duration: 120,
      locationId: WORK, // own value, but should be ignored in favor of GYM
      useParentLocation: true,
      categoryId: "cat-gym",
      priority: 6,
    });
    const home = makePlanner("home-task", {
      duration: 90,
      locationId: HOME,
      priority: 5,
    });

    const { travelEvents } = runWithTravel([task, home], [category]);

    // Inherits GYM, not its own WORK.
    expect(travelCount(travelEvents, HOME, GYM)).toBeGreaterThanOrEqual(1);
    expect(travelCount(travelEvents, WORK, HOME)).toBe(0);
    expect(travelCount(travelEvents, HOME, WORK)).toBe(0);
  });
});
