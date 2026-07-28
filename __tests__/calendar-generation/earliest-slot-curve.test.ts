import type { Planner } from "@/types/prisma";
import type { SchedulingContext } from "@/utils/calendar-generation/models/SchedulingModels";
import type { AvailableSlot } from "@/utils/calendar-generation/models/TimeSlot";
import { EarliestSlotStrategy } from "@/utils/calendar-generation/strategies/EarliestSlotStrategy";

// The earliness score must keep a usable gradient across the whole search
// range: a curve that hits exactly zero past a fixed window stops
// discriminating, leaving far-horizon placement to array order.

const NOW = new Date("2026-07-02T08:00:00.000Z");

const context = {
  currentDate: NOW,
  userId: "u",
  weekStartDay: 1,
  allPlanners: [],
  scheduledEvents: [],
  metrics: {},
} as unknown as SchedulingContext;

const task = { id: "t", duration: 60 } as Planner;

function slotAtDays(days: number): AvailableSlot {
  const start = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    type: "available",
    start,
    end: new Date(start.getTime() + 60 * 60 * 1000),
    durationMinutes: 60,
    prevLocationId: null,
    nextLocationId: null,
  };
}

const strategy = new EarliestSlotStrategy();

describe("earliness curve", () => {
  test("day 0 scores 1.0", () => {
    expect(strategy.score(task, slotAtDays(0), context)).toBeCloseTo(1.0, 10);
  });

  test("slots 30 and 45 days out produce different scores", () => {
    const at30 = strategy.score(task, slotAtDays(30), context);
    const at45 = strategy.score(task, slotAtDays(45), context);
    expect(at30).toBeGreaterThan(at45);
  });

  test("strictly decreasing and never zero across the search range", () => {
    let prev = Infinity;
    for (let day = 0; day <= 90; day++) {
      const score = strategy.score(task, slotAtDays(day), context);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(prev);
      prev = score;
    }
  });

  test("a slot already underway never scores above 1.0", () => {
    const score = strategy.score(task, slotAtDays(-0.5), context);
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThan(0);
  });
});
