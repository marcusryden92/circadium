import {
  sortByPriorityAndConstraints,
  computeUrgencyScores,
} from "@/utils/calendar-generation/helpers/PrioritySorter";
import { buildPlannerConstraintsMap } from "@/utils/calendar-generation/helpers/CalendarGenerator/buildPlannerConstraintsMap";
import { buildCategoryEligibilityMap } from "@/utils/calendar-generation/helpers/CalendarGenerator/buildCategoryEligibilityMap";
import { serializeAllowedTimes } from "@/utils/allowedTimes";
import type { Category, CategoryTimeWindow, Planner } from "@/types/prisma";

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

function makeWindow(
  overrides: Partial<CategoryTimeWindow> & {
    id: string;
    day: number;
    categoryId: string;
  },
): CategoryTimeWindow {
  return {
    startTime: "09:00",
    endTime: "17:00",
    recurrenceExceptions: null,
    userId: "u",
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
    userId: "u",
    createdAt: ts,
    updatedAt: ts,
    timeSlots: [],
    ...overrides,
  };
}

function sortIds(planners: Planner[], categories: Category[] = []): string[] {
  const scores = computeUrgencyScores(planners, planners, FAKE_TODAY);
  return sortByPriorityAndConstraints(
    planners,
    planners,
    scores,
    undefined,
    FAKE_TODAY,
    buildPlannerConstraintsMap(planners),
    categories,
    buildCategoryEligibilityMap(categories),
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

describe("scarcity ordering within the constrained tier", () => {
  const scarceCategory = makeCategory({
    id: "cat-scarce",
    timeSlots: [
      makeWindow({
        id: "w-scarce",
        day: 2,
        categoryId: "cat-scarce",
        startTime: "18:00",
        endTime: "22:00",
      }),
    ],
  });
  const plentyCategory = makeCategory({
    id: "cat-plenty",
    timeSlots: ([1, 2, 3, 4, 5] as const).map((day) =>
      makeWindow({
        id: `w-plenty-${day}`,
        day,
        categoryId: "cat-plenty",
      }),
    ),
  });

  it("four window-hours a week places before forty despite a lower score", () => {
    const scarce = makePlanner("scarce", {
      categoryId: "cat-scarce",
      priority: 1,
    });
    const plenty = makePlanner("plenty", {
      categoryId: "cat-plenty",
      priority: 7,
    });

    expect(sortIds([plenty, scarce], [scarceCategory, plentyCategory])).toEqual(
      ["scarce", "plenty"],
    );
  });

  it("a tight allowed-times pattern outranks a plentiful category", () => {
    const tightPattern = makePlanner("tight-pattern", {
      priority: 1,
      allowedTimes: serializeAllowedTimes({
        days: [2],
        ranges: [{ startTime: "18:00", endTime: "20:00" }],
      }),
    });
    const plenty = makePlanner("plenty", {
      categoryId: "cat-plenty",
      priority: 7,
    });

    expect(
      sortIds([plenty, tightPattern], [scarceCategory, plentyCategory]),
    ).toEqual(["tight-pattern", "plenty"]);
  });

  it("the eligible set sums windows across the upward cascade", () => {
    const parent = makeCategory({
      id: "cat-parent",
      timeSlots: ([1, 3] as const).map((day) =>
        makeWindow({
          id: `w-parent-${day}`,
          day,
          categoryId: "cat-parent",
          startTime: "09:00",
          endTime: "12:00",
        }),
      ),
    });
    const child = makeCategory({
      id: "cat-child",
      parentId: "cat-parent",
      timeSlots: [
        makeWindow({
          id: "w-child",
          day: 2,
          categoryId: "cat-child",
          startTime: "18:00",
          endTime: "20:00",
        }),
      ],
    });

    // Child cascades into the parent: 2h own + 6h inherited = 8h weekly,
    // more than the 4h scarce category — so the scarce task goes first.
    const cascading = makePlanner("cascading", {
      categoryId: "cat-child",
      priority: 7,
    });
    const scarce = makePlanner("scarce", {
      categoryId: "cat-scarce",
      priority: 7,
    });

    expect(
      sortIds([cascading, scarce], [scarceCategory, parent, child]),
    ).toEqual(["scarce", "cascading"]);
  });
});
