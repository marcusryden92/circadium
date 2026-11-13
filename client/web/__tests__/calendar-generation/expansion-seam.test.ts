import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";

// Regression guards on the CategoryEvent id format. The diff layer and
// the DB schema both assume `${windowId}|${YYYY-MM-DD-local}`; if anyone
// reverts to UTC-instant keying or changes the separator, these catch it.
// Determinism beyond this is true by construction (see the handoff doc).
const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const PLAN_ISO = "2026-01-26T10:00:00.000Z";

const USER_ID = "test-user";
const WORK_CATEGORY_ID = "test-work";
const MON_WINDOW_ID = "test-work-mon";

function makeCategoryTimeWindow(
  overrides: Partial<CategoryTimeWindow> = {},
): CategoryTimeWindow {
  return {
    id: MON_WINDOW_ID,
    day: 1,
    startTime: "09:00",
    endTime: "17:00",
    recurrenceExceptions: null,
    categoryId: WORK_CATEGORY_ID,
    userId: USER_ID,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  const ts = FAKE_TODAY.toISOString();
  return {
    id: WORK_CATEGORY_ID,
    name: "Work",
    icon: null,
    color: null,
    sortOrder: 0,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    locationId: null,
    parentId: null,
    userId: USER_ID,
    createdAt: ts,
    updatedAt: ts,
    timeSlots: [makeCategoryTimeWindow()],
    ...overrides,
  };
}

function makePlan(id: string, startsISO: string): Planner {
  const ts = FAKE_TODAY.toISOString();
  return {
    id,
    title: `Plan ${id}`,
    parentId: null,
    plannerType: "plan",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: startsISO,
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
  };
}

// Silence the engine's hardcoded console logging so jest output stays
// readable. Restored after each test.
let consoleSpies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.useFakeTimers();
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
  categories: Category[],
  templates: EventTemplate[] = [],
  prevCalendar: SimpleEvent[] = [],
) {
  return generateCalendar(USER_ID, 1, templates, planners, prevCalendar, {
    categories,
    injectTravelEvents: false,
  });
}

describe("CategoryEvent id format", () => {
  it("id format is `${categoryTimeWindowId}|${YYYY-MM-DD}`", () => {
    const planners = [makePlan("p", PLAN_ISO)];
    const categories = [makeCategory()];

    const { categoryEvents } = runGenerate(planners, categories);

    expect(categoryEvents.length).toBeGreaterThan(0);
    const idPattern = new RegExp(`^${MON_WINDOW_ID}\\|\\d{4}-\\d{2}-\\d{2}$`);
    for (const ev of categoryEvents) {
      expect(ev.id).toMatch(idPattern);
    }
  });

  it("each id's date component matches the row's local start date", () => {
    const planners = [makePlan("p", PLAN_ISO)];
    const categories = [makeCategory()];

    const { categoryEvents } = runGenerate(planners, categories);

    for (const ev of categoryEvents) {
      const [, dateFromId] = ev.id.split("|");
      const start = new Date(ev.start);
      const local = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      // If the id ever derived from the UTC instant instead of the local
      // calendar date, this would diverge for any row near midnight UTC.
      expect(dateFromId).toBe(local);
    }
  });
});
