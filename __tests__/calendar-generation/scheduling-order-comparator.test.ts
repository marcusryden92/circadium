import {
  compareSchedulingOrder,
  type SchedulingOrderKey,
} from "@/utils/calendar-generation/helpers/PrioritySorter/schedulingOrder";

// The one shared comparator: constrained -> scarcity -> EDF slack -> score
// -> attempts (aging) -> index. Each tier must only break ties left by the
// tiers above it.

function key(overrides: Partial<SchedulingOrderKey>): SchedulingOrderKey {
  return {
    constrained: false,
    scarcityMinutes: null,
    slackMinutes: null,
    score: 0,
    attempts: 0,
    index: 0,
    ...overrides,
  };
}

describe("compareSchedulingOrder tiers", () => {
  it("constrained beats everything below", () => {
    const constrained = key({ constrained: true, score: 0 });
    const urgent = key({ slackMinutes: 10, score: 99, attempts: 5 });
    expect(compareSchedulingOrder(constrained, urgent)).toBeLessThan(0);
  });

  it("scarcity orders within the constrained tier", () => {
    const scarce = key({ constrained: true, scarcityMinutes: 240 });
    const plenty = key({ constrained: true, scarcityMinutes: 2400, score: 9 });
    expect(compareSchedulingOrder(scarce, plenty)).toBeLessThan(0);
  });

  it("EDF slack beats score but not scarcity", () => {
    const edf = key({ slackMinutes: 100, score: 1 });
    const scored = key({ score: 9 });
    expect(compareSchedulingOrder(edf, scored)).toBeLessThan(0);

    const scarceNoDeadline = key({ constrained: true, scarcityMinutes: 100 });
    const edfConstrained = key({
      constrained: true,
      scarcityMinutes: 500,
      slackMinutes: 10,
    });
    expect(
      compareSchedulingOrder(scarceNoDeadline, edfConstrained),
    ).toBeLessThan(0);
  });

  it("attempts age a leaf up within its band, never across tiers", () => {
    const aged = key({ score: 5, attempts: 3, index: 9 });
    const fresh = key({ score: 5, attempts: 0, index: 0 });
    expect(compareSchedulingOrder(aged, fresh)).toBeLessThan(0);

    const agedLowScore = key({ score: 1, attempts: 10 });
    const freshHighScore = key({ score: 5 });
    expect(compareSchedulingOrder(freshHighScore, agedLowScore)).toBeLessThan(
      0,
    );

    const agedNoDeadline = key({ attempts: 10, score: 9 });
    const freshEdf = key({ slackMinutes: 50 });
    expect(compareSchedulingOrder(freshEdf, agedNoDeadline)).toBeLessThan(0);
  });

  it("index is the final deterministic tiebreak", () => {
    const a = key({ index: 1 });
    const b = key({ index: 2 });
    expect(compareSchedulingOrder(a, b)).toBeLessThan(0);
    expect(compareSchedulingOrder(b, a)).toBeGreaterThan(0);
    expect(compareSchedulingOrder(a, key({ index: 1 }))).toBe(0);
  });
});
