import {
  sortByPriorityAndConstraints,
  computeUrgencyScores,
} from "@/utils/calendar-generation/helpers/PrioritySorter";
import { buildPlannerConstraintsMap } from "@/utils/calendar-generation/helpers/CalendarGenerator/buildPlannerConstraintsMap";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import type { Planner } from "@/types/prisma";

// The constrained tier exists because constrained items compete for strictly
// scarcer slots. An allowed-times restriction (e.g. Tuesday 18:00-20:00) is
// at least as constraining as category membership, so it must qualify for the
// tier too — not just a non-null resolved category.

const FAKE_TODAY = new Date("2026-01-05T08:00:00");

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
    userId: "u",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function sortIds(planners: Planner[]): string[] {
  const scores = computeUrgencyScores(planners, planners, FAKE_TODAY);
  return sortByPriorityAndConstraints(
    planners,
    planners,
    scores,
    undefined,
    FAKE_TODAY,
    buildPlannerConstraintsMap(planners),
  ).map((p) => p.id);
}

describe("constrained tier membership", () => {
  it("an allowed-times-restricted task joins the constrained tier", () => {
    const windowed = makePlanner("windowed", {
      priority: 1,
      allowedTimes: serializeAllowedTimes({
        days: [2],
        ranges: [{ startTime: "18:00", endTime: "20:00" }],
      }),
    });
    const free = makePlanner("free", { priority: 7 });

    expect(sortIds([free, windowed])).toEqual(["windowed", "free"]);
  });

  it("an inherited allowed-times chain constrains the whole subtree", () => {
    const rootTask = makePlanner("root-task", {
      allowedTimes: serializeAllowedTimes({ days: [2, 4], ranges: null }),
    });
    const childTask = makePlanner("child-task", {
      parentId: "root-task",
      priority: 1,
    });
    const free = makePlanner("free", { priority: 7 });

    const ids = sortIds([free, childTask, rootTask]);
    expect(ids.indexOf("child-task")).toBeLessThan(ids.indexOf("free"));
  });

  it("category-constrained and allowed-times items share one tier", () => {
    const categorized = makePlanner("categorized", {
      categoryId: "cat-1",
      priority: 7,
    });
    const windowed = makePlanner("windowed", {
      priority: 1,
      allowedTimes: serializeAllowedTimes({
        days: [2],
        ranges: [{ startTime: "18:00", endTime: "20:00" }],
      }),
    });
    const free = makePlanner("free", { priority: 7 });

    const ids = sortIds([free, windowed, categorized]);
    expect(ids.indexOf("categorized")).toBeLessThan(ids.indexOf("free"));
    expect(ids.indexOf("windowed")).toBeLessThan(ids.indexOf("free"));
  });
});
