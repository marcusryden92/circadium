import { assignDraftIds } from "@/utils/draft/assignDraftIds";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";

function node(overrides: Partial<DraftNode> & { title: string }): DraftNode {
  return {
    id: "",
    plannerType: "task",
    duration: 30,
    deadline: null,
    priority: 0,
    isReady: null,
    categoryId: null,
    children: [],
    ...overrides,
  };
}

describe("assignDraftIds", () => {
  it("stamps every id-less node deep and reports new roots", () => {
    const goals = [
      node({
        title: "New draft goal",
        plannerType: "goal",
        children: [
          node({ title: "step 1" }),
          node({
            title: "phase",
            plannerType: "goal",
            children: [node({ title: "step 2" })],
          }),
        ],
      }),
    ];

    const { goals: stamped, newRoots } = assignDraftIds(goals);

    const root = stamped[0];
    const ids = [
      root.id,
      root.children[0].id,
      root.children[1].id,
      root.children[1].children[0].id,
    ];
    for (const id of ids) expect(id).not.toBe("");
    expect(new Set(ids).size).toBe(ids.length);
    expect(newRoots).toEqual([{ id: root.id, title: "New draft goal" }]);
  });

  it("preserves existing ids and only reports id-less roots as new", () => {
    const goals = [
      node({
        id: "existing-goal",
        title: "Retained goal",
        plannerType: "goal",
        children: [node({ id: "existing-child", title: "kept" }), node({ title: "added" })],
      }),
      node({ title: "Brand new", plannerType: "goal" }),
    ];

    const { goals: stamped, newRoots } = assignDraftIds(goals);

    expect(stamped[0].id).toBe("existing-goal");
    expect(stamped[0].children[0].id).toBe("existing-child");
    expect(stamped[0].children[1].id).not.toBe("");
    expect(newRoots).toHaveLength(1);
    expect(newRoots[0].title).toBe("Brand new");
    expect(newRoots[0].id).toBe(stamped[1].id);
  });

  it("does not mutate the input trees", () => {
    const goals = [node({ title: "untouched", children: [node({ title: "leaf" })] })];
    assignDraftIds(goals);
    expect(goals[0].id).toBe("");
    expect(goals[0].children[0].id).toBe("");
  });
});
