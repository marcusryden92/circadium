import type { Planner, PlannerDependency } from "@/types/prisma";
import {
  wouldCreateCycleAddingNodeDependency,
  validateSubtreeOrder,
} from "@/utils/precedence/findCycle";
import { describeCycle } from "@/utils/precedence/describeCycle";

// Node-level dependencies: cross-goal subtask edges join the legality graph
// at leaf granularity, with each goal's internal step order as edges. The
// canonical hazard: edges "B4 after A5" + "A8 after B7" are individually
// legal with internal orders A5<A8 and B4<B7, but dragging A8 above A5
// closes A8 -> A5 -> B4 -> B7 -> A8.

const TS = "2026-07-01T00:00:00.000Z";

function row(overrides: Partial<Planner> & { id: string }): Planner {
  return {
    title: overrides.id,
    parentId: null,
    plannerType: "goal",
    isReady: true,
    isTriaged: true,
    duration: 30,
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
    priority: 4,
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

function dependency(
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

function twoGoals(): Planner[] {
  return [
    row({ id: "A" }),
    row({ id: "a5", parentId: "A", sortOrder: 1024 }),
    row({ id: "a8", parentId: "A", sortOrder: 2048 }),
    row({ id: "B" }),
    row({ id: "b4", parentId: "B", sortOrder: 1024 }),
    row({ id: "b7", parentId: "B", sortOrder: 2048 }),
  ];
}

describe("wouldCreateCycleAddingNodeDependency", () => {
  it("hard-refuses same-structural-root pairs, including root to own subtask", () => {
    const planner = twoGoals();
    expect(
      wouldCreateCycleAddingNodeDependency(planner, [], [], "a5", "a8"),
    ).toBe("same-root");
    expect(
      wouldCreateCycleAddingNodeDependency(planner, [], [], "A", "a8"),
    ).toBe("same-root");
    expect(
      wouldCreateCycleAddingNodeDependency(planner, [], [], "a5", "A"),
    ).toBe("same-root");
  });

  it("allows a legal cross-goal subtask edge", () => {
    expect(
      wouldCreateCycleAddingNodeDependency(twoGoals(), [], [], "a5", "b4"),
    ).toBeNull();
  });

  it("refuses an edge that closes a loop through a goal's internal order", () => {
    const planner = twoGoals();
    const existing = [dependency("a5", "b4")];
    // b4 -> b7 via B's step order, so b7 -> a5 closes b7 -> a5 -> b4 -> b7.
    const cycle = wouldCreateCycleAddingNodeDependency(
      planner,
      [],
      existing,
      "b7",
      "a5",
    );
    expect(cycle).not.toBeNull();
    expect(cycle).not.toBe("same-root");
  });

  it("allows the second edge of the canonical legal pair", () => {
    const planner = twoGoals();
    const existing = [dependency("a5", "b4")];
    // A5 < A8 and B4 < B7: "A8 after B7" is legal alongside "B4 after A5".
    expect(
      wouldCreateCycleAddingNodeDependency(planner, [], existing, "b7", "a8"),
    ).toBeNull();
  });

  it("catches a loop through a root-level edge and an internal chain", () => {
    const planner = twoGoals();
    const existing = [dependency("A", "b4")];
    // b7 must come after b4 (B's order), which comes after all of A —
    // so making A wait for b7 loops.
    expect(
      wouldCreateCycleAddingNodeDependency(planner, [], existing, "b7", "A"),
    ).not.toBeNull();
  });
});

describe("validateSubtreeOrder", () => {
  const edges = [dependency("a5", "b4"), dependency("b7", "a8")];

  it("accepts the authored order", () => {
    expect(validateSubtreeOrder(twoGoals(), [], edges, "A")).toBeNull();
  });

  it("refuses a reorder that closes a loop through two goals' step orders", () => {
    const proposed = twoGoals().map((p) =>
      p.id === "a8" ? { ...p, sortOrder: 512 } : p,
    );
    const cycle = validateSubtreeOrder(proposed, [], edges, "A");
    expect(cycle).not.toBeNull();
  });

  it("skips entirely when the touched subtree carries no node-edge endpoint", () => {
    const planner = [
      ...twoGoals(),
      row({ id: "C" }),
      row({ id: "c1", parentId: "C", sortOrder: 1024 }),
      row({ id: "c2", parentId: "C", sortOrder: 2048 }),
    ];
    const proposed = planner.map((p) =>
      p.id === "c2" ? { ...p, sortOrder: 512 } : p,
    );
    expect(validateSubtreeOrder(proposed, [], edges, "C")).toBeNull();
  });
});

describe("describeCycle with internal hops", () => {
  it("names the goal whose step order the path threads through", () => {
    const planner = twoGoals();
    const existing = [dependency("a5", "b4")];
    const cycle = wouldCreateCycleAddingNodeDependency(
      planner,
      [],
      existing,
      "b7",
      "a5",
    );
    expect(cycle).not.toBe("same-root");
    expect(cycle).not.toBeNull();
    const text = describeCycle(
      cycle as Exclude<typeof cycle, "same-root" | null>,
      planner,
      [],
    );
    expect(text).toContain("b7");
    expect(text).toContain("step order");
  });
});
