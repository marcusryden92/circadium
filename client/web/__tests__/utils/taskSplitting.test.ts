import {
  addIntervalMinutesByDay,
  chunkEventId,
  completedMinutesByDay,
  completedSegmentEventId,
  grantChunkMinutes,
  isChunkEventId,
  isCompletedSegmentEventId,
  minChunkRequired,
  parseCompletedSegments,
  parseTaskSplitting,
  segmentStartFromEventId,
  serializeTaskSplitting,
  setSplitCompletedMinutes,
  splitRemainingMinutes,
  taskIsSplittable,
  type TaskSplittingSettings,
} from "@/utils/taskSplitting";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import type { Planner } from "@/types/prisma";

const SETTINGS: TaskSplittingSettings = {
  minMinutes: 30,
  maxMinutes: 120,
  maxMinutesPerDay: null,
};

function makePlanner(overrides: Partial<Planner>): Planner {
  return {
    id: "p1",
    title: "p1",
    parentId: null,
    plannerType: "task",
    isReady: null,
    isTriaged: true,
    duration: 300,
    deadline: null,
    starts: null,
    recurrence: null,
    recurrenceExceptions: null,
    splitting: serializeTaskSplitting(SETTINGS),
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
    userId: "u1",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseTaskSplitting", () => {
  it("accepts valid settings and normalizes the day cap up to min", () => {
    const parsed = parseTaskSplitting(
      JSON.stringify({ minMinutes: 30, maxMinutes: 120, maxMinutesPerDay: 10 }),
    );
    expect(parsed).toEqual({
      minMinutes: 30,
      maxMinutes: 120,
      maxMinutesPerDay: 30,
      minSpacingMinutes: null,
    });
  });

  it("keeps a positive minimum spacing and drops non-positive to null", () => {
    expect(
      parseTaskSplitting(
        JSON.stringify({
          minMinutes: 30,
          maxMinutes: 120,
          minSpacingMinutes: 45.7,
        }),
      ),
    ).toEqual({
      minMinutes: 30,
      maxMinutes: 120,
      maxMinutesPerDay: null,
      minSpacingMinutes: 45,
    });
    expect(
      parseTaskSplitting(
        JSON.stringify({
          minMinutes: 30,
          maxMinutes: 120,
          minSpacingMinutes: 0,
        }),
      ),
    ).toEqual({
      minMinutes: 30,
      maxMinutes: 120,
      maxMinutesPerDay: null,
      minSpacingMinutes: null,
    });
  });

  it("rejects min below the floor, max below min, and malformed JSON", () => {
    expect(
      parseTaskSplitting(JSON.stringify({ minMinutes: 2, maxMinutes: 60 })),
    ).toBeNull();
    expect(
      parseTaskSplitting(JSON.stringify({ minMinutes: 60, maxMinutes: 30 })),
    ).toBeNull();
    expect(parseTaskSplitting("not json")).toBeNull();
    expect(parseTaskSplitting(null)).toBeNull();
  });

  it("accepts max 0 as the no-upper-bound sentinel but rejects negatives", () => {
    expect(
      parseTaskSplitting(JSON.stringify({ minMinutes: 30, maxMinutes: 0 })),
    ).toEqual({
      minMinutes: 30,
      maxMinutes: 0,
      maxMinutesPerDay: null,
      minSpacingMinutes: null,
    });
    expect(
      parseTaskSplitting(JSON.stringify({ minMinutes: 30, maxMinutes: -10 })),
    ).toBeNull();
  });
});

describe("minChunkRequired (remainder invariant)", () => {
  it("is min when the remainder can still be split", () => {
    expect(minChunkRequired(300, SETTINGS)).toBe(30);
    expect(minChunkRequired(60, SETTINGS)).toBe(30);
  });

  it("is the whole remainder when it cannot be split (below 2*min)", () => {
    expect(minChunkRequired(59, SETTINGS)).toBe(59);
    expect(minChunkRequired(45, SETTINGS)).toBe(45);
    expect(minChunkRequired(10, SETTINGS)).toBe(10);
  });

  it("is zero for a spent remainder", () => {
    expect(minChunkRequired(0, SETTINGS)).toBe(0);
  });
});

describe("grantChunkMinutes", () => {
  it("fills to max when the slot allows", () => {
    expect(
      grantChunkMinutes({ remaining: 300, headroom: 900, settings: SETTINGS }),
    ).toBe(120);
  });

  it("takes the whole remainder when it fits under max", () => {
    expect(
      grantChunkMinutes({ remaining: 100, headroom: 900, settings: SETTINGS }),
    ).toBe(100);
  });

  it("shrinks the chunk so the leftover never drops below min", () => {
    // 130 remaining, headroom 120: naive grant of 120 leaves 10 < 30.
    expect(
      grantChunkMinutes({ remaining: 130, headroom: 120, settings: SETTINGS }),
    ).toBe(100);
  });

  it("rejects a slot that cannot host a valid chunk", () => {
    // 50 remaining is unsplittable (< 2*min) — only 50 whole works, headroom 40.
    expect(
      grantChunkMinutes({ remaining: 50, headroom: 40, settings: SETTINGS }),
    ).toBe(0);
    // Headroom below min entirely.
    expect(
      grantChunkMinutes({ remaining: 300, headroom: 20, settings: SETTINGS }),
    ).toBe(0);
  });

  it("caps by the day budget", () => {
    expect(
      grantChunkMinutes({
        remaining: 300,
        headroom: 900,
        settings: SETTINGS,
        dayBudget: 45,
      }),
    ).toBe(45);
    expect(
      grantChunkMinutes({
        remaining: 300,
        headroom: 900,
        settings: SETTINGS,
        dayBudget: 10,
      }),
    ).toBe(0);
  });

  it("fills the slot's headroom when max is the unlimited sentinel", () => {
    const unlimited = { ...SETTINGS, maxMinutes: 0 };
    expect(
      grantChunkMinutes({ remaining: 300, headroom: 900, settings: unlimited }),
    ).toBe(300);
    // Bounded by headroom, leftover kept >= min by the carving rule.
    expect(
      grantChunkMinutes({ remaining: 300, headroom: 280, settings: unlimited }),
    ).toBe(270);
    // The day budget still caps an unlimited chunk.
    expect(
      grantChunkMinutes({
        remaining: 300,
        headroom: 900,
        settings: unlimited,
        dayBudget: 45,
      }),
    ).toBe(45);
  });

  it("honors maxOverride for rule-forced whole placement", () => {
    // 70 remaining with max 60: unsplittable, override lets it place whole.
    const tight = { ...SETTINGS, minMinutes: 45, maxMinutes: 60 };
    expect(
      grantChunkMinutes({ remaining: 70, headroom: 900, settings: tight }),
    ).toBe(0);
    expect(
      grantChunkMinutes({
        remaining: 70,
        headroom: 900,
        settings: tight,
        maxOverride: 70,
      }),
    ).toBe(70);
  });
});

describe("segments and completion", () => {
  const segment = {
    start: "2026-01-04T10:00:00.000Z",
    end: "2026-01-04T11:00:00.000Z",
  };

  it("derives remaining minutes from segments", () => {
    const item = makePlanner({
      completedSegments: JSON.stringify([segment]),
    });
    expect(splitRemainingMinutes(item)).toBe(240);
  });

  it("auto-completes when segments cover the duration", () => {
    const item = makePlanner({
      duration: 60,
      completedSegments: JSON.stringify([segment]),
    });
    expect(plannerIsCompleted(item)).toBe(true);
  });

  it("keeps segments inert when splitting is disabled", () => {
    const item = makePlanner({
      duration: 60,
      splitting: null,
      completedSegments: JSON.stringify([segment]),
    });
    expect(taskIsSplittable(item)).toBe(false);
    expect(plannerIsCompleted(item)).toBe(false);
  });

  it("drops malformed and inverted segments at parse", () => {
    expect(
      parseCompletedSegments(
        JSON.stringify([
          segment,
          { start: segment.end, end: segment.start },
          { start: "nonsense" },
        ]),
      ),
    ).toEqual([segment]);
  });

  it("splits day attribution at local midnight", () => {
    const map = new Map<string, number>();
    addIntervalMinutesByDay(
      map,
      new Date(2026, 0, 4, 23, 0, 0),
      new Date(2026, 0, 5, 1, 0, 0),
    );
    expect(map.get("2026-01-04")).toBe(60);
    expect(map.get("2026-01-05")).toBe(60);
  });

  it("seeds day budgets from completed segments", () => {
    const item = makePlanner({
      completedSegments: JSON.stringify([segment]),
    });
    const byDay = completedMinutesByDay(item);
    let total = 0;
    byDay.forEach((minutes) => (total += minutes));
    expect(total).toBe(60);
  });
});

describe("split event ids", () => {
  it("round-trips through plannerIdFromEventId", () => {
    const chunk = chunkEventId("planner-1", 3);
    expect(isChunkEventId(chunk)).toBe(true);
    expect(plannerIdFromEventId(chunk)).toBe("planner-1");

    const done = completedSegmentEventId("planner-1", {
      start: "2026-01-04T10:00:00.000Z",
      end: "2026-01-04T11:00:00.000Z",
    });
    expect(isCompletedSegmentEventId(done)).toBe(true);
    expect(plannerIdFromEventId(done)).toBe("planner-1");
    expect(segmentStartFromEventId(done)).toBe("2026-01-04T10:00:00.000Z");
  });

  it("does not cross-match kinds", () => {
    expect(
      isChunkEventId(completedSegmentEventId("p", { start: "a", end: "b" })),
    ).toBe(false);
    expect(isCompletedSegmentEventId(chunkEventId("p", 0))).toBe(false);
    expect(isChunkEventId("plain-planner-id")).toBe(false);
  });
});

describe("setSplitCompletedMinutes", () => {
  const NOW = new Date("2026-01-10T12:00:00.000Z");
  const seg = (start: string, end: string) => ({ start, end });

  it("appends a synthetic segment ending at now when raising the total", () => {
    const item = makePlanner({
      completedSegments: JSON.stringify([
        seg("2026-01-04T10:00:00.000Z", "2026-01-04T11:00:00.000Z"),
      ]),
    });
    const result = setSplitCompletedMinutes(item, 90, NOW);
    const segments = parseCompletedSegments(result);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toEqual(
      seg("2026-01-10T11:30:00.000Z", "2026-01-10T12:00:00.000Z"),
    );
  });

  it("trims the most recent segment backward when lowering the total", () => {
    const item = makePlanner({
      completedSegments: JSON.stringify([
        seg("2026-01-04T10:00:00.000Z", "2026-01-04T11:00:00.000Z"),
        seg("2026-01-05T10:00:00.000Z", "2026-01-05T11:00:00.000Z"),
      ]),
    });
    const result = setSplitCompletedMinutes(item, 80, NOW);
    const segments = parseCompletedSegments(result);
    expect(segments).toEqual([
      seg("2026-01-04T10:00:00.000Z", "2026-01-04T11:00:00.000Z"),
      seg("2026-01-05T10:00:00.000Z", "2026-01-05T10:20:00.000Z"),
    ]);
  });

  it("drops whole newest segments before trimming older ones", () => {
    const item = makePlanner({
      completedSegments: JSON.stringify([
        seg("2026-01-04T10:00:00.000Z", "2026-01-04T11:00:00.000Z"),
        seg("2026-01-05T10:00:00.000Z", "2026-01-05T10:30:00.000Z"),
      ]),
    });
    const result = setSplitCompletedMinutes(item, 45, NOW);
    const segments = parseCompletedSegments(result);
    expect(segments).toEqual([
      seg("2026-01-04T10:00:00.000Z", "2026-01-04T10:45:00.000Z"),
    ]);
  });

  it("returns null when the total is set to zero", () => {
    const item = makePlanner({
      completedSegments: JSON.stringify([
        seg("2026-01-04T10:00:00.000Z", "2026-01-04T11:00:00.000Z"),
      ]),
    });
    expect(setSplitCompletedMinutes(item, 0, NOW)).toBeNull();
  });

  it("clamps to the duration and auto-completes the row", () => {
    const item = makePlanner({ duration: 120 });
    const result = setSplitCompletedMinutes(item, 999, NOW);
    const next = makePlanner({ duration: 120, completedSegments: result });
    expect(splitRemainingMinutes(next)).toBe(0);
    expect(plannerIsCompleted(next)).toBe(true);
  });

  it("returns the row value untouched when the target already matches", () => {
    const stored = JSON.stringify([
      seg("2026-01-04T10:00:00.000Z", "2026-01-04T11:00:00.000Z"),
    ]);
    const item = makePlanner({ completedSegments: stored });
    expect(setSplitCompletedMinutes(item, 60, NOW)).toBe(stored);
    expect(setSplitCompletedMinutes(makePlanner({}), 0, NOW)).toBeNull();
  });
});
