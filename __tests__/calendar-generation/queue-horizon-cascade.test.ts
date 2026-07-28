import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type {
  Category,
  EventTemplate,
  Planner,
  PlannerDependency,
  Queue,
  SimpleEvent,
} from "@/types/prisma";

// A queue whose FIRST member cannot finish within the expansion budget must
// not scramble the rest of the chain. The old post-budget path stamped every
// unresolved source "horizon" at once and ran a single sweep in the pool's
// constrained-first order — so a category-constrained LAST member attempted
// BEFORE the middle member it is queued behind, read the middle member's
// stamped outcome (no lastEnd: it had never placed anything), and scheduled
// unbounded near now — visibly in the middle of the queue, with an extra
// misleading SEQUENCE_PAST_HORIZON for the merely-blocked middle member. The
// fix resolves the tail topologically: only the genuinely stuck source is
// stamped, each successor places bounded after what its predecessor actually
// placed, and exactly one accurate message survives.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // Monday
const USER_ID = "test-user";
const DAY = 24 * 60 * 60 * 1000;
const TS = FAKE_TODAY.toISOString();

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

function makePlanner(id: string, overrides: Partial<Planner> = {}): Planner {
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
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  } as Planner;
}

function makeGoal(rootId: string, leafIds: string[]): Planner[] {
  return [
    makePlanner(rootId, {
      plannerType: "goal",
      deadline: new Date(FAKE_TODAY.getTime() + 60 * DAY).toISOString(),
    }),
    ...leafIds.map((leafId, i) =>
      makePlanner(leafId, { parentId: rootId, sortOrder: (i + 1) * 1024 }),
    ),
  ];
}

// A soft category with generous daily windows: enough room near now that an
// unbounded constrained member could land right at the head of the calendar.
const LEARNING_ID = "learning-category";
const LEARNING: Category = {
  id: LEARNING_ID,
  name: "Learning",
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
  timeSlots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    id: `learning-window-${day}`,
    day,
    startTime: "09:00",
    endTime: "20:00",
    recurrenceExceptions: null,
    categoryId: LEARNING_ID,
    userId: USER_ID,
  })),
} as unknown as Category;

function makeQueue(id: string, memberPlannerIds: string[]): Queue {
  return {
    id,
    title: id,
    sortOrder: 0,
    color: null,
    categoryId: null,
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
  } as Queue;
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

describe("queue with a horizon-overflowing first member", () => {
  it("keeps the rest of the chain in order and reports one accurate break", () => {
    // First member: two placeable leaves plus one bounded ~900 days out —
    // past the ~840-day expansion ceiling, so it can never place and the
    // member never fully resolves.
    const farStart = new Date(FAKE_TODAY.getTime() + 900 * DAY).toISOString();
    const first = [
      ...makeGoal("first", ["first-leaf-1", "first-leaf-2"]),
      makePlanner("first-leaf-far", {
        parentId: "first",
        sortOrder: 3072,
        earliestStartDate: farStart,
      }),
    ];
    const middle = makeGoal("middle", ["middle-leaf-1", "middle-leaf-2"]);
    // The last member is category-constrained — the pool's constrained-first
    // tier puts its leaves ahead of the unconstrained middle member's, the
    // exact shape that let it jump the broken chain.
    const last = makeGoal("last", ["last-leaf-1", "last-leaf-2"]).map((p) =>
      p.id === "last" ? { ...p, categoryId: LEARNING_ID } : p,
    );
    const planner = [...first, ...middle, ...last];
    const queue = makeQueue("pipe", ["first", "middle", "last"]);

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      planner,
      [],
      { injectTravelEvents: false, queues: [queue], categories: [LEARNING] },
    );

    const eventsOf = (ids: string[]) =>
      events.filter((e: SimpleEvent) =>
        ids.includes(plannerIdFromEventId(e.id)),
      );
    const maxEnd = (evts: SimpleEvent[]) =>
      Math.max(...evts.map((e) => new Date(e.end).getTime()));
    const minStart = (evts: SimpleEvent[]) =>
      Math.min(...evts.map((e) => new Date(e.start).getTime()));

    const firstEvents = eventsOf(["first-leaf-1", "first-leaf-2"]);
    const farEvents = eventsOf(["first-leaf-far"]);
    const middleEvents = eventsOf(["middle-leaf-1", "middle-leaf-2"]);
    const lastEvents = eventsOf(["last-leaf-1", "last-leaf-2"]);

    // The stuck leaf never places; its siblings do.
    expect(farEvents).toEqual([]);
    expect(firstEvents).toHaveLength(2);

    // Later members still place — each bounded after what the previous
    // member actually placed, never jumping into the middle of the chain.
    expect(middleEvents).toHaveLength(2);
    expect(lastEvents).toHaveLength(2);
    expect(minStart(middleEvents)).toBeGreaterThanOrEqual(maxEnd(firstEvents));
    expect(minStart(lastEvents)).toBeGreaterThanOrEqual(maxEnd(middleEvents));

    // Exactly one break, on the edge out of the genuinely stuck member. The
    // middle member was only ever waiting — no second message for it.
    const horizonMessages = messages.filter(
      (m) => m.type === "SEQUENCE_PAST_HORIZON",
    );
    expect(horizonMessages).toHaveLength(1);
    expect(horizonMessages[0].payload).toMatchObject({
      predecessorId: "first",
      successorId: "middle",
    });

    // The middle and last members are fine — no unschedulable rows for them.
    const unschedulableIds = messages
      .filter((m) => m.type === "TASK_UNSCHEDULABLE")
      .map((m) => (m.payload as { plannerId?: string })?.plannerId);
    expect(unschedulableIds).not.toEqual(
      expect.arrayContaining(["middle", "last"]),
    );
  });

  it("keeps a dependency chain behind a chain-blocked node anchor in order", () => {
    // The anchor variant of the same cascade: goal H's step order is
    // L1 -> S2, L1 is bounded past the expansion budget, and S2 — a
    // node-level dependency predecessor — is chain-blocked behind it
    // forever, so S2 never even attempts placement. The transitive stuck
    // rule must still stamp S2 (its leaf is trapped behind L1's failure)
    // while leaving D — merely waiting on S2's outcome — unstamped, so E
    // (category-constrained, sorted ahead of D in the pool) places after D
    // instead of jumping to the head of the calendar.
    const farStart = new Date(FAKE_TODAY.getTime() + 900 * DAY).toISOString();
    const host = [
      makePlanner("host", {
        plannerType: "goal",
        deadline: new Date(FAKE_TODAY.getTime() + 60 * DAY).toISOString(),
      }),
      makePlanner("host-l1", {
        parentId: "host",
        sortOrder: 1024,
        earliestStartDate: farStart,
      }),
      makePlanner("host-s2", { parentId: "host", sortOrder: 2048 }),
    ];
    const dTask = makePlanner("d-task");
    const eTask = makePlanner("e-task", { categoryId: LEARNING_ID });
    const makeDependency = (
      predecessorId: string,
      successorId: string,
    ): PlannerDependency =>
      ({
        id: `dep-${predecessorId}-${successorId}`,
        predecessorId,
        successorId,
        userId: USER_ID,
        createdAt: TS,
        updatedAt: TS,
      }) as PlannerDependency;

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [...host, dTask, eTask],
      [],
      {
        injectTravelEvents: false,
        categories: [LEARNING],
        dependencies: [
          makeDependency("host-s2", "d-task"),
          makeDependency("d-task", "e-task"),
        ],
      },
    );

    const eventOf = (id: string) =>
      events.find((e: SimpleEvent) => plannerIdFromEventId(e.id) === id);

    // The trapped step and its blocked anchor never place.
    expect(eventOf("host-l1")).toBeUndefined();
    expect(eventOf("host-s2")).toBeUndefined();

    // D and E still place — E after D, never before it.
    const dEvent = eventOf("d-task");
    const eEvent = eventOf("e-task");
    expect(dEvent).toBeDefined();
    expect(eEvent).toBeDefined();
    expect(new Date(eEvent!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(dEvent!.end).getTime(),
    );

    // One break on the edge out of the trapped anchor; none for D -> E.
    const horizonMessages = messages.filter(
      (m) => m.type === "SEQUENCE_PAST_HORIZON",
    );
    expect(horizonMessages).toHaveLength(1);
    expect(horizonMessages[0].payload).toMatchObject({
      predecessorId: "host-s2",
      successorId: "d-task",
    });
  });
});
