import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { FitTightnessStrategy } from "@/utils/calendar-generation/strategies/FitTightnessStrategy";
import type { SchedulingStrategy } from "@/utils/calendar-generation/strategies/SchedulingStrategy";
import { chunkEventId } from "@/utils/taskSplitting";
import type {
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";
import type { SchedulingContext } from "@/utils/calendar-generation/models/SchedulingModels";
import type { AvailableSlot } from "@/utils/calendar-generation/models/TimeSlot";

// Fit tightness: selectBestSlot accepts the first slot that fits, and nothing
// scored wasted headroom — a 30-minute task would shatter a four-hour gap
// while a 35-minute gap the same day went unused. The tightness strategy
// prefers less leftover headroom, at a weight that breaks ties among same-day
// slots without overriding a full day of earliness. Sized placements (split
// chunks, habit flexible blocks) score neutral — they WANT headroom to grow
// into, and a constant is rank-neutral across slots.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";

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

function makeSlot(durationMinutes: number): AvailableSlot {
  const start = new Date("2026-01-06T10:00:00");
  return {
    type: "available",
    start,
    end: new Date(start.getTime() + durationMinutes * 60000),
    durationMinutes,
    prevLocationId: null,
    nextLocationId: null,
  };
}

const context = {
  currentDate: FAKE_TODAY,
  userId: USER_ID,
  weekStartDay: 1,
  allPlanners: [],
  scheduledEvents: [],
  metrics: {},
} as unknown as SchedulingContext;

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

describe("FitTightnessStrategy", () => {
  const strategy: SchedulingStrategy = new FitTightnessStrategy();

  it("scores a snug slot above a roomy one", () => {
    const task = makePlanner("t", { duration: 30 });
    expect(strategy.score(task, makeSlot(35), context)).toBeGreaterThan(
      strategy.score(task, makeSlot(240), context),
    );
  });

  it("split chunks score neutral regardless of slot size", () => {
    const chunk = makePlanner(chunkEventId("parent", 0), { duration: 30 });
    expect(strategy.score(chunk, makeSlot(35), context)).toBe(
      strategy.score(chunk, makeSlot(240), context),
    );
  });

  it("recurring occurrences score neutral regardless of slot size", () => {
    const occurrence = makePlanner("task-1|2026-01-05T00:00", {
      duration: 30,
    });
    expect(strategy.score(occurrence, makeSlot(35), context)).toBe(
      strategy.score(occurrence, makeSlot(240), context),
    );
  });

  it("stays within [0, 1] for degenerate inputs", () => {
    const oversized = makePlanner("t", { duration: 500 });
    const zeroSlot = makeSlot(0);
    for (const score of [
      strategy.score(oversized, makeSlot(240), context),
      strategy.score(oversized, zeroSlot, context),
      strategy.score(makePlanner("z", { duration: 0 }), makeSlot(240), context),
    ]) {
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe("full pipeline", () => {
  it("a short task takes the snug later gap instead of shattering the big one", () => {
    // Monday: 08:00-12:00 open (240 min), blocker, 13:00-13:55 snug (55 min),
    // blocker until sleep. The 30-minute task should land in the snug gap,
    // preserving the big block.
    const blockers: EventTemplate[] = [
      {
        id: "blocker-noon",
        title: "Blocker",
        startDay: 1,
        startTime: "12:00",
        duration: 60,
        userId: USER_ID,
        color: null,
        locationId: null,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      },
      {
        id: "blocker-afternoon",
        title: "Blocker",
        startDay: 1,
        startTime: "13:55",
        duration: 485,
        userId: USER_ID,
        color: null,
        locationId: null,
        createdAt: FAKE_TODAY.toISOString(),
        updatedAt: FAKE_TODAY.toISOString(),
      },
    ] as unknown as EventTemplate[];
    const task = makePlanner("errand", { duration: 30 });

    const { events } = generateCalendar(
      USER_ID,
      1,
      [...SLEEP_TEMPLATES, ...blockers],
      [task],
      [],
      { injectTravelEvents: false },
    );

    const placed = events.find((e: SimpleEvent) => e.id === "errand");
    expect(placed).toBeDefined();
    expect(new Date(placed!.start).getHours()).toBe(13);
  });
});
