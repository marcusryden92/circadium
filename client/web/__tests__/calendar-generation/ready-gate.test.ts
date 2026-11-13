import * as fs from "fs";
import * as path from "path";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
} from "@/types/prisma";

// Readiness is the universal scheduling gate. A goal's subtree only schedules
// through scheduleGoal when the root goal is ready; a standalone task schedules
// only when its own isReady === true. prepareCandidates used to admit every
// task-typed row regardless of ancestry or readiness, so a NOT-ready goal's
// leaves were placed anyway and a standalone task ignored its own readiness.

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

describe("goal readiness gates the subtree", () => {
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

  it("schedules nothing from a NOT-ready goal's subtree", () => {
    const planner = FIXTURE.planner.map((p) =>
      p.id === ROOT_GOAL_ID ? { ...p, isReady: false } : p,
    );
    const uncompletedLeaves = planner.filter(
      (p) => p.plannerType === "task" && !p.completedEndTime,
    );

    const { events } = generateCalendar("1", 1, templates, planner, [], {
      bufferTimeMinutes: 10,
      categories: FIXTURE.categories,
      previousEngineMessages: [],
    });

    const placed = uncompletedLeaves.filter((t) =>
      events.some((e) => e.id === t.id),
    );
    expect(placed).toEqual([]);
  });

  it("still schedules a standalone task next to a NOT-ready goal", () => {
    const template = FIXTURE.planner.find(
      (p) => p.plannerType === "task" && !p.completedEndTime,
    )!;
    const standalone: Planner = {
      ...template,
      id: "standalone-task-id",
      title: "standalone",
      parentId: null,
      sortOrder: 0,
      categoryId: null,
      isReady: true,
    };
    const planner = [
      ...FIXTURE.planner.map((p) =>
        p.id === ROOT_GOAL_ID ? { ...p, isReady: false } : p,
      ),
      standalone,
    ];

    const { events } = generateCalendar("1", 1, templates, planner, [], {
      bufferTimeMinutes: 10,
      categories: FIXTURE.categories,
      previousEngineMessages: [],
    });

    expect(events.some((e) => e.id === "standalone-task-id")).toBe(true);
  });

  it("does not schedule a NOT-ready standalone task", () => {
    const template = FIXTURE.planner.find(
      (p) => p.plannerType === "task" && !p.completedEndTime,
    )!;
    const standalone: Planner = {
      ...template,
      id: "standalone-task-id",
      title: "standalone",
      parentId: null,
      sortOrder: 0,
      categoryId: null,
      isReady: false,
    };
    const planner = [
      ...FIXTURE.planner.map((p) =>
        p.id === ROOT_GOAL_ID ? { ...p, isReady: false } : p,
      ),
      standalone,
    ];

    const { events } = generateCalendar("1", 1, templates, planner, [], {
      bufferTimeMinutes: 10,
      categories: FIXTURE.categories,
      previousEngineMessages: [],
    });

    expect(events.some((e) => e.id === "standalone-task-id")).toBe(false);
  });
});
