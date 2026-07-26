import { plannerForestToJson } from "@/utils/draft/plannerForestToJson";
import { applyDraftForestToPlanner } from "@/utils/draft/applyDraftForestToPlanner";
import type { Planner } from "@/types/prisma";

// Regression #3: the AI assistant can't author habits (the draft contract has
// no cadence/window fields). A triaged habit must never be sent to the model
// (it would render as a goal and silently retype to a task on save,
// orphaning its completion log), and the apply path must never treat an
// untouched habit as a deleted root.

const USER_ID = "test-user";

function makePlanner(id: string, overrides: Partial<Planner>): Planner {
  const ts = "2026-01-05T08:00:00.000Z";
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

describe("AI draft forest excludes habits", () => {
  const habit = makePlanner("hb", {
    plannerType: "habit",
    title: "Meditate",
    recurrence: JSON.stringify({ freq: "daily", interval: 1 }),
  });
  const task = makePlanner("t1", { title: "Write report" });

  it("never sends a habit to the assistant", () => {
    const forest = plannerForestToJson([habit, task]);
    expect(forest.goals.some((g) => g.id === "hb")).toBe(false);
    expect(forest.goals.some((g) => g.id === "t1")).toBe(true);
  });

  it("leaves an untouched habit intact on save (not deleted, not retyped)", () => {
    const planner = [habit, task];
    const workingForest = plannerForestToJson(planner); // only t1 is in scope

    const next = applyDraftForestToPlanner({
      planner,
      workingForest,
      userId: USER_ID,
      validCategoryIds: new Set<string>(),
    });

    const row = next.find((p) => p.id === "hb");
    expect(row).toBeDefined();
    expect(row!.plannerType).toBe("habit");
    expect(row!.recurrence).toBe(habit.recurrence);
  });
});
