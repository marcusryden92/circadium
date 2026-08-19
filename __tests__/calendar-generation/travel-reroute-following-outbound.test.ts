import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  TravelEvent,
} from "@/types/prisma";

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday morning
const MONDAY = 1;
const USER_ID = "test-user";
const HOME = "loc-home";
const SCHOOL = "loc-school";
const GYM = "loc-gym";
const CATEGORY_ID = "category-fitness";
const TRAVEL_MINUTES = 15;
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
const PAIRS: Array<[string, string]> = [
  [HOME, SCHOOL],
  [SCHOOL, HOME],
  [HOME, GYM],
  [GYM, HOME],
  [SCHOOL, GYM],
  [GYM, SCHOOL],
];
const TRAVEL_MATRIX = new Map(
  PAIRS.map(([from, to]) => [`${from}->${to}`, travelEntry(from, to)]),
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
  } as Planner;
}

function makeFitnessCategory(): Category {
  const ts = FAKE_TODAY.toISOString();
  return {
    id: CATEGORY_ID,
    name: "Fitness",
    icon: null,
    color: null,
    sortOrder: 0,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    locationId: GYM,
    parentId: null,
    userId: USER_ID,
    createdAt: ts,
    updatedAt: ts,
    timeSlots: [
      {
        id: "win-fitness-monday",
        day: MONDAY,
        startTime: "17:00",
        endTime: "18:00",
        recurrenceExceptions: null,
        categoryId: CATEGORY_ID,
        userId: USER_ID,
      } as CategoryTimeWindow,
    ],
  } as Category;
}

function run(planners: Planner[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    categories: [makeFitnessCategory()],
    injectTravelEvents: true,
    travelTimeMatrix: TRAVEL_MATRIX,
    bufferTimeMinutes: BUFFER_MINUTES,
    // Pure earliest-slot scoring: in a real schedule contention pins the task
    // into the gap; in this minimal fixture location grouping would pull it
    // to a travel-free slot instead, and slot choice is not what's under test.
    strategyWeights: { earliestSlot: 1, locationGrouping: 0, fitTightness: 0 },
  });
}

// The Fitness window recurs weekly across the horizon, so later Mondays
// carry their own legs; assertions scope to the first Monday.
const DAY_START = new Date("2026-01-05T00:00:00").getTime();
const DAY_END = new Date("2026-01-06T00:00:00").getTime();

function mondayLegs(travelEvents: TravelEvent[]) {
  return travelEvents.filter((t) => {
    const start = new Date(t.start).getTime();
    return start >= DAY_START && start < DAY_END;
  });
}

function legCount(travelEvents: TravelEvent[], from: string, to: string) {
  return mondayLegs(travelEvents).filter(
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
  ];
});
afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  jest.useRealTimers();
});

// A School plan is followed by a Gym category window; the static pass carves
// a School -> Gym leg at the tail of the gap between them. A Home task landing
// in that gap makes the leg's origin stale: without rerouting, the scheduler
// returns the user to School just to catch the pre-carved leg, stranding a
// [Home -> School][School -> Gym] stack where a single direct [Home -> Gym]
// belongs.
describe("reroute of a following outbound leg (stale static-pass origin)", () => {
  const pickup = () =>
    makePlanner("school-pickup", {
      plannerType: "plan",
      starts: new Date("2026-01-05T13:30:00").toISOString(),
      duration: 30,
      locationId: SCHOOL,
    });
  // Earliest start + deadline pin the task into the gap between the pickup
  // and the window — in a fuller schedule contention does this naturally.
  const measure = () =>
    makePlanner("measure-home", {
      duration: 30,
      locationId: HOME,
      earliestStartDate: new Date("2026-01-05T14:00:00").toISOString(),
      deadline: new Date("2026-01-05T17:00:00").toISOString(),
    });

  it("replaces the return-plus-old-leg stack with one direct leg to the leg's destination", () => {
    const { events, travelEvents } = run([pickup(), measure()]);

    expect(events.find((e) => e.id === "measure-home")).toBeDefined();
    expect({
      homeToSchool: legCount(travelEvents, HOME, SCHOOL),
      schoolToHome: legCount(travelEvents, SCHOOL, HOME),
      schoolToGym: legCount(travelEvents, SCHOOL, GYM),
      homeToGym: legCount(travelEvents, HOME, GYM),
    }).toEqual({
      homeToSchool: 1, // inbound to the pickup plan only — no return trip
      schoolToHome: 1, // to the task
      schoolToGym: 0, // the stale static leg is removed
      homeToGym: 1, // the direct rerouted leg
    });
  });

  it("the direct leg departs from the task and arrives before the window", () => {
    const { events, travelEvents } = run([pickup(), measure()]);

    const task = events.find((e) => e.id === "measure-home")!;
    const direct = mondayLegs(travelEvents).find(
      (t) => t.fromLocationId === HOME && t.toLocationId === GYM,
    )!;
    expect(direct).toBeDefined();
    expect(new Date(direct.start).getTime()).toBeGreaterThanOrEqual(
      new Date(task.end).getTime(),
    );
    expect(new Date(direct.end).getTime()).toBeLessThanOrEqual(
      new Date("2026-01-05T17:00:00").getTime(),
    );
  });

  it("without the intervening task the static leg stays as-is", () => {
    const { travelEvents } = run([pickup()]);

    expect(legCount(travelEvents, SCHOOL, GYM)).toBe(1);
    expect(legCount(travelEvents, HOME, GYM)).toBe(0);
  });
});
