import * as fs from "fs";
import * as path from "path";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
} from "@/types/prisma";

// A ready root goal enters the candidate list carrying its subtree-aggregate
// duration (here 1800 min). The proactive expansion watermark used to compare
// that aggregate against the largest available slot — which can never fit it —
// so every loop iteration expanded the horizon and the placement walk never
// ran: zero events, zero failures, SCHEDULED_OK, and the sync then deleted
// every previously placed event. Goal candidates must size as their largest
// uncompleted leaf, and an exhausted expansion budget must surface failures.

const ROOT_GOAL_ID = "ce1a7c26-986e-478d-8fdf-8be5bc0ac68b";

const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/completed-task-fixture.json"),
    "utf8",
  ),
) as {
  planner: Planner[];
  calendar: SimpleEvent[];
  templates: (Omit<EventTemplate, "startDay"> & { startDay: string })[];
  categories: Category[];
};

const WEEKDAY_INT: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const templates = FIXTURE.templates.map((t) => ({
  ...t,
  startDay: WEEKDAY_INT[t.startDay],
})) as unknown as EventTemplate[];

let consoleSpies: jest.SpyInstance[] = [];

describe("ready root goal does not starve the scheduler", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    jest.setSystemTime(new Date("2026-07-03T12:45:00.000Z"));
    consoleSpies = [
      jest.spyOn(console, "log").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
      jest.spyOn(console, "info").mockImplementation(() => {}),
    ];
  });
  afterAll(() => {
    consoleSpies.forEach((s) => s.mockRestore());
    jest.useRealTimers();
  });

  it("schedules every leaf of a ready goal whose aggregate duration exceeds any slot", () => {
    const planner = FIXTURE.planner.map((p) =>
      p.id === ROOT_GOAL_ID
        ? { ...p, isReady: true, deadline: "2026-08-09T10:08:00.000Z" }
        : p,
    );
    const rootGoal = planner.find((p) => p.id === ROOT_GOAL_ID)!;
    // The premise of the regression: the aggregate is unschedulable as a block.
    expect(rootGoal.duration).toBeGreaterThan(24 * 60);

    const subtreeTasks = planner.filter((p) => p.plannerType === "task");

    const { events } = generateCalendar("1", 1, templates, planner, [], {
      bufferTimeMinutes: 10,
      categories: FIXTURE.categories,
      previousEngineMessages: [],
    });

    const placed = subtreeTasks.filter((t) =>
      events.some((e) => e.id === t.id),
    );
    expect(placed.length).toBe(subtreeTasks.length);
  });

  // A category without time windows is classification-only: findValidSlots
  // treats its tasks as unconstrained, but the watermark used to resolve the
  // constraint from the raw planner-category map and demand category slots
  // that can never exist — biggestFit pinned at 0, the whole expansion budget
  // burned on watermark continues, zero events placed.
  it("a windowless categoryId on a ready goal does not starve the scheduler", () => {
    const windowless = {
      ...FIXTURE.categories[0],
      id: "windowless-category-id",
      name: "Classification only",
      useTimeWindows: false,
      isStrict: false,
      timeSlots: [],
    } as Category;
    const planner = FIXTURE.planner.map((p) =>
      p.id === ROOT_GOAL_ID
        ? {
            ...p,
            isReady: true,
            categoryId: "windowless-category-id",
            deadline: "2026-08-09T10:08:00.000Z",
          }
        : p,
    );
    const subtreeTasks = planner.filter((p) => p.plannerType === "task");

    const { events } = generateCalendar("1", 1, templates, planner, [], {
      bufferTimeMinutes: 10,
      categories: [...FIXTURE.categories, windowless],
      previousEngineMessages: [],
    });

    const placed = subtreeTasks.filter((t) =>
      events.some((e) => e.id === t.id),
    );
    expect(placed.length).toBe(subtreeTasks.length);
  });

  // Goal sizing must ignore leaves the scheduler will never attempt. A leaf
  // whose event has drifted into the past is memoized (excluded from
  // candidates and from scheduleGoal) but used to still size its ready goal
  // in the watermark, demanding room for a task that would never be placed.
  // The leaf's duration is inflated beyond any possible slot so the stale
  // sizing alone is what would pin the watermark.
  it("a memoized past leaf does not size its ready goal in the watermark", () => {
    const biggestLeafId = "452a62a1-203b-4e93-956f-d085af23c613";
    const planner = FIXTURE.planner.map((p) => {
      if (p.id === ROOT_GOAL_ID) {
        return { ...p, isReady: true, deadline: "2026-08-09T10:08:00.000Z" };
      }
      if (p.id === biggestLeafId) {
        return { ...p, duration: 24 * 60 };
      }
      return p;
    });
    const biggestLeaf = planner.find((p) => p.id === biggestLeafId)!;
    expect(biggestLeaf).toBeDefined();

    const pastEvent = {
      id: biggestLeafId,
      title: biggestLeaf.title,
      start: "2026-07-01T08:00:00.000Z",
      end: "2026-07-01T09:15:00.000Z",
      rrule: null,
      userId: "1",
      extendedProps: { eventType: "planner" },
    } as unknown as SimpleEvent;

    const remainingLeaves = planner.filter(
      (p) =>
        p.plannerType === "task" &&
        !p.completedEndTime &&
        p.id !== biggestLeafId,
    );

    const { events } = generateCalendar(
      "1",
      1,
      templates,
      planner,
      [pastEvent],
      {
        bufferTimeMinutes: 10,
        categories: FIXTURE.categories,
        previousEngineMessages: [],
      },
    );

    const placed = remainingLeaves.filter((t) =>
      events.some(
        (e) => e.id === t.id && new Date(e.start) > new Date("2026-07-03"),
      ),
    );
    expect(placed.length).toBe(remainingLeaves.length);
  });
});
