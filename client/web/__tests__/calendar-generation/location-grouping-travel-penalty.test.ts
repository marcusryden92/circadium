import type { Planner } from "@/types/prisma";
import type {
  SchedulingContext,
  TravelTimeEntry,
} from "@/utils/calendar-generation/models/SchedulingModels";
import type { AvailableSlot } from "@/utils/calendar-generation/models/TimeSlot";
import { LocationGroupingStrategy } from "@/utils/calendar-generation/strategies/LocationGroupingStrategy";
import { EarliestSlotStrategy } from "@/utils/calendar-generation/strategies/EarliestSlotStrategy";
import {
  CompositeStrategy,
  type SchedulingStrategy,
} from "@/utils/calendar-generation/strategies/SchedulingStrategy";
import { DEFAULT_STRATEGY_WEIGHTS } from "@/utils/calendar-generation/strategies/defaultStrategy";

// The travel penalty must be proportional to travel relative to the task's
// duration: a long commute for a short errand is heavily penalized, the same
// commute wrapping a full workday barely registers, and the penalty is
// monotone in travel time with no saturation cap.

const TS = "2026-07-01T00:00:00.000Z";

const LOC_A = "loc-a";
const LOC_B = "loc-b";
const LOC_C = "loc-c";

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
    userId: "u",
    color: null,
    locationId: LOC_A,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  } as Planner;
}

function matrixEntry(
  from: string,
  to: string,
  minutes: number,
): [string, TravelTimeEntry] {
  return [
    `${from}->${to}`,
    {
      fromLocationId: from,
      toLocationId: to,
      rushHourMinutes: minutes,
      regularMinutes: minutes,
      nightMinutes: minutes,
    },
  ];
}

function makeSlot(
  prevLocationId: string | null | undefined,
  nextLocationId: string | null | undefined,
  startIso = "2026-07-02T10:00:00.000Z",
): AvailableSlot {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  return {
    type: "available",
    start,
    end,
    durationMinutes: 240,
    prevLocationId,
    nextLocationId,
  };
}

const context = {
  currentDate: new Date("2026-07-02T08:00:00.000Z"),
  userId: "u",
  weekStartDay: 1,
  allPlanners: [],
  scheduledEvents: [],
  metrics: {},
} as unknown as SchedulingContext;

function makeStrategy(
  entries: Array<[string, TravelTimeEntry]>,
): SchedulingStrategy {
  return new LocationGroupingStrategy(new Map(entries));
}

describe("proportional travel penalty", () => {
  test("prefers 15 minutes of travel over 120 for otherwise-equal slots", () => {
    const strategy = makeStrategy([
      matrixEntry(LOC_B, LOC_A, 15),
      matrixEntry(LOC_C, LOC_A, 120),
    ]);
    const task = makePlanner("t", { duration: 60 });

    const nearSlot = makeSlot(LOC_B, undefined);
    const farSlot = makeSlot(LOC_C, undefined);

    expect(strategy.score(task, nearSlot, context)).toBeGreaterThan(
      strategy.score(task, farSlot, context),
    );
  });

  test("composite scoring ranks the near slot above the far slot when earliness ties", () => {
    const locationGrouping = makeStrategy([
      matrixEntry(LOC_B, LOC_A, 15),
      matrixEntry(LOC_C, LOC_A, 120),
    ]);
    const composite = new CompositeStrategy([
      {
        strategy: new EarliestSlotStrategy(),
        weight: DEFAULT_STRATEGY_WEIGHTS.earliestSlot,
      },
      {
        strategy: locationGrouping,
        weight: DEFAULT_STRATEGY_WEIGHTS.locationGrouping,
      },
    ]);
    const task = makePlanner("t", { duration: 60 });

    const nearSlot = makeSlot(LOC_B, undefined);
    const farSlot = makeSlot(LOC_C, undefined);

    expect(composite.score(task, nearSlot, context)).toBeGreaterThan(
      composite.score(task, farSlot, context),
    );
  });

  test("penalty is monotone in travel time with no saturation", () => {
    const task = makePlanner("t", { duration: 60 });
    const scores = [30, 60, 120, 240].map((minutes) =>
      makeStrategy([matrixEntry(LOC_B, LOC_A, minutes)]).score(
        task,
        makeSlot(LOC_B, undefined),
        context,
      ),
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThan(scores[i - 1]);
    }
  });

  test("the same commute penalizes a short errand more than a full workday", () => {
    const strategy = makeStrategy([matrixEntry(LOC_B, LOC_A, 90)]);
    const slot = makeSlot(LOC_B, undefined);

    const errand = makePlanner("errand", { duration: 30 });
    const workday = makePlanner("workday", { duration: 480 });

    expect(strategy.score(workday, slot, context)).toBeGreaterThan(
      strategy.score(errand, slot, context),
    );
  });

  test("double-sided travel penalizes more than one-sided at the same total ratio shape", () => {
    const oneSided = makeStrategy([matrixEntry(LOC_B, LOC_A, 60)]);
    const twoSided = makeStrategy([
      matrixEntry(LOC_B, LOC_A, 30),
      matrixEntry(LOC_A, LOC_C, 30),
    ]);
    const task = makePlanner("t", { duration: 60 });

    // Same total travel minutes; the sandwiched (neither-match) case starts
    // from a lower base score and carries the larger penalty scale.
    const oneSidedScore = oneSided.score(task, makeSlot(LOC_B, undefined), context);
    const twoSidedScore = twoSided.score(task, makeSlot(LOC_B, LOC_C), context);

    expect(twoSidedScore).toBeLessThan(oneSidedScore);
  });

  test("output stays within [0, 1] for extreme inputs", () => {
    const task = makePlanner("t", { duration: 15 });
    const extreme = makeStrategy([
      matrixEntry(LOC_B, LOC_A, 100000),
      matrixEntry(LOC_A, LOC_C, 100000),
    ]);
    const score = extreme.score(task, makeSlot(LOC_B, LOC_C), context);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);

    const zeroDuration = makePlanner("z", { duration: 0 });
    const zeroScore = extreme.score(zeroDuration, makeSlot(LOC_B, LOC_C), context);
    expect(Number.isFinite(zeroScore)).toBe(true);
    expect(zeroScore).toBeGreaterThanOrEqual(0);
    expect(zeroScore).toBeLessThanOrEqual(1);

    const noTravelNoDuration = makeStrategy([]).score(
      zeroDuration,
      makeSlot(LOC_B, LOC_C),
      context,
    );
    expect(Number.isFinite(noTravelNoDuration)).toBe(true);
  });
});
