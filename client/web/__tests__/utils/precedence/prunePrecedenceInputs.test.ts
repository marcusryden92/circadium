import type { Planner, Queue, PlannerDependency } from "@/types/prisma";
import {
  pruneQueueMembers,
  pruneDependencies,
} from "@/utils/precedence/prunePrecedenceInputs";

// Central pruning runs in the calendar thunk on every pass: members/edges
// whose planner was deleted, retyped to plan, nested, or untriaged drop out
// wherever the mutation originated. Completed and unready rows stay — they
// are valid transparent links / gate inputs. Identity discipline: same
// reference on no-op, or the sync layer sees phantom diffs.

const TS = "2026-07-01T00:00:00.000Z";

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
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeQueue(id: string, memberPlannerIds: string[]): Queue {
  return {
    id,
    title: id,
    sortOrder: 0,
    color: null,
    categoryId: null,
    userId: "u",
    createdAt: TS,
    updatedAt: TS,
    members: memberPlannerIds.map((plannerId, i) => ({
      id: `${id}-m${i}`,
      sortOrder: (i + 1) * 1024,
      queueId: id,
      plannerId,
      userId: "u",
      createdAt: TS,
      updatedAt: TS,
    })),
  };
}

function makeDependency(
  predecessorId: string,
  successorId: string,
): PlannerDependency {
  return {
    id: `dep-${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    userId: "u",
    createdAt: TS,
    updatedAt: TS,
  };
}

describe("pruneQueueMembers", () => {
  it("drops members whose planner is missing, nested, plan-typed, or untriaged", () => {
    const planner = [
      makePlanner("ok"),
      makePlanner("nested", { parentId: "ok" }),
      makePlanner("plan", { plannerType: "plan", starts: TS }),
      makePlanner("untriaged", { isTriaged: false }),
    ];
    const queues = [
      makeQueue("q", ["ok", "missing", "nested", "plan", "untriaged"]),
    ];
    const pruned = pruneQueueMembers(queues, planner);
    expect(pruned[0].members.map((m) => m.plannerId)).toEqual(["ok"]);
  });

  it("keeps completed and unready members", () => {
    const planner = [
      makePlanner("done", { completedStartTime: TS, completedEndTime: TS }),
      makePlanner("unready-goal", { plannerType: "goal", isReady: false }),
    ];
    const queues = [makeQueue("q", ["done", "unready-goal"])];
    expect(pruneQueueMembers(queues, planner)).toBe(queues);
  });

  it("returns the same reference on no-op", () => {
    const planner = [makePlanner("a"), makePlanner("b")];
    const queues = [makeQueue("q", ["a", "b"])];
    expect(pruneQueueMembers(queues, planner)).toBe(queues);
  });

  it("keeps untouched queue objects by identity when another queue prunes", () => {
    const planner = [makePlanner("a"), makePlanner("b")];
    const untouched = makeQueue("q1", ["a"]);
    const touched = makeQueue("q2", ["b", "gone"]);
    const pruned = pruneQueueMembers([untouched, touched], planner);
    expect(pruned[0]).toBe(untouched);
    expect(pruned[1].members.map((m) => m.plannerId)).toEqual(["b"]);
  });
});

describe("pruneDependencies", () => {
  it("keeps node-level endpoints under triaged roots, drops invalid ones", () => {
    const planner = [
      makePlanner("a"),
      makePlanner("b"),
      makePlanner("nested", { parentId: "a" }),
      makePlanner("untriaged", { isTriaged: false }),
      makePlanner("untriaged-child", { parentId: "untriaged" }),
      makePlanner("plan", { plannerType: "plan", starts: TS }),
      makePlanner("plan-child", { parentId: "plan-root" }),
      makePlanner("plan-root", { plannerType: "plan", starts: TS }),
    ];
    const dependencies = [
      makeDependency("a", "b"),
      makeDependency("a", "missing"),
      makeDependency("nested", "b"),
      makeDependency("untriaged", "b"),
      makeDependency("untriaged-child", "b"),
      makeDependency("plan", "b"),
      makeDependency("plan-child", "b"),
    ];
    const pruned = pruneDependencies(dependencies, planner);
    expect(pruned.map((d) => d.id)).toEqual(["dep-a-b", "dep-nested-b"]);
  });

  it("keeps completed and unready endpoints", () => {
    const planner = [
      makePlanner("done", { completedStartTime: TS, completedEndTime: TS }),
      makePlanner("unready-goal", { plannerType: "goal", isReady: false }),
    ];
    const dependencies = [makeDependency("done", "unready-goal")];
    expect(pruneDependencies(dependencies, planner)).toBe(dependencies);
  });

  it("returns the same reference on no-op", () => {
    const planner = [makePlanner("a"), makePlanner("b")];
    const dependencies = [makeDependency("a", "b")];
    expect(pruneDependencies(dependencies, planner)).toBe(dependencies);
  });
});
