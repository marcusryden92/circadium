import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";

// A subcategory's items are "members by extension" of their ancestors: an item
// in "project" (nested under "work") may schedule in a "work" window, but a
// plain "work" item must never fall into a "project" window. The confine flag
// (confineToOwnWindows) opts a subcategory out of that upward cascade so its
// items stay pinned to their own windows (dedicated collection time).
//
// Positive placement assertions in every case guard the slot fabric — a broken
// fabric places nothing, which would let a "nothing landed here" assertion pass
// vacuously.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const WORK_ID = "cat-work";
const PROJECT_ID = "cat-project";
const WORK_WINDOW_ID = "win-work-tue";
const PROJECT_WINDOW_ID = "win-project-wed";

// JS getDay(): 0=Sun ... 6=Sat.
const TUESDAY = 2;
const WEDNESDAY = 3;

function makeWindow(
  overrides: Partial<CategoryTimeWindow> & { id: string; day: number },
): CategoryTimeWindow {
  return {
    startTime: "09:00",
    endTime: "17:00",
    recurrenceExceptions: null,
    categoryId: WORK_ID,
    userId: USER_ID,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> & { id: string }): Category {
  const ts = FAKE_TODAY.toISOString();
  return {
    name: overrides.id,
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
    timeSlots: [],
    ...overrides,
  };
}

// Nightly sleep gives the week occupied structure — without it the fabric has
// no gaps and nothing schedules (buildAvailableSlots derives gaps between
// occupied intervals). Daytime 06:00-22:00 stays Available. startDay is the
// integer the engine expects at runtime (the WeekDayType enum is a persistence
// concern; the fixture-based tests cast the same way).
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

function makeTask(id: string, categoryId: string | null): Planner {
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
    categoryId,
    createdAt: ts,
    updatedAt: ts,
  };
}

function isWithinWindow(iso: string, day: number): boolean {
  const d = new Date(iso);
  return d.getDay() === day && d.getHours() >= 9 && d.getHours() < 17;
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

function run(planners: Planner[], categories: Category[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    categories,
    injectTravelEvents: false,
  });
}

describe("category window cascade", () => {
  it("schedules a subcategory item in an ancestor's (strict) window", () => {
    // work is strict and windowed; project is classification-only (no windows)
    // and unconfined, so its items are members of work by extension.
    const work = makeCategory({
      id: WORK_ID,
      isStrict: true,
      timeSlots: [makeWindow({ id: WORK_WINDOW_ID, day: TUESDAY })],
    });
    const project = makeCategory({
      id: PROJECT_ID,
      parentId: WORK_ID,
      useTimeWindows: false,
    });
    const task = makeTask("task-project", PROJECT_ID);

    const { events } = run([task], [work, project]);

    const placed = events.find((e: SimpleEvent) => e.id === "task-project");
    expect(placed).toBeDefined();
    // The only slots it can occupy are work's Tuesday windows.
    expect(isWithinWindow(placed!.start, TUESDAY)).toBe(true);
  });

  it("keeps a confined subcategory's items out of ancestor windows", () => {
    const work = makeCategory({
      id: WORK_ID,
      isStrict: true,
      timeSlots: [makeWindow({ id: WORK_WINDOW_ID, day: TUESDAY })],
    });
    const project = makeCategory({
      id: PROJECT_ID,
      parentId: WORK_ID,
      useTimeWindows: false,
      confineToOwnWindows: true,
    });
    const task = makeTask("task-project", PROJECT_ID);

    const { events } = run([task], [work, project]);

    const placed = events.find((e: SimpleEvent) => e.id === "task-project");
    expect(placed).toBeDefined();
    // Confined + no own windows ⇒ unconstrained free time, and the strict work
    // window excludes it. It lands in free Monday time before the first window.
    expect(isWithinWindow(placed!.start, TUESDAY)).toBe(false);
    expect(new Date(placed!.start).getTime()).toBeLessThan(
      new Date("2026-01-06T09:00:00").getTime(),
    );
  });

  it("never schedules an ancestor item in a descendant's window", () => {
    // work item may use work's own (non-strict) window; project's strict window
    // must reject it — a work item is not a project item.
    const work = makeCategory({
      id: WORK_ID,
      timeSlots: [makeWindow({ id: WORK_WINDOW_ID, day: TUESDAY })],
    });
    const project = makeCategory({
      id: PROJECT_ID,
      parentId: WORK_ID,
      isStrict: true,
      timeSlots: [
        makeWindow({
          id: PROJECT_WINDOW_ID,
          day: WEDNESDAY,
          categoryId: PROJECT_ID,
        }),
      ],
    });
    const task = makeTask("task-work", WORK_ID);

    const { events } = run([task], [work, project]);

    const placed = events.find((e: SimpleEvent) => e.id === "task-work");
    expect(placed).toBeDefined();
    expect(isWithinWindow(placed!.start, WEDNESDAY)).toBe(false);
  });
});
