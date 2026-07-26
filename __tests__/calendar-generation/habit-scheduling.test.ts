import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { taskTooLargeId } from "@/utils/calendar-generation/models/EngineMessage";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import { occurrenceEventId } from "@/utils/planRecurrence";
import type {
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";
import type { HabitCompletionInput } from "@/utils/calendar-generation/models/SchedulingModels";

// Habits: a new plannerType whose per-period occurrences are injected into the
// SAME candidate/leaf pool as tasks and goals and scored the same way
// (deadline = period end). One occurrence per recurrence period, confined to
// its own period via the placementWindowEnd bound, placed by the normal
// dynamic pipeline. Whether an occurrence places or is skipped ("missed")
// emerges from the shared scoring contest — a post-pass gap-filler could not
// produce this. A logged completion freezes the occurrence and stops it
// rescheduling; a window that passes uncompleted simply vanishes.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const FRIDAY = 5;

// Fri 10:00-12:00 window fits exactly one 60-min item (60 + 10 buffer = 70,
// leaving 50 < 70 for a second) — genuine contention for a single slot.
const FRI_WINDOW = serializeAllowedTimes({
  days: [FRIDAY],
  ranges: [{ startTime: "10:00", endTime: "12:00" }],
})!;

// Nightly sleep gives the week occupied structure; daytime 06:00-22:00 stays
// Available so the Friday window is real.
const SLEEP_TEMPLATES: EventTemplate[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `sleep-${d}`,
  title: "Sleep",
  startDay: d,
  startTime: "22:00",
  duration: 480,
  userId: USER_ID,
  color: null,
  locationId: null,
  recurrenceExceptions: null,
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

// Weekly cleaning habit — one occurrence per week, only on Fridays 10:00-12:00.
function makeHabit(overrides: Partial<Planner> = {}): Planner {
  return makePlanner("habit-clean", {
    plannerType: "habit",
    duration: 60,
    priority: 5,
    recurrence: JSON.stringify({ freq: "weekly", interval: 1 }),
    allowedTimes: FRI_WINDOW,
    ...overrides,
  });
}

// Monday-aligned weekly period starts inside the 14-day horizon: today's week
// plus the next two (Fridays Jan 9 / Jan 16 / Jan 23).
const WEEK0_KEY = "2026-01-05T00:00";
const WEEK1_KEY = "2026-01-12T00:00";
const WEEK2_KEY = "2026-01-19T00:00";
const OCC0 = occurrenceEventId("habit-clean", WEEK0_KEY);
const OCC1 = occurrenceEventId("habit-clean", WEEK1_KEY);
const OCC2 = occurrenceEventId("habit-clean", WEEK2_KEY);

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

function run(
  planners: Planner[],
  prev: SimpleEvent[] = [],
  habitCompletions: HabitCompletionInput[] = [],
) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, prev, {
    injectTravelEvents: false,
    habitCompletions,
  });
}

function habitEvents(events: SimpleEvent[]): SimpleEvent[] {
  return events.filter((e) => e.id.startsWith("habit-clean|"));
}
function dayOf(iso: string): number {
  return new Date(iso).getDay();
}

describe("habit occurrence placement", () => {
  it("places exactly one occurrence per week, each inside its own week", () => {
    const { events } = run([makeHabit()]);
    const occ = habitEvents(events).sort((a, b) =>
      a.start.localeCompare(b.start),
    );

    // Three week-starts fall inside the 14-day horizon (Jan 5 / 12 / 19).
    expect(occ.map((e) => e.id)).toEqual([OCC0, OCC1, OCC2]);
    // Each on a Friday, and each in a strictly later week than the last — never
    // two on the same weekend (the placementWindowEnd bound).
    expect(occ.map((e) => dayOf(e.start))).toEqual([FRIDAY, FRIDAY, FRIDAY]);
    expect(new Date(occ[0].start) < new Date("2026-01-12")).toBe(true);
    expect(
      new Date(occ[1].start) >= new Date("2026-01-12") &&
        new Date(occ[1].start) < new Date("2026-01-19"),
    ).toBe(true);
    expect(new Date(occ[2].start) >= new Date("2026-01-19")).toBe(true);
  });

  it("wins its contested slots over a lower-priority task", () => {
    // The weekly windows are contested by a window-matching task. The
    // high-priority habit takes the early Fridays; the lower-priority task is
    // pushed past all of them (proving habits compete, not backfill gaps).
    const habit = makeHabit({ priority: 7 });
    const task = makePlanner("task-low", {
      priority: 2,
      allowedTimes: FRI_WINDOW,
    });

    const { events } = run([habit, task]);
    const occ = habitEvents(events);
    const placedTask = events.find((e) => e.id === "task-low");

    expect(occ).toHaveLength(3);
    expect(placedTask).toBeDefined();
    // The habit owns Jan 9 / 16 / 23; the task is pushed to a later Friday.
    expect(new Date(placedTask!.start) > new Date("2026-01-23")).toBe(true);
  });

  it("is skipped (missed) — silently — when higher-priority work fills its window", () => {
    // A high-priority task takes each Friday window; the lower-priority habit
    // occurrences lose the contest and are dropped without an error.
    const habit = makeHabit({ priority: 2 });
    const tasks = ["task-a", "task-b", "task-c"].map((id) =>
      makePlanner(id, { priority: 7, allowedTimes: FRI_WINDOW }),
    );

    const result = run([habit, ...tasks]);

    expect(habitEvents(result.events)).toHaveLength(0);
    for (const id of ["task-a", "task-b", "task-c"]) {
      expect(result.events.find((e) => e.id === id)).toBeDefined();
    }
    // A missed window is NOT an error: no engine message references the habit.
    expect(result.messages.some((m) => m.id.includes("habit-clean"))).toBe(
      false,
    );
  });
});

describe("habit completion", () => {
  it("skips a completed occurrence and freezes it at its logged window", () => {
    const completedStart = "2026-01-09T15:00:00.000Z";
    const completedEnd = "2026-01-09T16:00:00.000Z";
    const completions: HabitCompletionInput[] = [
      {
        plannerId: "habit-clean",
        occurrenceKey: WEEK0_KEY,
        start: completedStart,
        end: completedEnd,
      },
    ];

    const { events } = run([makeHabit()], [], completions);
    const occ = habitEvents(events);

    // Week 0 renders as the frozen completed tile at the logged window; week 1
    // still schedules dynamically.
    const week0 = occ.find((e) => e.id === OCC0);
    expect(week0).toBeDefined();
    expect(week0!.start).toBe(completedStart);
    expect(week0!.extendedProps?.completedStartTime).toBe(completedStart);
    expect(occ.find((e) => e.id === OCC1)).toBeDefined();
  });
});

describe("habit edge cases", () => {
  it("fails loud as TOO_LARGE when the duration cannot fit its window", () => {
    // 600 min cannot fit a 120-min Friday window; surfaces ONCE on the habit
    // row (occurrence failures are remapped + coalesced to the habit).
    const habit = makeHabit({ duration: 600 });
    const result = run([habit]);

    expect(habitEvents(result.events)).toHaveLength(0);
    expect(
      result.messages.some((m) => m.id === taskTooLargeId("habit-clean")),
    ).toBe(true);
  });

  it("re-emits identical occurrence events on an idle regen", () => {
    const first = run([makeHabit()]);
    const second = run([makeHabit()], first.events);

    const occ1 = habitEvents(first.events).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const occ2 = habitEvents(second.events).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(occ2.map((e) => ({ id: e.id, start: e.start, end: e.end }))).toEqual(
      occ1.map((e) => ({ id: e.id, start: e.start, end: e.end })),
    );
  });

  it("drops a past uncompleted occurrence instead of freezing it", () => {
    // A prior regen placed week 0's occurrence; time has moved past it and it
    // was never completed. It must vanish (not be memoized like a task).
    const pastOccurrence: SimpleEvent = {
      id: OCC0,
      title: "habit-clean",
      start: "2026-01-02T10:00:00.000Z",
      end: "2026-01-02T11:00:00.000Z",
      duration: null,
      userId: USER_ID,
      rrule: null,
      backgroundColor: "#123456",
      borderColor: "",
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
      extendedProps: {
        id: "xp-past",
        eventId: OCC0,
        plannerType: "habit",
        eventType: "planner",
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
      },
    } as unknown as SimpleEvent;

    const { events } = run([makeHabit()], [pastOccurrence]);
    // The stale past occurrence is gone; only the future windows remain.
    expect(events.find((e) => e.start.startsWith("2026-01-02"))).toBeUndefined();
  });
});

describe("habit key stability across week-start changes (regression #1)", () => {
  // A weekly habit's period key is anchored to the habit's own createdAt, NOT
  // the user's weekStartDay preference. The completion log is bound to that key,
  // so flipping the week-start must not orphan the completion nor re-schedule
  // the already-completed week.
  const week0Completion: HabitCompletionInput = {
    plannerId: "habit-clean",
    occurrenceKey: WEEK0_KEY,
    start: "2026-01-09T15:00:00.000Z", // a Friday, inside week 0
    end: "2026-01-09T16:00:00.000Z",
  };

  for (const weekStartDay of [0, 1, 6] as const) {
    it(`keeps the completed week frozen and un-rescheduled (weekStartDay=${weekStartDay})`, () => {
      const { events } = generateCalendar(
        USER_ID,
        weekStartDay,
        SLEEP_TEMPLATES,
        [makeHabit()],
        [],
        { injectTravelEvents: false, habitCompletions: [week0Completion] },
      );
      const occ = habitEvents(events);

      // Exactly one frozen completed tile, at the logged window.
      const completed = occ.filter((e) => e.extendedProps?.completedStartTime);
      expect(completed.map((e) => e.id)).toEqual([OCC0]);

      // No fresh LIVE occurrence lands in the already-completed week (Jan 5-12),
      // regardless of what the week-start is set to.
      const liveInCompletedWeek = occ.filter(
        (e) =>
          !e.extendedProps?.completedStartTime &&
          new Date(e.start) < new Date("2026-01-12"),
      );
      expect(liveInCompletedWeek).toHaveLength(0);
    });
  }
});

describe("old habit enumeration (regression #2)", () => {
  // A daily habit created long ago must still schedule its present-day
  // occurrences — enumeration is windowed near the horizon, not stepped from
  // the ancient anchor (which used to exhaust the period budget in the past).
  it("schedules a >400-day-old daily habit's current occurrences", () => {
    const old = makePlanner("habit-old", {
      plannerType: "habit",
      duration: 30,
      recurrence: JSON.stringify({ freq: "daily", interval: 1 }),
      createdAt: new Date(2024, 10, 1).toISOString(), // ~430 days before today
    });

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [old],
      [],
      { injectTravelEvents: false },
    );

    expect(
      events.filter((e) => e.id.startsWith("habit-old|")).length,
    ).toBeGreaterThan(0);
    // It schedules cleanly — no failure message references it.
    expect(messages.some((m) => m.id.includes("habit-old"))).toBe(false);
  });
});
