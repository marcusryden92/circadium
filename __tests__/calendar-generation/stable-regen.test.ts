import * as fs from "fs";
import * as path from "path";
import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
} from "@/types/prisma";
import { PlannerType } from "@/types/prisma";

// Two invariants around previousCalendar:
//
// 1. Idempotent regen. Feeding a run's own output back as previousCalendar
//    must reproduce it exactly. Event builders used to mint a fresh
//    extendedProps.id and createdAt/updatedAt on every emit, so every regen
//    marked every event row as changed — full-table sync churn, and each
//    churn sync bumped the OCC dataVersion, which made a second open window's
//    next sync stale (its in-flight edit silently discarded).
//
// 2. Plans are never memoized. A plan whose event already ended used to be
//    preserved verbatim from previousCalendar, so dragging it updated
//    planner.starts while the calendar kept rendering the stale copy.

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

const OPTIONS = {
  bufferTimeMinutes: 10,
  categories: FIXTURE.categories,
  previousEngineMessages: [],
};

let consoleSpies: jest.SpyInstance[] = [];

describe("regen stability against previousCalendar", () => {
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

  it("re-running with its own output as previousCalendar is a no-op", () => {
    const first = generateCalendar(
      "1",
      1,
      templates,
      FIXTURE.planner,
      [],
      OPTIONS,
    );
    const second = generateCalendar(
      "1",
      1,
      templates,
      FIXTURE.planner,
      first.events,
      OPTIONS,
    );

    const byId = (events: SimpleEvent[]) =>
      [...events].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(second.events)).toEqual(byId(first.events));
  });

  it("honors a starts change on a plan whose previous event already ended", () => {
    const plan: Planner = {
      ...FIXTURE.planner[0],
      id: "test-plan-id",
      title: "Test plan",
      parentId: null,
      plannerType: PlannerType.plan,
      isReady: true,
      duration: 60,
      deadline: null,
      starts: "2026-07-02T08:00:00.000Z",
      sortOrder: 0,
      completedStartTime: null,
      completedEndTime: null,
      locationId: null,
      useParentLocation: false,
      categoryId: null,
    };

    const planner = [...FIXTURE.planner, plan];
    const first = generateCalendar("1", 1, templates, planner, [], OPTIONS);
    const firstPlanEvent = first.events.find((e) => e.id === plan.id);
    expect(firstPlanEvent?.start).toBe("2026-07-02T08:00:00.000Z");

    // Simulate the drag: starts moves to tomorrow while the old event (which
    // ended yesterday) is still in previousCalendar.
    const draggedStarts = "2026-07-04T08:00:00.000Z";
    const draggedPlanner = planner.map((p) =>
      p.id === plan.id ? { ...p, starts: draggedStarts } : p,
    );
    const second = generateCalendar(
      "1",
      1,
      templates,
      draggedPlanner,
      first.events,
      OPTIONS,
    );

    const planEvents = second.events.filter((e) => e.id === plan.id);
    expect(planEvents).toHaveLength(1);
    expect(planEvents[0].start).toBe(draggedStarts);
  });

  // A completed tile is deterministic from the row's completedStartTime/End, so
  // editing that time must re-render even when the old completion window is in
  // the past — it must NOT be frozen from previousCalendar like an engine
  // placement. Guards the memoization exclusion for completed items.
  const completedTask = (): Planner => ({
    ...FIXTURE.planner[0],
    id: "test-completed-task",
    title: "Completed task",
    parentId: null,
    plannerType: PlannerType.task,
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: null,
    recurrence: null,
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    sortOrder: 0,
    completedStartTime: "2026-07-01T09:00:00.000Z",
    completedEndTime: "2026-07-01T10:00:00.000Z",
    locationId: null,
    useParentLocation: false,
    categoryId: null,
  });

  it("honors a completed-time edit on a task whose completion window already passed", () => {
    const task = completedTask();
    const planner = [...FIXTURE.planner, task];
    const first = generateCalendar("1", 1, templates, planner, [], OPTIONS);
    const firstTile = first.events.find((e) => e.id === task.id);
    expect(firstTile?.start).toBe("2026-07-01T09:00:00.000Z");
    expect(firstTile?.end).toBe("2026-07-01T10:00:00.000Z");

    // Edit the completion window to a different past time while the old tile
    // (ended days ago) is still in previousCalendar.
    const editedStart = "2026-06-30T14:00:00.000Z";
    const editedEnd = "2026-06-30T15:00:00.000Z";
    const editedPlanner = planner.map((p) =>
      p.id === task.id
        ? { ...p, completedStartTime: editedStart, completedEndTime: editedEnd }
        : p,
    );
    const second = generateCalendar(
      "1",
      1,
      templates,
      editedPlanner,
      first.events,
      OPTIONS,
    );

    const tiles = second.events.filter((e) => e.id === task.id);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].start).toBe(editedStart);
    expect(tiles[0].end).toBe(editedEnd);
  });

  it("drops the completed tile (no ghost) when completion is cleared on a past item", () => {
    const task = completedTask();
    const planner = [...FIXTURE.planner, task];
    const first = generateCalendar("1", 1, templates, planner, [], OPTIONS);
    expect(first.events.some((e) => e.id === task.id)).toBe(true);

    // Un-complete: the old completed tile must not linger, and the now-ready
    // task must be free to reschedule (its memoized id previously barred it).
    const clearedPlanner = planner.map((p) =>
      p.id === task.id
        ? { ...p, completedStartTime: null, completedEndTime: null }
        : p,
    );
    const second = generateCalendar(
      "1",
      1,
      templates,
      clearedPlanner,
      first.events,
      OPTIONS,
    );

    const ghost = second.events.find(
      (e) => e.id === task.id && e.start === "2026-07-01T09:00:00.000Z",
    );
    expect(ghost).toBeUndefined();
  });
});
