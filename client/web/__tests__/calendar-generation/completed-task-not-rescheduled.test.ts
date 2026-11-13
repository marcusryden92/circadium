import * as fs from "fs";
import * as path from "path";
import { getPlannerAndCalendarForCompletedTask } from "@/utils/taskHelpers";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
} from "@/types/prisma";
import type { EventImpl } from "@fullcalendar/core/internal";

// Completing a future-scheduled task removes its event from the calendar and
// stamps completedStart/EndTime on the planner row. The regen that follows
// must render exactly one event for it — the completion window — and never
// hand it back to the scheduler. The shape that used to slip through: the
// completed task re-entered the candidate list and double-placed — a
// completion tile at the right time plus a fresh, uncompleted copy at the
// next open slot. The goal is readied here so its subtree actually reaches
// the scheduler (unready subtrees stay off the calendar entirely).
//
// The fixture is a real reproducing snapshot (goal subtree + week templates)
// trimmed to the minimum that still drives the scheduler.

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

// Raw DB templates carry weekday names; the engine expects integers (the app
// converts on fetch).
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

// The future-scheduled task getting completed "early" (its event sits on the
// day after FAKE_NOW).
const COMPLETED_TASK_ID = "452a62a1-203b-4e93-956f-d085af23c613";
const ROOT_GOAL_ID = "ce1a7c26-986e-478d-8fdf-8be5bc0ac68b";
const FAKE_NOW = new Date("2026-07-03T14:43:00.000Z");

let consoleSpies: jest.SpyInstance[] = [];

describe("completed tasks are not re-scheduled", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    jest.setSystemTime(FAKE_NOW);
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

  it("renders a future task completed ahead of schedule only at its completion window", () => {
    const taskEvent = FIXTURE.calendar.find((e) => e.id === COMPLETED_TASK_ID)!;
    expect(new Date(taskEvent.start).getTime()).toBeGreaterThan(
      FAKE_NOW.getTime(),
    );

    // Mimic the EventImpl surface the calendar-tile complete click reads.
    const fakeEventImpl = {
      id: COMPLETED_TASK_ID,
      start: new Date(taskEvent.start),
      end: new Date(taskEvent.end),
    } as unknown as EventImpl;

    const readiedPlanner = FIXTURE.planner.map((p) =>
      p.id === ROOT_GOAL_ID
        ? { ...p, isReady: true, deadline: "2026-08-09T10:08:00.000Z" }
        : p,
    );
    const result = getPlannerAndCalendarForCompletedTask(
      readiedPlanner,
      FIXTURE.calendar,
      fakeEventImpl,
    )!;
    const stamped = result.manuallyUpdatedTaskArray.find(
      (p) => p.id === COMPLETED_TASK_ID,
    )!;

    const { events } = generateCalendar(
      "1",
      1,
      templates,
      result.manuallyUpdatedTaskArray,
      result.manuallyUpdatedCalendar,
      {
        bufferTimeMinutes: 10,
        categories: FIXTURE.categories,
        previousEngineMessages: [],
      },
    );

    const placements = events.filter((e) => e.id === COMPLETED_TASK_ID);
    expect(placements).toHaveLength(1);
    expect(placements[0].start).toBe(stamped.completedStartTime);
    expect(placements[0].end).toBe(stamped.completedEndTime);
    expect(placements[0].extendedProps?.completedStartTime).toBe(
      stamped.completedStartTime,
    );

    // Sanity: the scheduler still places the incomplete siblings.
    const incompleteSiblingIds = FIXTURE.planner
      .filter((p) => p.plannerType === "task" && p.id !== COMPLETED_TASK_ID)
      .map((p) => p.id);
    const placedSiblings = incompleteSiblingIds.filter((id) =>
      events.some((e) => e.id === id),
    );
    expect(placedSiblings.length).toBeGreaterThan(0);
  });
});
