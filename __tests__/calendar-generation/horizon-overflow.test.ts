import { generateCalendar } from "@/utils/calendar-generation/calendarGeneration";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type {
  EventTemplate,
  Planner,
  PlannerDependency,
  SimpleEvent,
} from "@/types/prisma";

// The horizon expands on demand until every placeable item is scheduled, and
// the per-item slot finder can reach any slot expansion builds. Regressions for
// (1) the finder's fixed afterDate+N day cap hiding already-built slots, and
// (2) the outer loop's fixed expansion ceiling stopping short of a far item.
// Both used to fail items with "No available time slots within the search
// horizon" while free space sat further out.

const FAKE_TODAY = new Date("2026-01-05T08:00:00"); // Monday
const USER_ID = "test-user";
const DAY = 24 * 60 * 60 * 1000;

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

function makePlanner(id: string, overrides: Partial<Planner> = {}): Planner {
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

// A full-day plan (06:00-22:00) that, together with the 22:00-06:00 sleep
// template, leaves no free time on its day.
function fullDayPlan(dayOffset: number): Planner {
  const start = new Date(FAKE_TODAY.getTime() + dayOffset * DAY);
  start.setHours(6, 0, 0, 0);
  return makePlanner(`fill-${dayOffset}`, {
    plannerType: "plan",
    starts: start.toISOString(),
    duration: 16 * 60,
  });
}

function makeDependency(
  predecessorId: string,
  successorId: string,
): PlannerDependency {
  const ts = FAKE_TODAY.toISOString();
  return {
    id: `dep-${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    userId: USER_ID,
    createdAt: ts,
    updatedAt: ts,
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

describe("horizon overflow — finder reaches expanded fabric", () => {
  it("places a today-anchored task in free space past the 90-day mark", () => {
    // Days 0-94 are fully occupied by plans + sleep, so the only room for the
    // unbounded victim task is day 95+ — well past the old 90-day finder cap.
    const FILL_DAYS = 95;
    const fillers: Planner[] = [];
    for (let d = 0; d < FILL_DAYS; d++) fillers.push(fullDayPlan(d));

    const victim = makePlanner("victim", { duration: 60 });
    const planner = [...fillers, victim];

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      planner,
      [],
      { injectTravelEvents: false },
    );

    const victimEvent = events.find(
      (e: SimpleEvent) => plannerIdFromEventId(e.id) === "victim",
    );
    const unschedulable = messages.filter(
      (m) =>
        m.type === "TASK_UNSCHEDULABLE" &&
        (m.payload as { plannerId?: string })?.plannerId === "victim",
    );

    expect(unschedulable).toEqual([]);
    expect(victimEvent).toBeDefined();
    const startOffsetDays =
      (new Date(victimEvent!.start).getTime() - FAKE_TODAY.getTime()) / DAY;
    // Proves the finder scanned past the old 90-day ceiling into fabric that
    // horizon expansion built.
    expect(startOffsetDays).toBeGreaterThan(90);
  });

  it("expands the horizon as far as needed to place a far-future item", () => {
    // ~400 days out — well past the old fixed 336/392-day expansion ceiling.
    // The scheduler must keep marching the horizon out to the item's earliest
    // start instead of giving up at a fixed number of expansions.
    const targetOffset = 400;
    const target = new Date(FAKE_TODAY.getTime() + targetOffset * DAY);
    target.setHours(0, 0, 0, 0);

    const nearTerm = makePlanner("near", { duration: 60 });
    const farItem = makePlanner("far", {
      duration: 60,
      earliestStartDate: target.toISOString(),
    });

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      [nearTerm, farItem],
      [],
      { injectTravelEvents: false },
    );

    const farEvent = events.find(
      (e: SimpleEvent) => plannerIdFromEventId(e.id) === "far",
    );
    const unschedulable = messages.filter(
      (m) =>
        m.type === "TASK_UNSCHEDULABLE" &&
        (m.payload as { plannerId?: string })?.plannerId === "far",
    );

    expect(unschedulable).toEqual([]);
    expect(farEvent).toBeDefined();
    expect(new Date(farEvent!.start).getTime()).toBeGreaterThanOrEqual(
      target.getTime(),
    );
  });

  it("keeps expanding past a full region to place a successor bounded by a far predecessor", () => {
    // Regression: the outer loop must not abandon a placeable precedence
    // successor. PRED is bounded far out (earliest start day 130) so it places
    // only after the horizon marches to it; a fully-occupied region wider than
    // several expansion chunks then sits between PRED's placement and the next
    // free space. SUCC depends on PRED, so its only bound is PRED's placed end
    // (no earliestStart of its own). The loop must keep expanding PAST the full
    // region until SUCC lands — the removed "unproductive" early-stop would
    // have dropped SUCC after a few no-placement expansions even though its
    // slot is well within the ~2-year budget. The large free area BEFORE the
    // predecessor bound (days 0-129) keeps availableCount above the watermark,
    // so the expansions are reactive fallbacks (the path the stop governed),
    // not neutral proactive ones.
    const PRED_START_DAY = 130;
    const FULL_UNTIL_DAY = 260;
    const predStart = new Date(FAKE_TODAY.getTime() + PRED_START_DAY * DAY);
    predStart.setHours(0, 0, 0, 0);

    // Day 130 is free only 06:00-08:00; PRED (60min) takes part of it, leaving
    // under SUCC's 120min so SUCC cannot slip in on PRED's own day. Days
    // 131..259 are fully occupied; day 260+ is free.
    const predDayPlanStart = new Date(predStart.getTime());
    predDayPlanStart.setHours(8, 0, 0, 0);
    const predDayFiller = makePlanner("fill-pred-day", {
      plannerType: "plan",
      starts: predDayPlanStart.toISOString(),
      duration: 14 * 60,
    });
    const fillers: Planner[] = [predDayFiller];
    for (let d = PRED_START_DAY + 1; d < FULL_UNTIL_DAY; d++) {
      fillers.push(fullDayPlan(d));
    }

    const pred = makePlanner("pred", {
      duration: 60,
      earliestStartDate: predStart.toISOString(),
    });
    const succ = makePlanner("succ", { duration: 120 });
    const planner = [...fillers, pred, succ];

    const { events, messages } = generateCalendar(
      USER_ID,
      1,
      SLEEP_TEMPLATES,
      planner,
      [],
      {
        injectTravelEvents: false,
        dependencies: [makeDependency("pred", "succ")],
      },
    );

    const predEvent = events.find(
      (e: SimpleEvent) => plannerIdFromEventId(e.id) === "pred",
    );
    const succEvent = events.find(
      (e: SimpleEvent) => plannerIdFromEventId(e.id) === "succ",
    );
    const succUnschedulable = messages.filter(
      (m) =>
        m.type === "TASK_UNSCHEDULABLE" &&
        (m.payload as { plannerId?: string })?.plannerId === "succ",
    );

    expect(predEvent).toBeDefined();
    expect(succUnschedulable).toEqual([]);
    expect(succEvent).toBeDefined();
    expect(new Date(succEvent!.start).getTime()).toBeGreaterThanOrEqual(
      new Date(predEvent!.end).getTime(),
    );
    // Placed in the free space beyond the full region (past the old early-stop).
    const lastRegionEnd = new Date(
      FAKE_TODAY.getTime() + (FULL_UNTIL_DAY - 1) * DAY,
    );
    lastRegionEnd.setHours(22, 0, 0, 0);
    expect(new Date(succEvent!.start).getTime()).toBeGreaterThanOrEqual(
      lastRegionEnd.getTime(),
    );
  });
});
