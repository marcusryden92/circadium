import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import {
  taskTooLargeId,
  taskUnschedulableId,
} from "@/utils/calendar-generation/models/EngineMessage";
import { SchedulingFailureReason } from "@/utils/calendar-generation/constants";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import type {
  Category,
  CategoryTimeWindow,
  EventTemplate,
  Planner,
  SimpleEvent,
} from "@/types/prisma";

// Per-item scheduling constraints: earliestStartDate keeps a task/goal off the
// calendar before a given instant (riding the same afterTime seam goal-leaf
// chaining uses), and allowedTimes clips dynamic placement to given weekdays /
// time-of-day ranges — inherited down a goal's subtree and enforced as slot
// fragmentation in findAllFittingSlots. A duration no allowed block can ever
// host must fail loud as TOO_LARGE instead of burning the expansion budget.
//
// Positive placement assertions guard the slot fabric — a broken fabric places
// nothing, which would let "nothing landed outside the window" pass vacuously.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // a Monday
const USER_ID = "test-user";

// JS getDay(): 0=Sun ... 6=Sat.
const TUESDAY = 2;
const WEDNESDAY = 3;

// Nightly sleep gives the week occupied structure — without it the fabric has
// no gaps and nothing schedules. Daytime 06:00-22:00 stays Available.
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

function run(planners: Planner[]) {
  return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
    injectTravelEvents: false,
  });
}

function findEvent(events: SimpleEvent[], id: string): SimpleEvent {
  const event = events.find((e) => e.id === id);
  expect(event).toBeDefined();
  return event!;
}

describe("earliestStartDate", () => {
  it("never places the task before the earliest start instant", () => {
    const earliest = new Date("2026-01-08T10:30:00"); // Thursday
    const task = makePlanner("task-earliest", {
      earliestStartDate: earliest.toISOString(),
    });
    const control = makePlanner("task-control", {});

    const { events } = run([task, control]);

    const placed = findEvent(events, "task-earliest");
    expect(new Date(placed.start).getTime()).toBeGreaterThanOrEqual(
      earliest.getTime(),
    );
    // The unconstrained control proves earlier room existed.
    expect(new Date(findEvent(events, "task-control").start).getTime()).toBeLessThan(
      earliest.getTime(),
    );
  });

  it("combines with allowed days: first allowed day at or after the date", () => {
    const earliest = new Date("2026-01-08T00:00:00"); // Thursday
    const task = makePlanner("task-combined", {
      earliestStartDate: earliest.toISOString(),
      allowedTimes: serializeAllowedTimes({ days: [WEDNESDAY], ranges: null }),
    });

    const { events } = run([task]);

    const placed = findEvent(events, "task-combined");
    const start = new Date(placed.start);
    expect(start.getTime()).toBeGreaterThanOrEqual(earliest.getTime());
    expect(start.getDay()).toBe(WEDNESDAY);
  });
});

describe("allowedTimes", () => {
  it("places only on allowed weekdays", () => {
    const task = makePlanner("task-wednesday", {
      allowedTimes: serializeAllowedTimes({ days: [WEDNESDAY], ranges: null }),
    });

    const { events } = run([task]);

    expect(new Date(findEvent(events, "task-wednesday").start).getDay()).toBe(
      WEDNESDAY,
    );
  });

  it("places inside an allowed time-of-day range", () => {
    const task = makePlanner("task-afternoon", {
      allowedTimes: serializeAllowedTimes({
        days: null,
        ranges: [{ startTime: "14:00", endTime: "16:00" }],
      }),
    });

    const { events } = run([task]);

    const placed = findEvent(events, "task-afternoon");
    const start = new Date(placed.start);
    const end = new Date(placed.end);
    expect(start.getHours()).toBeGreaterThanOrEqual(14);
    expect(
      end.getHours() < 16 || (end.getHours() === 16 && end.getMinutes() === 0),
    ).toBe(true);
  });

  it("constrains a whole goal subtree from the root", () => {
    const root = makePlanner("goal-root", {
      plannerType: "goal",
      duration: 0,
      deadline: new Date("2026-01-30T00:00:00").toISOString(),
      allowedTimes: serializeAllowedTimes({ days: [TUESDAY], ranges: null }),
    });
    const leaf1 = makePlanner("leaf-1", {
      plannerType: "goal",
      parentId: "goal-root",
      sortOrder: 1024,
    });
    const leaf2 = makePlanner("leaf-2", {
      plannerType: "goal",
      parentId: "goal-root",
      sortOrder: 2048,
    });

    const { events } = run([root, leaf1, leaf2]);

    for (const id of ["leaf-1", "leaf-2"]) {
      expect(new Date(findEvent(events, id).start).getDay()).toBe(TUESDAY);
    }
  });

  it("fails loud as TOO_LARGE when no allowed block can ever host the duration", () => {
    const task = makePlanner("task-too-large", {
      duration: 300,
      allowedTimes: serializeAllowedTimes({
        days: null,
        ranges: [{ startTime: "14:00", endTime: "16:00" }],
      }),
    });

    const { events, messages } = run([task]);

    expect(events.find((e) => e.id === "task-too-large")).toBeUndefined();
    expect(
      messages.some((m) => m.id === taskTooLargeId("task-too-large")),
    ).toBe(true);
  });

  it("re-emits identical placements on an idle regen", () => {
    const task = makePlanner("task-stable", {
      allowedTimes: serializeAllowedTimes({
        days: [WEDNESDAY],
        ranges: [{ startTime: "10:00", endTime: "13:00" }],
      }),
    });

    const first = run([task]);
    const placedFirst = findEvent(first.events, "task-stable");
    const second = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [task],
      first.events,
      { injectTravelEvents: false },
    );
    const placedSecond = findEvent(second.events, "task-stable");

    expect(placedSecond.start).toBe(placedFirst.start);
    expect(placedSecond.end).toBe(placedFirst.end);
  });
});

// Allowed times × category windows: when the two weekly patterns never
// coincide, the item is structurally unplaceable — the gate must fail it loud
// as IMPOSSIBLE_CONSTRAINTS instead of burning the expansion budget toward a
// generic NO_SLOTS.
describe("impossible constraint intersection", () => {
  const CATEGORY_ID = "cat-monday";
  const MONDAY = 1;

  function makeWindowCategory(): Category {
    const ts = FAKE_TODAY.toISOString();
    return {
      id: CATEGORY_ID,
      name: "Monday work",
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
      timeSlots: [
        {
          id: "win-monday",
          day: MONDAY,
          startTime: "09:00",
          endTime: "12:00",
          recurrenceExceptions: null,
          categoryId: CATEGORY_ID,
          userId: USER_ID,
        } as CategoryTimeWindow,
      ],
    } as Category;
  }

  function runWithCategory(planners: Planner[]) {
    return generateCalendar(USER_ID, 1, SLEEP_TEMPLATES, planners, [], {
      categories: [makeWindowCategory()],
      injectTravelEvents: false,
    });
  }

  it("fails loud when allowed times and category windows never overlap", () => {
    const impossible = makePlanner("task-impossible", {
      categoryId: CATEGORY_ID,
      allowedTimes: serializeAllowedTimes({ days: [TUESDAY], ranges: null }),
    });
    // Same category, no allowed times: proves the window fabric hosts work.
    const control = makePlanner("task-window-control", {
      categoryId: CATEGORY_ID,
    });

    const { events, messages } = runWithCategory([impossible, control]);

    expect(events.find((e) => e.id === "task-impossible")).toBeUndefined();
    expect(
      messages.some(
        (m) =>
          m.id ===
          taskUnschedulableId(
            "task-impossible",
            SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS,
          ),
      ),
    ).toBe(true);
    expect(new Date(findEvent(events, "task-window-control").start).getDay()).toBe(
      MONDAY,
    );
  });

  it("places normally when the patterns do overlap", () => {
    const task = makePlanner("task-overlapping", {
      categoryId: CATEGORY_ID,
      allowedTimes: serializeAllowedTimes({ days: [MONDAY], ranges: null }),
    });

    const { events, messages } = runWithCategory([task]);

    expect(new Date(findEvent(events, "task-overlapping").start).getDay()).toBe(
      MONDAY,
    );
    expect(
      messages.some(
        (m) =>
          m.id ===
          taskUnschedulableId(
            "task-overlapping",
            SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS,
          ),
      ),
    ).toBe(false);
  });
});

// Travel absorb/reclaim under constraints. Removing a redundant travel leg is
// always correct for a same-location follow-up; only the back-extension into
// the freed span can violate a placement bound. A constrained task must still
// coalesce travel when the slide is legal (tier 1), and when a bound sits
// inside the freed span the leg is removed without moving the task (tier 2) —
// never the old blanket behavior of a fresh round trip per placement.
describe("travel coalescing under constraints", () => {
  const MONDAY = 1;
  const HOME = "loc-home";
  const GYM = "loc-gym";
  const TRAVEL_MINUTES = 30;
  const BUFFER_MINUTES = 10;

  const HOME_SLEEP_TEMPLATES = SLEEP_TEMPLATES.map((t) => ({
    ...t,
    locationId: HOME,
  })) as EventTemplate[];

  const travelEntry = (from: string, to: string) => ({
    fromLocationId: from,
    toLocationId: to,
    rushHourMinutes: TRAVEL_MINUTES,
    regularMinutes: TRAVEL_MINUTES,
    nightMinutes: TRAVEL_MINUTES,
  });
  const TRAVEL_MATRIX = new Map([
    [`${HOME}->${GYM}`, travelEntry(HOME, GYM)],
    [`${GYM}->${HOME}`, travelEntry(GYM, HOME)],
  ]);

  function runWithTravel(planners: Planner[]) {
    return generateCalendar(USER_ID, 1, HOME_SLEEP_TEMPLATES, planners, [], {
      injectTravelEvents: true,
      travelTimeMatrix: TRAVEL_MATRIX,
      bufferTimeMinutes: BUFFER_MINUTES,
    });
  }

  it("chains same-location leaves of a day-constrained goal with one outbound and one return leg", () => {
    const root = makePlanner("bakery-goal", {
      plannerType: "goal",
      duration: 0,
      deadline: new Date("2026-01-30T00:00:00").toISOString(),
      allowedTimes: serializeAllowedTimes({ days: [MONDAY], ranges: null }),
    });
    const leaves = [1, 2, 3].map((i) =>
      makePlanner(`bakery-leaf-${i}`, {
        parentId: "bakery-goal",
        locationId: GYM,
        sortOrder: i * 1024,
      }),
    );

    const { events, travelEvents } = runWithTravel([root, ...leaves]);

    const placed = leaves.map((l) => findEvent(events, l.id));
    for (const event of placed) {
      expect(new Date(event.start).getDay()).toBe(MONDAY);
    }

    // Consecutive same-location leaves absorb the previous leaf's return
    // travel: each next leaf starts one placement buffer after the previous
    // ended, with no travel between them (a round trip would need
    // 2 * TRAVEL_MINUTES more).
    const bufferMs = BUFFER_MINUTES * 60000;
    expect(new Date(placed[1].start).getTime()).toBe(
      new Date(placed[0].end).getTime() + bufferMs,
    );
    expect(new Date(placed[2].start).getTime()).toBe(
      new Date(placed[1].end).getTime() + bufferMs,
    );

    expect(travelEvents.filter((t) => t.toLocationId === GYM)).toHaveLength(1);
    expect(travelEvents.filter((t) => t.fromLocationId === GYM)).toHaveLength(
      1,
    );
  });

  it("removes the redundant travel without back-extending when a bound sits inside the freed span", () => {
    const first = makePlanner("gym-first", {
      locationId: GYM,
      priority: 7,
    });

    // Calibrate: place the first task alone to learn where its return leg
    // ends, then bound the second task a few minutes after that — inside the
    // absorb search window, but with the freed span lying before the bound.
    const solo = runWithTravel([first]);
    const soloFirst = findEvent(solo.events, "gym-first");
    const legEnd = new Date(
      new Date(soloFirst.end).getTime() + TRAVEL_MINUTES * 60000,
    );
    const earliest = new Date(legEnd.getTime() + 5 * 60000);

    const second = makePlanner("gym-second", {
      locationId: GYM,
      priority: 2,
      earliestStartDate: earliest.toISOString(),
    });

    const { events, travelEvents } = runWithTravel([first, second]);

    const placedFirst = findEvent(events, "gym-first");
    const placedSecond = findEvent(events, "gym-second");

    // The earliest-start bound is respected: no back-extension into the
    // freed travel span (which would start before the bound).
    expect(new Date(placedSecond.start).getTime()).toBeGreaterThanOrEqual(
      earliest.getTime(),
    );
    expect(new Date(placedSecond.start).getTime()).toBeGreaterThan(
      new Date(placedFirst.end).getTime(),
    );

    // The first task's return leg is still removed: one outbound to the gym
    // (before the first task), one return home (after the second).
    expect(travelEvents.filter((t) => t.toLocationId === GYM)).toHaveLength(1);
    expect(travelEvents.filter((t) => t.fromLocationId === GYM)).toHaveLength(
      1,
    );
  });
});

// The third constraint-axis pair: allowed times x template structure. Each
// axis alone can look roomy (the allowed pattern is wide; the clean week has
// big template-free gaps in the evening) while their intersection never hosts
// the block plus its trailing buffer — the leaf must fail loud as TOO_LARGE
// instead of burning the whole expansion budget as transient NO_SLOTS, which
// also starves everything chained/queued behind it.
describe("allowed times x template structure", () => {
  // Sleep 22:00-06:00 plus a daily 12:00-13:00 lunch block: clean-week gaps
  // are 06:00-12:00 (360m) and 13:00-22:00 (540m). Allowed times 09:00-17:00
  // intersect them to 09:00-12:00 (180m) and 13:00-17:00 (240m).
  const LUNCH_TEMPLATES: EventTemplate[] = [
    ...SLEEP_TEMPLATES,
    ...([0, 1, 2, 3, 4, 5, 6].map((d) => ({
      id: `lunch-${d}`,
      title: "Lunch",
      startDay: d,
      startTime: "12:00",
      duration: 60,
      userId: USER_ID,
      color: null,
      locationId: null,
      recurrenceExceptions: null,
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
    })) as unknown as EventTemplate[]),
  ];
  const NINE_TO_FIVE = serializeAllowedTimes({
    days: null,
    ranges: [{ startTime: "09:00", endTime: "17:00" }],
  });

  function runWithLunch(planners: Planner[], templates = LUNCH_TEMPLATES) {
    return generateCalendar(USER_ID, 1, templates, planners, [], {
      injectTravelEvents: false,
    });
  }

  it("fails a block no allowed x template fragment can host as TOO_LARGE", () => {
    // 300m fits the allowed pattern alone (480m) and the clean-week gap alone
    // (540m, evenings) but no intersection fragment (max 240m).
    const victim = makePlanner("task-intersect-too-large", {
      duration: 300,
      allowedTimes: NINE_TO_FIVE,
    });
    // 240m fails by the buffer margin alone: the fit-test needs the trailing
    // buffer inside the same fragment, so a block exactly the fragment size
    // can never place either.
    const exactFit = makePlanner("task-exact-fit", {
      duration: 240,
      allowedTimes: NINE_TO_FIVE,
    });
    const control = makePlanner("task-intersect-control", {
      duration: 200,
      allowedTimes: NINE_TO_FIVE,
    });

    const { events, messages } = runWithLunch([victim, exactFit, control]);

    expect(
      messages.some(
        (m) => m.id === taskTooLargeId("task-intersect-too-large"),
      ),
    ).toBe(true);
    expect(
      messages.some((m) => m.id === taskTooLargeId("task-exact-fit")),
    ).toBe(true);
    expect(events.find((e) => e.id === "task-intersect-too-large")).toBeUndefined();
    expect(events.find((e) => e.id === "task-exact-fit")).toBeUndefined();

    // The control still places, inside the 13:00-17:00 fragment.
    const placed = findEvent(events, "task-intersect-control");
    const start = new Date(placed.start);
    const end = new Date(placed.end);
    expect(start.getHours()).toBeGreaterThanOrEqual(13);
    expect(end.getHours() + end.getMinutes() / 60).toBeLessThanOrEqual(17);
    expect(
      messages.some((m) => m.id === taskTooLargeId("task-intersect-control")),
    ).toBe(false);
  });

  it("still gates when only disallowed-day templates carry exceptions", () => {
    // Exceptions on a Saturday-only template cannot open room on the allowed
    // Monday, so the structural check must stay active.
    const mondayOnly = serializeAllowedTimes({
      days: [1],
      ranges: [{ startTime: "09:00", endTime: "17:00" }],
    });
    const templates = LUNCH_TEMPLATES.map((t) =>
      t.id === "lunch-6"
        ? {
            ...t,
            recurrenceExceptions: JSON.stringify([
              { key: "2026-01-10T12:00", type: "deleted" },
            ]),
          }
        : t,
    ) as EventTemplate[];
    const victim = makePlanner("task-guarded", {
      duration: 300,
      allowedTimes: mondayOnly,
    });

    const { events, messages } = runWithLunch([victim], templates);

    expect(messages.some((m) => m.id === taskTooLargeId("task-guarded"))).toBe(
      true,
    );
    expect(events.find((e) => e.id === "task-guarded")).toBeUndefined();
  });

  it("places across midnight when an overnight allowed range spans a template-free night", () => {
    // Overnight ranges drop the allowed axis of the ceiling: per-day sampling
    // would truncate the Fri 20:00-02:00 fragment at midnight (~240m) and
    // false-fail a 300m block the real fabric hosts whole.
    const templates = SLEEP_TEMPLATES.filter((t) => t.id !== "sleep-5");
    const task = makePlanner("task-overnight-allowed", {
      duration: 300,
      allowedTimes: serializeAllowedTimes({
        days: null,
        ranges: [{ startTime: "20:00", endTime: "02:00" }],
      }),
    });

    const { events, messages } = runWithLunch([task], templates);

    expect(
      messages.some((m) => m.id === taskTooLargeId("task-overnight-allowed")),
    ).toBe(false);
    const placed = findEvent(events, "task-overnight-allowed");
    const start = new Date(placed.start);
    const end = new Date(placed.end);
    expect(start.getDay()).toBe(5);
    expect(start.getHours()).toBe(20);
    expect(end.getDay()).toBe(6);
    expect(end.getHours()).toBe(1);
  });
});

// Category windows x template structure — no allowed times involved. The
// per-axis gates each pass (the largest window is roomy; the clean week has
// big template-free gaps), but the windows themselves can be covered by
// templates, leaving no fragment that hosts the block plus its trailing
// buffer. The unified ceiling fails it loud as TOO_LARGE instead of letting
// it burn the expansion budget as transient NO_SLOTS.
describe("category windows x template structure", () => {
  const MONDAY = 1;
  const FRIDAY = 5;
  const CATEGORY_ID = "cat-windowed";

  function makeCategory(
    windows: Array<
      Pick<CategoryTimeWindow, "id" | "day" | "startTime" | "endTime">
    >,
  ): Category {
    const ts = FAKE_TODAY.toISOString();
    return {
      id: CATEGORY_ID,
      name: "Windowed",
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
      timeSlots: windows.map(
        (w) =>
          ({
            ...w,
            recurrenceExceptions: null,
            categoryId: CATEGORY_ID,
            userId: USER_ID,
          }) as CategoryTimeWindow,
      ),
    } as Category;
  }

  function blockTemplate(
    id: string,
    startDay: number,
    startTime: string,
    duration: number,
  ): EventTemplate {
    return {
      id,
      title: id,
      startDay,
      startTime,
      duration,
      userId: USER_ID,
      color: null,
      locationId: null,
      recurrenceExceptions: null,
      createdAt: FAKE_TODAY.toISOString(),
      updatedAt: FAKE_TODAY.toISOString(),
    } as unknown as EventTemplate;
  }

  function runWindowed(
    planners: Planner[],
    templates: EventTemplate[],
    windows: Array<
      Pick<CategoryTimeWindow, "id" | "day" | "startTime" | "endTime">
    >,
  ) {
    return generateCalendar(USER_ID, 1, templates, planners, [], {
      categories: [makeCategory(windows)],
      injectTravelEvents: false,
    });
  }

  it("fails loud when the windows are fully template-covered", () => {
    const templates = [
      ...SLEEP_TEMPLATES,
      blockTemplate("block-monday", MONDAY, "09:00", 180),
    ];
    const victim = makePlanner("task-covered-window", {
      categoryId: CATEGORY_ID,
    });
    // Uncategorized: proves the plain-gap fabric still hosts work.
    const control = makePlanner("task-plain-control", {});

    const { events, messages } = runWindowed([victim, control], templates, [
      { id: "win-mon", day: MONDAY, startTime: "09:00", endTime: "12:00" },
    ]);

    const tooLarge = messages.find(
      (m) => m.id === taskTooLargeId("task-covered-window"),
    );
    expect(tooLarge).toBeDefined();
    expect(
      (tooLarge!.payload as { limitingAxis?: string }).limitingAxis,
    ).toBe("templateIntersection");
    expect(events.find((e) => e.id === "task-covered-window")).toBeUndefined();
    findEvent(events, "task-plain-control");
  });

  it("caps at the residual window fragment minus the trailing buffer", () => {
    // A Mon 09:00-11:00 template leaves 60m of the 09:00-12:00 window; the
    // fit-test needs the trailing buffer (10m default) inside the fragment,
    // so 55m fails loud while 40m places at 11:00.
    const templates = [
      ...SLEEP_TEMPLATES,
      blockTemplate("block-monday-partial", MONDAY, "09:00", 120),
    ];
    const victim = makePlanner("task-over-residual", {
      categoryId: CATEGORY_ID,
      duration: 55,
    });
    const control = makePlanner("task-in-residual", {
      categoryId: CATEGORY_ID,
      duration: 40,
    });

    const { events, messages } = runWindowed([victim, control], templates, [
      { id: "win-mon", day: MONDAY, startTime: "09:00", endTime: "12:00" },
    ]);

    expect(
      messages.some((m) => m.id === taskTooLargeId("task-over-residual")),
    ).toBe(true);
    expect(events.find((e) => e.id === "task-over-residual")).toBeUndefined();
    // Placed inside the 11:00-12:00 residual (the exact start also carries a
    // leading buffer after the abutting template block).
    const placed = findEvent(events, "task-in-residual");
    const start = new Date(placed.start);
    const end = new Date(placed.end);
    expect(start.getDay()).toBe(MONDAY);
    expect(start.getHours()).toBe(11);
    expect(end.getHours() * 60 + end.getMinutes()).toBeLessThanOrEqual(720);
  });

  it("places across midnight when an overnight window spans a template-free night", () => {
    // Overnight windows drop the window axis of the ceiling: per-day sampling
    // would truncate the Fri 20:00-02:00 window at midnight (~240m) and
    // false-fail a 300m block the real fabric hosts whole.
    const templates = SLEEP_TEMPLATES.filter((t) => t.id !== "sleep-5");
    const task = makePlanner("task-overnight-window", {
      categoryId: CATEGORY_ID,
      duration: 300,
    });

    const { events, messages } = runWindowed([task], templates, [
      { id: "win-fri-night", day: FRIDAY, startTime: "20:00", endTime: "02:00" },
    ]);

    expect(
      messages.some((m) => m.id === taskTooLargeId("task-overnight-window")),
    ).toBe(false);
    const placed = findEvent(events, "task-overnight-window");
    const start = new Date(placed.start);
    const end = new Date(placed.end);
    expect(start.getDay()).toBe(FRIDAY);
    expect(start.getHours()).toBe(20);
    expect(end.getDay()).toBe(6);
    expect(end.getHours()).toBe(1);
  });
});

// The full triple: windows Mon+Tue 09:00-12:00, allowed days Mon+Wed, and a
// template covering Mon 09:00-12:00. Every pairwise projection is non-empty —
// allowed∩windows = Monday morning (so the IMPOSSIBLE_CONSTRAINTS gate
// passes), windows∩template-free = Tuesday morning, allowed∩template-free =
// all of Wednesday — but no instant satisfies all three. Only the unified
// triple ceiling can fail it before the expansion budget burns.
describe("allowed times x category windows x template structure", () => {
  const MONDAY = 1;
  const CATEGORY_ID = "cat-triple";

  it("fails the empty triple loud while both pairwise controls place", () => {
    const ts = FAKE_TODAY.toISOString();
    const category = {
      id: CATEGORY_ID,
      name: "Triple",
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
      timeSlots: [MONDAY, TUESDAY].map(
        (day) =>
          ({
            id: `win-triple-${day}`,
            day,
            startTime: "09:00",
            endTime: "12:00",
            recurrenceExceptions: null,
            categoryId: CATEGORY_ID,
            userId: USER_ID,
          }) as CategoryTimeWindow,
      ),
    } as Category;
    const templates = [
      ...SLEEP_TEMPLATES,
      {
        id: "block-monday-morning",
        title: "Standup marathon",
        startDay: MONDAY,
        startTime: "09:00",
        duration: 180,
        userId: USER_ID,
        color: null,
        locationId: null,
        recurrenceExceptions: null,
        createdAt: ts,
        updatedAt: ts,
      } as unknown as EventTemplate,
    ];
    const monWed = serializeAllowedTimes({
      days: [MONDAY, WEDNESDAY],
      ranges: null,
    });

    const victim = makePlanner("task-empty-triple", {
      categoryId: CATEGORY_ID,
      allowedTimes: monWed,
    });
    const windowControl = makePlanner("task-window-pair", {
      categoryId: CATEGORY_ID,
    });
    const allowedControl = makePlanner("task-allowed-pair", {
      allowedTimes: monWed,
    });

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      templates,
      [victim, windowControl, allowedControl],
      [],
      { categories: [category], injectTravelEvents: false },
    );

    const tripleMessage = messages.find(
      (m) => m.id === taskTooLargeId("task-empty-triple"),
    );
    expect(tripleMessage).toBeDefined();
    expect(
      (tripleMessage!.payload as { limitingAxis?: string }).limitingAxis,
    ).toBe("templateIntersection");
    // Not the pairwise allowed x windows message: that projection is non-empty.
    expect(
      messages.some(
        (m) =>
          m.id ===
          taskUnschedulableId(
            "task-empty-triple",
            SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS,
          ),
      ),
    ).toBe(false);
    expect(events.find((e) => e.id === "task-empty-triple")).toBeUndefined();

    const windowPlaced = findEvent(events, "task-window-pair");
    expect(new Date(windowPlaced.start).getDay()).toBe(TUESDAY);
    expect(new Date(windowPlaced.start).getHours()).toBe(9);

    const allowedPlaced = findEvent(events, "task-allowed-pair");
    expect([MONDAY, WEDNESDAY]).toContain(
      new Date(allowedPlaced.start).getDay(),
    );
  });
});
