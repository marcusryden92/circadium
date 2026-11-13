import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { applyQueueCategoryInheritance } from "@/utils/calendar-generation/helpers/CalendarGenerator/applyQueueCategoryInheritance";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  Queue,
  SimpleEvent,
} from "@/types/prisma";

// A queue's optional categoryId is an inherited default: root members with no
// effective category of their own resolve to it at the engine's input
// boundary, so windows/strictness/location follow the normal category
// machinery. Members with their own category keep it. Hand-built minimal
// geometry (category-window-cascade precedent).

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const TS = FAKE_TODAY.toISOString();
const WORK_ID = "cat-work";
const OTHER_ID = "cat-other";

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
  } as CategoryTimeWindow;
}

function makeCategory(overrides: Partial<Category> & { id: string }): Category {
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
    createdAt: TS,
    updatedAt: TS,
    timeSlots: [],
    ...overrides,
  };
}

const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  createdAt: TS,
  updatedAt: TS,
})) as unknown as EventTemplate[];

function makeTask(id: string, categoryId: string | null = null): Planner {
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
    createdAt: TS,
    updatedAt: TS,
  };
}

function makeQueue(
  id: string,
  memberPlannerIds: string[],
  categoryId: string | null,
): Queue {
  return {
    id,
    title: id,
    sortOrder: 0,
    color: null,
    categoryId,
    userId: USER_ID,
    createdAt: TS,
    updatedAt: TS,
    members: memberPlannerIds.map((plannerId, i) => ({
      id: `${id}-m${i}`,
      sortOrder: (i + 1) * 1024,
      queueId: id,
      plannerId,
      userId: USER_ID,
      createdAt: TS,
      updatedAt: TS,
    })),
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

function run(planners: Planner[], categories: Category[], queues: Queue[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    categories,
    queues,
    injectTravelEvents: false,
  });
}

describe("queue category inheritance", () => {
  it("a categoryless member inherits the queue's strict windowed category", () => {
    const work = makeCategory({
      id: WORK_ID,
      isStrict: true,
      timeSlots: [makeWindow({ id: "win-work", day: TUESDAY })],
    });
    const task = makeTask("member-task");

    const { events } = run(
      [task],
      [work],
      [makeQueue("q", ["member-task"], WORK_ID)],
    );

    const placed = events.find((e: SimpleEvent) => e.id === "member-task");
    expect(placed).toBeDefined();
    expect(isWithinWindow(placed!.start, TUESDAY)).toBe(true);
  });

  it("a member with its own category keeps it", () => {
    const work = makeCategory({
      id: WORK_ID,
      isStrict: true,
      timeSlots: [makeWindow({ id: "win-work", day: TUESDAY })],
    });
    const other = makeCategory({
      id: OTHER_ID,
      isStrict: true,
      timeSlots: [
        makeWindow({ id: "win-other", day: WEDNESDAY, categoryId: OTHER_ID }),
      ],
    });
    const task = makeTask("member-task", OTHER_ID);

    const { events } = run(
      [task],
      [work, other],
      [makeQueue("q", ["member-task"], WORK_ID)],
    );

    const placed = events.find((e: SimpleEvent) => e.id === "member-task");
    expect(placed).toBeDefined();
    expect(isWithinWindow(placed!.start, WEDNESDAY)).toBe(true);
    expect(isWithinWindow(placed!.start, TUESDAY)).toBe(false);
  });
});

describe("applyQueueCategoryInheritance", () => {
  it("returns the same array reference on no-op", () => {
    const planners = [makeTask("a", OTHER_ID), makeTask("b")];
    // No queues at all.
    expect(applyQueueCategoryInheritance(planners, [])).toBe(planners);
    // Queue without a category.
    expect(
      applyQueueCategoryInheritance(planners, [
        makeQueue("q", ["a", "b"], null),
      ]),
    ).toBe(planners);
    // Member already has its own category; non-members untouched.
    expect(
      applyQueueCategoryInheritance(planners, [
        makeQueue("q", ["a"], WORK_ID),
      ]),
    ).toBe(planners);
  });

  it("substitutes only categoryless root members", () => {
    const nested = { ...makeTask("nested"), parentId: "a" };
    const planners = [makeTask("a", OTHER_ID), makeTask("b"), nested];
    const next = applyQueueCategoryInheritance(planners, [
      makeQueue("q", ["a", "b", "nested"], WORK_ID),
    ]);
    expect(next).not.toBe(planners);
    expect(next.find((p) => p.id === "a")!.categoryId).toBe(OTHER_ID);
    expect(next.find((p) => p.id === "b")!.categoryId).toBe(WORK_ID);
    expect(next.find((p) => p.id === "nested")!.categoryId).toBeNull();
    // Untouched rows keep identity.
    expect(next.find((p) => p.id === "a")).toBe(planners[0]);
  });
});
