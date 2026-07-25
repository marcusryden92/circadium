import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { serializeTaskSplitting } from "@/utils/taskSplitting";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";

const FAKE_TODAY = new Date("2026-01-05T12:00:00"); // Monday noon
const USER_ID = "test-user";
const HOME = "loc-home";
const WORK = "loc-work";
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
const TRAVEL_MATRIX = new Map([
  [`${HOME}->${WORK}`, travelEntry(HOME, WORK)],
  [`${WORK}->${HOME}`, travelEntry(WORK, HOME)],
]);

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

function runWithTravel(planners: Planner[], previousCalendar: SimpleEvent[] = []) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, previousCalendar, {
    injectTravelEvents: true,
    travelTimeMatrix: TRAVEL_MATRIX,
    bufferTimeMinutes: BUFFER_MINUTES,
  });
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

function dump(label: string, events: SimpleEvent[], travelEvents: any[]) {
  const chrono = [...events, ...travelEvents]
    .map((e: any) => ({
      id: e.id,
      from: e.fromLocationId,
      to: e.toLocationId,
      start: e.start,
      end: e.end,
    }))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const lines = chrono.map((e) =>
    e.from !== undefined
      ? `  TRAVEL ${e.from}->${e.to}  ${e.start} -> ${e.end}`
      : `  ${e.id}  ${e.start} -> ${e.end}`,
  );
  // eslint-disable-next-line no-console
  console.info(`\n=== ${label} ===\n${lines.join("\n")}`);
}

function travelCount(travelEvents: any[]) {
  return {
    homeToWork: travelEvents.filter(
      (t) => t.fromLocationId === HOME && t.toLocationId === WORK,
    ).length,
    workToHome: travelEvents.filter(
      (t) => t.fromLocationId === WORK && t.toLocationId === HOME,
    ).length,
  };
}

// A split WORK task partially completed (a frozen completed segment) then a
// fresh remainder chunk, followed by a HOME task. Does travel wrap the WORK
// work (segment + chunk) and the HOME task?
describe("split task with completed segment (screenshot: '2h of 12h done')", () => {
  it("REPRO: completed split segment at WORK then HOME task", () => {
    const app = makePlanner("app-work", {
      duration: 240,
      locationId: WORK,
      priority: 6,
      splitting: serializeTaskSplitting({
        minMinutes: 60,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
      // 2h already done this morning at WORK (frozen), 2h remaining.
      completedSegments: JSON.stringify([
        { start: "2026-01-05T09:00:00", end: "2026-01-05T11:00:00" },
      ]),
    });
    const odyssey = makePlanner("odyssey-home", {
      duration: 90,
      locationId: HOME,
      priority: 5,
    });
    const { events, travelEvents } = runWithTravel([app, odyssey]);
    dump("REPRO (split + completed segment)", events, travelEvents);
    // eslint-disable-next-line no-console
    console.info("counts:", JSON.stringify(travelCount(travelEvents)));
  });

  it("CONTROL: NORMAL fully-completed WORK task then HOME task", () => {
    const app = makePlanner("app-work", {
      duration: 120,
      locationId: WORK,
      priority: 6,
      completedStartTime: "2026-01-05T09:00:00",
      completedEndTime: "2026-01-05T11:00:00",
    });
    const odyssey = makePlanner("odyssey-home", {
      duration: 90,
      locationId: HOME,
      priority: 5,
    });
    const { events, travelEvents } = runWithTravel([app, odyssey]);
    dump("CONTROL (normal completed)", events, travelEvents);
    // eslint-disable-next-line no-console
    console.info("counts:", JSON.stringify(travelCount(travelEvents)));
  });

  it("BASELINE: fresh split chunk at WORK then HOME task (no completion)", () => {
    const app = makePlanner("app-work", {
      duration: 120,
      locationId: WORK,
      priority: 6,
      splitting: serializeTaskSplitting({
        minMinutes: 60,
        maxMinutes: 120,
        maxMinutesPerDay: null,
      }),
    });
    const odyssey = makePlanner("odyssey-home", {
      duration: 90,
      locationId: HOME,
      priority: 5,
    });
    const { events, travelEvents } = runWithTravel([app, odyssey]);
    dump("BASELINE (fresh split chunk)", events, travelEvents);
    // eslint-disable-next-line no-console
    console.info("counts:", JSON.stringify(travelCount(travelEvents)));
  });
});
