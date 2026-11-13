import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { SCHEDULING_CONFIG } from "@/utils/calendar-generation/constants";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";

// Horizon expansion must extend the fabric even when it contains no
// CategorySlots. The expansion pickup marker (isFinal) can only be stamped on
// a CategorySlot, so a category-free fabric has no marker; the growth target
// must then derive from the current horizon end — deriving it from the
// fallback pickup (today) rebuilds the same chunk forever, and a task that
// needs room past the initial chunk fails NO_SLOTS instead of placing.

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

describe("horizon expansion without category slots", () => {
  it("extends the horizon and places an overflow task past the initial chunk", () => {
    // Daily plans fill every day's free time down to 30-minute scraps for the
    // whole initial chunk and a bit beyond, so the 300-minute task can only
    // place after expansion reaches genuinely free days.
    const fillerDays = SCHEDULING_CONFIG.HORIZON_CHUNK_DAYS + 2;
    const fillerPlans = Array.from({ length: fillerDays }, (_, i) => {
      const day = new Date("2026-01-05T06:00:00");
      day.setDate(day.getDate() + i);
      return makePlanner(`filler-${i}`, {
        plannerType: "plan",
        starts: day.toISOString(),
        duration: 930, // 06:00-21:30
      });
    });
    const task = makePlanner("task-overflow", { duration: 300 });

    const { events } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [...fillerPlans, task],
      [],
      { categories: [], injectTravelEvents: false },
    );

    const placed = events.find((e: SimpleEvent) => e.id === "task-overflow");
    expect(placed).toBeDefined();

    const initialChunkEnd = new Date(FAKE_TODAY);
    initialChunkEnd.setDate(
      initialChunkEnd.getDate() + SCHEDULING_CONFIG.HORIZON_CHUNK_DAYS,
    );
    expect(new Date(placed!.start).getTime()).toBeGreaterThan(
      initialChunkEnd.getTime(),
    );
  });
});
