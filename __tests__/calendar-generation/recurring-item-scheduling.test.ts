import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { taskTooLargeId } from "@/utils/calendar-generation/models/EngineMessage";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import { occurrenceEventId } from "@/utils/planRecurrence";
import type { EventTemplate, Planner, SimpleEvent } from "@/types/prisma";
import type { OccurrenceCompletionInput } from "@/utils/calendar-generation/models/SchedulingModels";

// Flexibly recurring items (the retired habit type's scheduling model,
// generalized): a task or goal with a recurrence rule expands into per-period
// occurrence clones injected into the SAME candidate/leaf pool as one-off work
// and scored the same way (deadline = period end). One occurrence per period,
// confined to its own period via the placementWindowEnd bound, placed by the
// normal dynamic pipeline — whether an occurrence places or is skipped
// ("missed") emerges from the shared scoring contest. A logged completion
// freezes the occurrence and stops it rescheduling; a window that passes
// uncompleted simply vanishes. A recurring GOAL clones its whole subtree per
// period, so each week's leaves chain in sibling order inside that week.

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

// Weekly cleaning task — one flexibly placed occurrence per week, only on
// Fridays 10:00-12:00.
function makeRecurringTask(overrides: Partial<Planner> = {}): Planner {
  return makePlanner("weekly-clean", {
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
const OCC0 = occurrenceEventId("weekly-clean", WEEK0_KEY);
const OCC1 = occurrenceEventId("weekly-clean", WEEK1_KEY);
const OCC2 = occurrenceEventId("weekly-clean", WEEK2_KEY);

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
  occurrenceCompletions: OccurrenceCompletionInput[] = [],
) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, prev, {
    injectTravelEvents: false,
    occurrenceCompletions,
  });
}

function occurrenceEventsOf(events: SimpleEvent[], base: string): SimpleEvent[] {
  return events.filter((e) => e.id.startsWith(`${base}|`));
}
function dayOf(iso: string): number {
  return new Date(iso).getDay();
}

describe("recurring task occurrence placement", () => {
  it("places exactly one occurrence per week, each inside its own week", () => {
    const { events } = run([makeRecurringTask()]);
    const occ = occurrenceEventsOf(events, "weekly-clean").sort((a, b) =>
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
    // high-priority recurring item takes the early Fridays; the lower-priority
    // task is pushed past all of them (proving occurrences compete, not
    // backfill gaps).
    const recurring = makeRecurringTask({ priority: 7 });
    const task = makePlanner("task-low", {
      priority: 2,
      allowedTimes: FRI_WINDOW,
    });

    const { events } = run([recurring, task]);
    const occ = occurrenceEventsOf(events, "weekly-clean");
    const placedTask = events.find((e) => e.id === "task-low");

    expect(occ).toHaveLength(3);
    expect(placedTask).toBeDefined();
    // The recurring item owns Jan 9 / 16 / 23; the task lands later.
    expect(new Date(placedTask!.start) > new Date("2026-01-23")).toBe(true);
  });

  it("is skipped (missed) — silently — when higher-priority work fills its window", () => {
    // A high-priority task takes each Friday window; the lower-priority
    // occurrences lose the contest and are dropped without an error.
    const recurring = makeRecurringTask({ priority: 2 });
    const tasks = ["task-a", "task-b", "task-c"].map((id) =>
      makePlanner(id, { priority: 7, allowedTimes: FRI_WINDOW }),
    );

    const result = run([recurring, ...tasks]);

    expect(occurrenceEventsOf(result.events, "weekly-clean")).toHaveLength(0);
    for (const id of ["task-a", "task-b", "task-c"]) {
      expect(result.events.find((e) => e.id === id)).toBeDefined();
    }
    // A missed window is NOT an error: no engine message references the item.
    expect(result.messages.some((m) => m.id.includes("weekly-clean"))).toBe(
      false,
    );
  });
});

describe("occurrence completion", () => {
  it("skips a completed occurrence and freezes it at its logged window", () => {
    const completedStart = "2026-01-09T15:00:00.000Z";
    const completedEnd = "2026-01-09T16:00:00.000Z";
    const completions: OccurrenceCompletionInput[] = [
      {
        plannerId: "weekly-clean",
        occurrenceKey: WEEK0_KEY,
        start: completedStart,
        end: completedEnd,
      },
    ];

    const { events } = run([makeRecurringTask()], [], completions);
    const occ = occurrenceEventsOf(events, "weekly-clean");

    // Week 0 renders as the frozen completed tile at the logged window; week 1
    // still schedules dynamically.
    const week0 = occ.find((e) => e.id === OCC0);
    expect(week0).toBeDefined();
    expect(week0!.start).toBe(completedStart);
    expect(week0!.extendedProps?.completedStartTime).toBe(completedStart);
    expect(occ.find((e) => e.id === OCC1)).toBeDefined();
  });
});

describe("recurring task edge cases", () => {
  it("fails loud as TOO_LARGE when the duration cannot fit its window", () => {
    // 600 min cannot fit a 120-min Friday window; surfaces ONCE on the base
    // row (occurrence failures are remapped + coalesced to it).
    const recurring = makeRecurringTask({ duration: 600 });
    const result = run([recurring]);

    expect(occurrenceEventsOf(result.events, "weekly-clean")).toHaveLength(0);
    expect(
      result.messages.some((m) => m.id === taskTooLargeId("weekly-clean")),
    ).toBe(true);
  });

  it("re-emits identical occurrence events on an idle regen", () => {
    const first = run([makeRecurringTask()]);
    const second = run([makeRecurringTask()], first.events);

    const occ1 = occurrenceEventsOf(first.events, "weekly-clean").sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const occ2 = occurrenceEventsOf(second.events, "weekly-clean").sort(
      (a, b) => a.id.localeCompare(b.id),
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
      title: "weekly-clean",
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
        plannerType: "task",
        eventType: "planner",
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
      },
    } as unknown as SimpleEvent;

    const { events } = run([makeRecurringTask()], [pastOccurrence]);
    // The stale past occurrence is gone; only the future windows remain.
    expect(events.find((e) => e.start.startsWith("2026-01-02"))).toBeUndefined();
  });
});

describe("recurring goals (per-period subtree clones)", () => {
  function makeRecurringGoal(): Planner[] {
    return [
      makePlanner("goal-clean", {
        plannerType: "goal",
        duration: 0,
        recurrence: JSON.stringify({ freq: "weekly", interval: 1 }),
      }),
      makePlanner("leaf-kitchen", {
        parentId: "goal-clean",
        duration: 60,
        sortOrder: 1024,
      }),
      makePlanner("leaf-bathroom", {
        parentId: "goal-clean",
        duration: 45,
        sortOrder: 2048,
      }),
    ];
  }

  function leafEvents(events: SimpleEvent[]): SimpleEvent[] {
    return events.filter(
      (e) =>
        e.id.startsWith("leaf-kitchen|") || e.id.startsWith("leaf-bathroom|"),
    );
  }

  it("places each week's leaves in sibling order inside their own week", () => {
    const { events } = run(makeRecurringGoal());
    const placed = leafEvents(events);

    // Two leaves per materialized week.
    for (const key of [WEEK0_KEY, WEEK1_KEY, WEEK2_KEY]) {
      const kitchen = placed.find(
        (e) => e.id === occurrenceEventId("leaf-kitchen", key),
      );
      const bathroom = placed.find(
        (e) => e.id === occurrenceEventId("leaf-bathroom", key),
      );
      expect(kitchen).toBeDefined();
      expect(bathroom).toBeDefined();
      // Sibling order chains within the period: kitchen before bathroom.
      expect(new Date(kitchen!.end) <= new Date(bathroom!.start)).toBe(true);
      // Both inside their period window.
      const periodStart = new Date(key);
      const periodEnd = new Date(periodStart.getTime() + 7 * 86400000);
      for (const e of [kitchen!, bathroom!]) {
        expect(new Date(e.end) <= periodEnd).toBe(true);
      }
    }
    // The base rows never place as themselves.
    expect(events.find((e) => e.id === "goal-clean")).toBeUndefined();
    expect(events.find((e) => e.id === "leaf-kitchen")).toBeUndefined();
  });

  it("freezes a logged leaf-period and schedules only the remainder", () => {
    const completions: OccurrenceCompletionInput[] = [
      {
        plannerId: "leaf-kitchen",
        occurrenceKey: WEEK0_KEY,
        start: "2026-01-06T09:00:00.000Z",
        end: "2026-01-06T10:00:00.000Z",
      },
    ];
    const { events } = run(makeRecurringGoal(), [], completions);

    const frozen = events.find(
      (e) => e.id === occurrenceEventId("leaf-kitchen", WEEK0_KEY),
    );
    expect(frozen).toBeDefined();
    expect(frozen!.start).toBe("2026-01-06T09:00:00.000Z");
    expect(frozen!.extendedProps?.completedStartTime).toBe(
      "2026-01-06T09:00:00.000Z",
    );
    // The sibling still schedules dynamically in week 0.
    const bathroom = events.find(
      (e) => e.id === occurrenceEventId("leaf-bathroom", WEEK0_KEY),
    );
    expect(bathroom).toBeDefined();
    expect(bathroom!.extendedProps?.completedStartTime ?? null).toBeNull();
  });

  it("a fully logged period emits only frozen tiles, later periods still run", () => {
    const completions: OccurrenceCompletionInput[] = [
      {
        plannerId: "leaf-kitchen",
        occurrenceKey: WEEK0_KEY,
        start: "2026-01-06T09:00:00.000Z",
        end: "2026-01-06T10:00:00.000Z",
      },
      {
        plannerId: "leaf-bathroom",
        occurrenceKey: WEEK0_KEY,
        start: "2026-01-06T10:30:00.000Z",
        end: "2026-01-06T11:15:00.000Z",
      },
    ];
    const { events } = run(makeRecurringGoal(), [], completions);
    const placed = leafEvents(events);

    const week0 = placed.filter((e) => e.id.endsWith(WEEK0_KEY));
    expect(week0).toHaveLength(2);
    for (const e of week0) {
      expect(e.extendedProps?.completedStartTime).toBeTruthy();
    }
    // Weeks 1 and 2 still place both leaves dynamically.
    for (const key of [WEEK1_KEY, WEEK2_KEY]) {
      expect(placed.filter((e) => e.id.endsWith(key))).toHaveLength(2);
    }
  });

  it("re-emits identical leaf occurrence events on an idle regen", () => {
    const first = run(makeRecurringGoal());
    const second = run(makeRecurringGoal(), first.events);
    const pick = (events: SimpleEvent[]) =>
      leafEvents(events)
        .map((e) => ({ id: e.id, start: e.start, end: e.end }))
        .sort((a, b) => a.id.localeCompare(b.id));
    expect(pick(second.events)).toEqual(pick(first.events));
  });
});

describe("occurrence key stability across week-start changes", () => {
  // A weekly item's period key is anchored to its own createdAt, NOT the
  // user's weekStartDay preference. The completion log is bound to that key,
  // so flipping the week-start must not orphan the completion nor re-schedule
  // the already-completed week.
  const week0Completion: OccurrenceCompletionInput = {
    plannerId: "weekly-clean",
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
        [makeRecurringTask()],
        [],
        { injectTravelEvents: false, occurrenceCompletions: [week0Completion] },
      );
      const occ = occurrenceEventsOf(events, "weekly-clean");

      // Exactly one frozen completed tile, at the logged window.
      const completed = occ.filter((e) => e.extendedProps?.completedStartTime);
      expect(completed.map((e) => e.id)).toEqual([OCC0]);

      // No fresh LIVE occurrence lands in the already-completed week (Jan
      // 5-12), regardless of what the week-start is set to.
      const liveInCompletedWeek = occ.filter(
        (e) =>
          !e.extendedProps?.completedStartTime &&
          new Date(e.start) < new Date("2026-01-12"),
      );
      expect(liveInCompletedWeek).toHaveLength(0);
    });
  }
});

describe("old recurring-item enumeration", () => {
  // A daily item created long ago must still schedule its present-day
  // occurrences — enumeration is windowed near the horizon, not stepped from
  // the ancient anchor (which used to exhaust the period budget in the past).
  it("schedules a >400-day-old daily item's current occurrences", () => {
    const old = makePlanner("daily-old", {
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
      events.filter((e) => e.id.startsWith("daily-old|")).length,
    ).toBeGreaterThan(0);
    // It schedules cleanly — no failure message references it.
    expect(messages.some((m) => m.id.includes("daily-old"))).toBe(false);
  });
});
