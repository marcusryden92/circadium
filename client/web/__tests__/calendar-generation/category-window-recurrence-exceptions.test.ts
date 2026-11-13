import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { expandCategoryWindowPeriods } from "@/utils/calendar-generation/helpers/TimeSlotManager/expandCategoryWindowPeriods";
import { serializeRecurrenceExceptions } from "@/utils/planRecurrence";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";

// Per-occurrence exceptions on CategoryTimeWindow: a deleted occurrence must
// vanish from BOTH the materialized CategoryEvents and the slot fabric (a
// strict task that only fits that window must not land there), and a moved
// occurrence must keep its ORIGINAL-date id while start/end carry the
// override. Both sides expand through expandCategoryWindowPeriods, so these
// tests guard that they cannot disagree.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";
const WORK_ID = "cat-work";
const WORK_WINDOW_ID = "win-work-tue";

// JS getDay(): 0=Sun ... 6=Sat.
const TUESDAY = 2;

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

function makePlan(id: string, startsIso: string): Planner {
  return {
    ...makeTask(id, null),
    plannerType: "plan",
    starts: startsIso,
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

function run(planners: Planner[], categories: Category[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    categories,
    injectTravelEvents: false,
  });
}

function workCategoryWith(exceptionsJson: string | null): Category {
  return makeCategory({
    id: WORK_ID,
    isStrict: true,
    timeSlots: [
      makeWindow({
        id: WORK_WINDOW_ID,
        day: TUESDAY,
        recurrenceExceptions: exceptionsJson,
      }),
    ],
  });
}

describe("category window recurrence exceptions (full pipeline)", () => {
  it("a deleted occurrence vanishes from CategoryEvents and the slot fabric", () => {
    const exceptions = serializeRecurrenceExceptions([
      { key: "2026-01-06T09:00", type: "deleted" },
    ]);
    const task = makeTask("task-work", WORK_ID);

    const { events, categoryEvents } = run([task], [workCategoryWith(exceptions)]);

    const ids = categoryEvents.map((c) => c.id);
    expect(ids).not.toContain(`${WORK_WINDOW_ID}|2026-01-06`);
    expect(ids).toContain(`${WORK_WINDOW_ID}|2026-01-13`);

    // The window-constrained task skips the vacated Tuesday and lands in the
    // next intact occurrence — positive placement guards the fabric.
    const placed = events.find((e: SimpleEvent) => e.id === "task-work");
    expect(placed).toBeDefined();
    const start = new Date(placed!.start);
    expect(start.getDay()).toBe(TUESDAY);
    expect(start.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-01-13T00:00:00").getTime(),
    );
  });

  it("a moved occurrence keeps its original-date id and relocates fabric + placement", () => {
    const newStart = new Date("2026-01-07T10:00:00"); // Wednesday
    const exceptions = serializeRecurrenceExceptions([
      { key: "2026-01-06T09:00", type: "moved", newStart: newStart.toISOString() },
    ]);
    const task = makeTask("task-work", WORK_ID);

    const { events, categoryEvents } = run([task], [workCategoryWith(exceptions)]);

    const moved = categoryEvents.filter(
      (c) => c.id === `${WORK_WINDOW_ID}|2026-01-06`,
    );
    expect(moved).toHaveLength(1);
    expect(new Date(moved[0].start).getTime()).toBe(newStart.getTime());
    expect(new Date(moved[0].end).getTime()).toBe(
      newStart.getTime() + 8 * 60 * 60000,
    );

    // Nothing materializes at the vacated Tuesday slot.
    const tuesdayStart = new Date("2026-01-06T09:00:00").getTime();
    expect(
      categoryEvents.some((c) => new Date(c.start).getTime() === tuesdayStart),
    ).toBe(false);

    // The strict window-constrained task lands inside the override span —
    // the earliest occurrence that now exists.
    const placed = events.find((e: SimpleEvent) => e.id === "task-work");
    expect(placed).toBeDefined();
    const start = new Date(placed!.start);
    expect(start.getTime()).toBeGreaterThanOrEqual(newStart.getTime());
    expect(new Date(placed!.end).getTime()).toBeLessThanOrEqual(
      newStart.getTime() + 8 * 60 * 60000,
    );
  });

  it("emits a moved occurrence exactly once across horizon expansion", () => {
    // Override lands 5 weeks out — past the initial 28-day chunk. Daily plans
    // fill the first chunk's free time so the leftover task can only place
    // after expansion, which extends the horizon past the override. Tuesdays
    // keep a 30-minute uncovered window fragment: the expansion pickup point
    // is the last CategorySlot in the fabric, so at least one must survive
    // the fillers (and 30 strict minutes can't host the 300-minute task).
    const newStart = new Date("2026-02-11T10:00:00");
    const exceptions = serializeRecurrenceExceptions([
      { key: "2026-01-06T09:00", type: "moved", newStart: newStart.toISOString() },
    ]);
    const fillerPlans: Planner[] = [];
    for (let i = 0; i < 30; i++) {
      const day = new Date("2026-01-05T06:00:00");
      day.setDate(day.getDate() + i);
      if (day.getDay() === TUESDAY) {
        fillerPlans.push({
          ...makePlan(`filler-${i}a`, day.toISOString()),
          duration: 630, // 06:00-16:30
        });
        const evening = new Date(day);
        evening.setHours(17, 0, 0, 0);
        fillerPlans.push({
          ...makePlan(`filler-${i}b`, evening.toISOString()),
          duration: 300, // 17:00-22:00
        });
      } else {
        fillerPlans.push({
          ...makePlan(`filler-${i}`, day.toISOString()),
          duration: 930, // 06:00-21:30
        });
      }
    }
    const task = { ...makeTask("task-overflow", null), duration: 300 };

    const { categoryEvents } = run(
      [...fillerPlans, task],
      [workCategoryWith(exceptions)],
    );

    const ids = categoryEvents.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    const moved = categoryEvents.filter(
      (c) => c.id === `${WORK_WINDOW_ID}|2026-01-06`,
    );
    expect(moved).toHaveLength(1);
    expect(new Date(moved[0].start).getTime()).toBe(newStart.getTime());
  });
});

describe("expandCategoryWindowPeriods", () => {
  const rangeA = [new Date("2026-01-05T00:00:00"), new Date("2026-01-12T00:00:00")] as const;
  const rangeB = [new Date("2026-01-12T00:00:00"), new Date("2026-01-19T00:00:00")] as const;

  it("vacates deleted occurrences and keeps the rest", () => {
    const category = workCategoryWith(
      serializeRecurrenceExceptions([
        { key: "2026-01-06T09:00", type: "deleted" },
      ]),
    );
    const periods = expandCategoryWindowPeriods(
      [category],
      rangeA[0],
      rangeB[1],
    );
    const starts = periods.map((p) => p.start.toISOString());
    expect(starts).not.toContain(new Date("2026-01-06T09:00:00").toISOString());
    expect(starts).toContain(new Date("2026-01-13T09:00:00").toISOString());
  });

  it("emits a moved occurrence from the range containing the override, exactly once", () => {
    const newStart = new Date("2026-01-14T10:00:00");
    const category = workCategoryWith(
      serializeRecurrenceExceptions([
        {
          key: "2026-01-06T09:00",
          type: "moved",
          newStart: newStart.toISOString(),
        },
      ]),
    );

    const inA = expandCategoryWindowPeriods([category], rangeA[0], rangeA[1]);
    const inB = expandCategoryWindowPeriods([category], rangeB[0], rangeB[1]);

    // Range A iterates the original day but must not emit the override.
    expect(inA).toHaveLength(0);
    // Range B contains the override and emits it with the ORIGINAL start
    // preserved, alongside its own regular occurrence.
    const movedInB = inB.filter(
      (p) => p.start.getTime() === newStart.getTime(),
    );
    expect(movedInB).toHaveLength(1);
    expect(movedInB[0].originalStart.getTime()).toBe(
      new Date("2026-01-06T09:00:00").getTime(),
    );
    expect(
      inB.some(
        (p) =>
          p.start.getTime() === new Date("2026-01-13T09:00:00").getTime(),
      ),
    ).toBe(true);
  });

  it("preserves overnight duration when an overnight occurrence moves", () => {
    const newStart = new Date("2026-01-09T20:00:00");
    const category = makeCategory({
      id: WORK_ID,
      timeSlots: [
        makeWindow({
          id: WORK_WINDOW_ID,
          day: TUESDAY,
          startTime: "22:00",
          endTime: "06:00",
          recurrenceExceptions: serializeRecurrenceExceptions([
            {
              key: "2026-01-06T22:00",
              type: "moved",
              newStart: newStart.toISOString(),
            },
          ]),
        }),
      ],
    });
    const periods = expandCategoryWindowPeriods(
      [category],
      rangeA[0],
      rangeA[1],
    );
    const moved = periods.find((p) => p.start.getTime() === newStart.getTime());
    expect(moved).toBeDefined();
    expect(moved!.end.getTime() - moved!.start.getTime()).toBe(
      8 * 60 * 60000,
    );
  });

  it("tolerates malformed exception JSON", () => {
    const category = workCategoryWith("{not json");
    const periods = expandCategoryWindowPeriods(
      [category],
      rangeA[0],
      rangeA[1],
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].start.toISOString()).toBe(
      new Date("2026-01-06T09:00:00").toISOString(),
    );
  });
});
