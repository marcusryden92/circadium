import { validatePlanner } from "@/utils/calendar-generation/helpers/CalendarValidator/validatePlanners";
import { Planner } from "@/types/prisma";

function basePlanner(overrides: Partial<Planner>): Planner {
  return {
    id: "p1",
    title: "Test item",
    parentId: null,
    plannerType: "task",
    duration: 30,
    deadline: null,
    starts: null,
    sortOrder: 0,
    priority: 4,
    isReady: true,
    isTriaged: true,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    splitting: null,
    completedSegments: null,
    recurrence: null,
    recurrenceExceptions: null,
    completedStartTime: null,
    completedEndTime: null,
    locationId: null,
    useParentLocation: true,
    categoryId: null,
    linkedItemId: null,
    notes: null,
    color: null,
    userId: "u1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Planner;
}

describe("validatePlanner zero duration", () => {
  // A goal retyped to task keeps duration 0; a hard error here blanks the
  // whole calendar (the generator returns empty events on any validation
  // failure). It must be a warning — the scheduler skips the item with a
  // loud INVALID_TASK failure instead.
  it("treats a zero-duration task as a warning, not an error", () => {
    const result = validatePlanner(basePlanner({ duration: 0 }));
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("no duration"))).toBe(true);
  });

  it("treats a zero-duration plan as a warning, not an error", () => {
    const result = validatePlanner(
      basePlanner({
        plannerType: "plan",
        duration: 0,
        starts: new Date().toISOString(),
      }),
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a positive-duration task with no warnings about duration", () => {
    const result = validatePlanner(basePlanner({ duration: 45 }));
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes("no duration"))).toBe(false);
  });

  it("leaves goal duration rules unchanged (zero is fine)", () => {
    const result = validatePlanner(
      basePlanner({ plannerType: "goal", duration: 0 }),
    );
    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
