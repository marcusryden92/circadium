import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  EventTemplate,
  Planner,
  SimpleEvent,
  TravelEvent,
} from "@/types/prisma";

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday morning
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

function runWithTravel(planners: Planner[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
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

function dump(label: string, events: SimpleEvent[], travelEvents: TravelEvent[]) {
  const chrono: Array<{
    id: string;
    from?: string | null;
    to?: string | null;
    start: string | Date;
    end: string | Date;
  }> = [
    ...events.map((e) => ({ id: e.id, start: e.start, end: e.end })),
    ...travelEvents.map((t) => ({
      id: t.id,
      from: t.fromLocationId,
      to: t.toLocationId,
      start: t.start,
      end: t.end,
    })),
  ];
  chrono.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const lines = chrono
    .filter(
      (e) =>
        e.id.includes("work") || e.id.includes("home") || e.from !== undefined,
    )
    .map((e) => {
      const s = new Date(e.start).toISOString();
      const en = new Date(e.end).toISOString();
      return e.from !== undefined
        ? `  TRAVEL ${e.from}->${e.to}  ${s} -> ${en}`
        : `  ${e.id}  ${s} -> ${en}`;
    });
  console.info(`\n=== ${label} ===\n${lines.join("\n")}`);
}

function travelCount(travelEvents: TravelEvent[]) {
  return {
    homeToWork: travelEvents.filter(
      (t) => t.fromLocationId === HOME && t.toLocationId === WORK,
    ).length,
    workToHome: travelEvents.filter(
      (t) => t.fromLocationId === WORK && t.toLocationId === HOME,
    ).length,
  };
}

// A plan at Work (a fixed anchor handled by the static travel pass) is followed
// by a dynamic Work task. The static pass carves a Work->Home return leg after
// the plan (toward the night's Home sleep); the dynamic task landing after it
// must reclaim that leg instead of adding a fresh Home->Work inbound.
// Screenshot: Work->Home immediately followed by Home->Work between two Work items.
describe("plan-exit travel (screenshot shape)", () => {
  it("a Work task after a Work plan does not strand a Work->Home / Home->Work round trip", () => {
    const plan = makePlanner("mm-work", {
      plannerType: "plan",
      starts: new Date("2026-01-05T13:00:00").toISOString(),
      duration: 120,
      locationId: WORK,
    });
    const mvp = makePlanner("mvp-work", {
      duration: 120,
      locationId: WORK,
      priority: 6,
      earliestStartDate: new Date("2026-01-05T15:00:00").toISOString(),
    });

    const { events, travelEvents } = runWithTravel([plan, mvp]);
    dump("PLAN EXIT (plan then Work task)", events, travelEvents);
    const c = travelCount(travelEvents);
    expect({ homeToWork: c.homeToWork, workToHome: c.workToHome }).toEqual({
      homeToWork: 1,
      workToHome: 1,
    });
  });

  it("still collapses the round trip when the Work task is bound past the freed leg (no slide-back)", () => {
    const plan = makePlanner("mm-work", {
      plannerType: "plan",
      starts: new Date("2026-01-05T13:00:00").toISOString(),
      duration: 120,
      locationId: WORK,
    });
    // Bound a little later than the plan's end so the task cannot slide all the
    // way into the freed leg span, but the leg is still adjacent enough to be
    // reclaimed (removed) rather than leaving a stray Home->Work inbound.
    const mvp = makePlanner("mvp-work", {
      duration: 90,
      locationId: WORK,
      priority: 6,
      earliestStartDate: new Date("2026-01-05T15:40:00").toISOString(),
    });

    const { events, travelEvents } = runWithTravel([plan, mvp]);
    dump("PLAN EXIT (bound past freed leg)", events, travelEvents);
    const c = travelCount(travelEvents);
    expect({ homeToWork: c.homeToWork, workToHome: c.workToHome }).toEqual({
      homeToWork: 1,
      workToHome: 1,
    });
  });
});
