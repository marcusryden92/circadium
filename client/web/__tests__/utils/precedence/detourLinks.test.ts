import type { Planner, PlannerDependency, Queue } from "@/types/prisma";
import {
  canLinkAsDetour,
  wouldCreateDetourCycle,
  isValidDetourTarget,
} from "@/utils/precedence/detourLinks";
import { prunePlannerDetours } from "@/utils/precedence/prunePrecedenceInputs";
import { getScheduledLeafSequence } from "@/utils/goalPageHandlers";

const TS = "2026-07-01T00:00:00.000Z";

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

describe("getScheduledLeafSequence", () => {
  it("splices a linked target's leaves at the placeholder position", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("a", { parentId: "host", sortOrder: 1024 }),
      makePlanner("ph", { parentId: "host", sortOrder: 2048, linkedItemId: "t" }),
      makePlanner("b", { parentId: "host", sortOrder: 3072 }),
      makePlanner("t", { plannerType: "goal" }),
      makePlanner("t1", { parentId: "t", sortOrder: 1024 }),
      makePlanner("t2", { parentId: "t", sortOrder: 2048 }),
    ];
    expect(getScheduledLeafSequence(planner, "host").map((p) => p.id)).toEqual([
      "a",
      "t1",
      "t2",
      "b",
    ]);
    // The placeholder itself is never emitted.
    expect(getScheduledLeafSequence(planner, "host").map((p) => p.id)).not.toContain(
      "ph",
    );
  });

  it("cycle-guards a detour that links back to an ancestor host", () => {
    const planner = [
      makePlanner("h", { plannerType: "goal" }),
      makePlanner("hp", { parentId: "h", sortOrder: 1024, linkedItemId: "g" }),
      makePlanner("g", { plannerType: "goal" }),
      makePlanner("gp", { parentId: "g", sortOrder: 1024, linkedItemId: "h" }),
    ];
    // No infinite loop; the revisit is skipped defensively.
    expect(() => getScheduledLeafSequence(planner, "h")).not.toThrow();
  });

  it("treats a dangling link (missing target) as a no-op", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("a", { parentId: "host", sortOrder: 1024 }),
      makePlanner("ph", { parentId: "host", sortOrder: 2048, linkedItemId: "gone" }),
    ];
    expect(getScheduledLeafSequence(planner, "host").map((p) => p.id)).toEqual([
      "a",
    ]);
  });

  it("skips the splice for an unready or completed target (transparent link)", () => {
    const build = (targetOverrides: Partial<Planner>) => [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("a", { parentId: "host", sortOrder: 1024 }),
      makePlanner("ph", { parentId: "host", sortOrder: 2048, linkedItemId: "t" }),
      makePlanner("b", { parentId: "host", sortOrder: 3072 }),
      makePlanner("t", { plannerType: "goal", ...targetOverrides }),
      makePlanner("t1", { parentId: "t", sortOrder: 1024 }),
    ];
    expect(
      getScheduledLeafSequence(build({ isReady: false }), "host").map((p) => p.id),
    ).toEqual(["a", "b"]);
    expect(
      getScheduledLeafSequence(
        build({
          completedStartTime: "2026-06-01T10:00:00.000Z",
          completedEndTime: "2026-06-01T11:00:00.000Z",
        }),
        "host",
      ).map((p) => p.id),
    ).toEqual(["a", "b"]);
  });

  it("emits a placeholder's own children after the splice", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("a", { parentId: "host", sortOrder: 1024 }),
      makePlanner("ph", { parentId: "host", sortOrder: 2048, linkedItemId: "t" }),
      makePlanner("ph-child", { parentId: "ph", sortOrder: 1024 }),
      makePlanner("b", { parentId: "host", sortOrder: 3072 }),
      makePlanner("t", { plannerType: "goal" }),
      makePlanner("t1", { parentId: "t", sortOrder: 1024 }),
    ];
    expect(getScheduledLeafSequence(planner, "host").map((p) => p.id)).toEqual([
      "a",
      "t1",
      "ph-child",
      "b",
    ]);
  });

  it("a task entry stands for its own block; children are not its bottom layer", () => {
    const planner = [
      makePlanner("root-task"),
      makePlanner("c1", { parentId: "root-task", sortOrder: 1024 }),
      makePlanner("c2", { parentId: "root-task", sortOrder: 2048 }),
    ];
    expect(
      getScheduledLeafSequence(planner, "root-task").map((p) => p.id),
    ).toEqual(["root-task"]);
  });

  it("a task target splices as its own block", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("ph", { parentId: "host", sortOrder: 1024, linkedItemId: "t" }),
      makePlanner("t"),
      makePlanner("t-child", { parentId: "t", sortOrder: 1024 }),
    ];
    expect(getScheduledLeafSequence(planner, "host").map((p) => p.id)).toEqual([
      "t",
    ]);
  });
});

describe("canLinkAsDetour", () => {
  const base = () => [
    makePlanner("host", { plannerType: "goal" }),
    makePlanner("ph", { parentId: "host", sortOrder: 1024 }),
    makePlanner("target", { plannerType: "goal" }),
  ];

  it("accepts a valid triaged root target", () => {
    expect(canLinkAsDetour(base(), "ph", "target").ok).toBe(true);
  });

  it("rejects linking a subtask to its own root (self)", () => {
    expect(canLinkAsDetour(base(), "ph", "host")).toEqual({
      ok: false,
      reason: "self",
    });
  });

  it("rejects a non-root or untriaged target", () => {
    const planner = [
      ...base(),
      makePlanner("nested", { parentId: "target", sortOrder: 1024 }),
    ];
    expect(canLinkAsDetour(planner, "ph", "nested").reason).toBe(
      "invalid-target",
    );
  });

  it("rejects a link that would close a detour cycle", () => {
    // target already splices host (target's placeholder -> host).
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("ph", { parentId: "host", sortOrder: 1024 }),
      makePlanner("target", { plannerType: "goal" }),
      makePlanner("tp", { parentId: "target", sortOrder: 1024, linkedItemId: "host" }),
    ];
    expect(wouldCreateDetourCycle(planner, "ph", "target")).toBe(true);
    expect(canLinkAsDetour(planner, "ph", "target").reason).toBe("cycle");
  });

  it("rejects a link when a dependency connects host and target, in either direction", () => {
    // The splice makes host and target mutually ordered; any dependency path
    // between them deadlocks at runtime.
    expect(
      canLinkAsDetour(base(), "ph", "target", [], [
        makeDependency("target", "host"),
      ]).reason,
    ).toBe("cycle");
    expect(
      canLinkAsDetour(base(), "ph", "target", [], [
        makeDependency("host", "target"),
      ]).reason,
    ).toBe("cycle");
  });

  it("rejects a link when host and target share a queue", () => {
    expect(
      canLinkAsDetour(base(), "ph", "target", [makeQueue("pipe", ["host", "target"])], [])
        .reason,
    ).toBe("cycle");
  });

  it("rejects a link connected through a transitive dependency path", () => {
    const planner = [...base(), makePlanner("mid")];
    expect(
      canLinkAsDetour(planner, "ph", "target", [], [
        makeDependency("target", "mid"),
        makeDependency("mid", "host"),
      ]).reason,
    ).toBe("cycle");
  });

  it("accepts a link when dependencies exist but never connect the pair", () => {
    const planner = [...base(), makePlanner("elsewhere"), makePlanner("other")];
    expect(
      canLinkAsDetour(planner, "ph", "target", [], [
        makeDependency("elsewhere", "other"),
      ]).ok,
    ).toBe(true);
  });

  it("isValidDetourTarget gates on root + triaged + non-plan", () => {
    expect(isValidDetourTarget(makePlanner("x", { plannerType: "goal" }))).toBe(
      true,
    );
    expect(isValidDetourTarget(makePlanner("x", { plannerType: "plan" }))).toBe(
      false,
    );
    expect(
      isValidDetourTarget(makePlanner("x", { parentId: "y" })),
    ).toBe(false);
    expect(isValidDetourTarget(makePlanner("x", { isTriaged: false }))).toBe(
      false,
    );
  });
});

describe("prunePlannerDetours", () => {
  it("clears a link whose target no longer resolves to a valid root", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("ph", { parentId: "host", sortOrder: 1024, linkedItemId: "gone" }),
    ];
    const pruned = prunePlannerDetours(planner);
    expect(pruned.find((p) => p.id === "ph")!.linkedItemId).toBeNull();
  });

  it("clears a link whose target was nested (no longer a root)", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("ph", { parentId: "host", sortOrder: 1024, linkedItemId: "t" }),
      makePlanner("t", { parentId: "other" }),
      makePlanner("other", { plannerType: "goal" }),
    ];
    const pruned = prunePlannerDetours(planner);
    expect(pruned.find((p) => p.id === "ph")!.linkedItemId).toBeNull();
  });

  it("is identity-preserving when every link is valid", () => {
    const planner = [
      makePlanner("host", { plannerType: "goal" }),
      makePlanner("ph", { parentId: "host", sortOrder: 1024, linkedItemId: "t" }),
      makePlanner("t", { plannerType: "goal" }),
    ];
    expect(prunePlannerDetours(planner)).toBe(planner);
  });
});
