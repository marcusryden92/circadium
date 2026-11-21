import {
  countWindowChanges,
  diffDraftWindows,
  groupWindowsByCategory,
} from "@/utils/draft/diffDraftWindows";
import type {
  DraftCategoryRecord,
  DraftTimeWindow,
  DraftWindowsState,
} from "@/utils/draft/draftWindows";

function window(overrides: Partial<DraftTimeWindow> = {}): DraftTimeWindow {
  return {
    id: "win-1",
    categoryId: "category-work",
    day: 1,
    startTime: "09:00",
    endTime: "17:00",
    ...overrides,
  };
}

function record(
  overrides: Partial<DraftCategoryRecord> = {},
): DraftCategoryRecord {
  return {
    id: "category-work",
    name: "Work",
    color: null,
    parentId: null,
    locationId: null,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    ...overrides,
  };
}

const CANONICAL: DraftWindowsState = {
  windows: [window(), window({ id: "win-2", day: 2 })],
  categories: [
    record(),
    record({ id: "category-gym", name: "Gym", useTimeWindows: false }),
  ],
};

describe("diffDraftWindows", () => {
  it("assigns statuses and changedFields to windows and categories", () => {
    const working: DraftWindowsState = {
      windows: [
        window({ endTime: "16:00" }),
        window({ id: "win-3", day: 4, categoryId: "category-gym" }),
      ],
      categories: [
        record({ isStrict: true }),
        record({ id: "category-gym", name: "Fitness", useTimeWindows: true }),
      ],
    };
    const diffed = diffDraftWindows(working, CANONICAL);

    expect(diffed.windows.map((w) => [w.id, w.status])).toEqual([
      ["win-1", "modified"],
      ["win-3", "added"],
      ["win-2", "deleted"],
    ]);
    expect(diffed.windows[0].changedFields).toEqual(["endTime"]);
    const work = diffed.categories.find((c) => c.id === "category-work");
    expect(work?.status).toBe("modified");
    expect(work?.changedFields).toEqual(["isStrict"]);
    const gym = diffed.categories.find((c) => c.id === "category-gym");
    expect(gym?.status).toBe("modified");
    expect(gym?.changedFields).toEqual(["name", "useTimeWindows"]);
    expect(countWindowChanges(diffed)).toBe(5);
  });

  it("marks created and deleted categories", () => {
    const working: DraftWindowsState = {
      windows: CANONICAL.windows,
      categories: [
        record(),
        record({ id: "draft-study", name: "Study", useTimeWindows: false }),
      ],
    };
    const diffed = diffDraftWindows(working, CANONICAL);
    expect(
      diffed.categories.map((c) => [c.id, c.status]),
    ).toEqual([
      ["category-work", "unchanged"],
      ["draft-study", "added"],
      ["category-gym", "deleted"],
    ]);
    expect(countWindowChanges(diffed)).toBe(2);
  });

  it("counts zero for identical states", () => {
    const diffed = diffDraftWindows(CANONICAL, CANONICAL);
    expect(countWindowChanges(diffed)).toBe(0);
  });
});

describe("groupWindowsByCategory", () => {
  it("groups in diffed-category order, sorts rows Monday-first, and omits untouched empty groups", () => {
    const working: DraftWindowsState = {
      windows: [
        window({ id: "win-sun", day: 0, startTime: "10:00" }),
        window({ id: "win-mon-late", day: 1, startTime: "12:00" }),
        window(),
      ],
      categories: CANONICAL.categories,
    };
    const diffed = diffDraftWindows(working, {
      windows: working.windows,
      categories: CANONICAL.categories,
    });
    const groups = groupWindowsByCategory(diffed);

    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe("category-work");
    expect(groups[0].rows.map((w) => w.id)).toEqual([
      "win-1",
      "win-mon-late",
      "win-sun",
    ]);
  });

  it("keeps windowless categories visible when their record changed", () => {
    const working: DraftWindowsState = {
      windows: [],
      categories: [
        record(),
        record({ id: "category-gym", name: "Gym", useTimeWindows: true }),
        record({ id: "draft-study", name: "Study", useTimeWindows: false }),
      ],
    };
    const diffed = diffDraftWindows(working, {
      windows: [],
      categories: CANONICAL.categories,
    });
    const groups = groupWindowsByCategory(diffed);
    expect(groups.map((g) => g.category.id)).toEqual([
      "category-gym",
      "draft-study",
    ]);
  });

  it("shows a deleted category with its deleted windows", () => {
    const working: DraftWindowsState = {
      windows: [window()],
      categories: [record()],
    };
    const diffed = diffDraftWindows(working, {
      windows: [
        window(),
        window({ id: "win-gym", categoryId: "category-gym", day: 3 }),
      ],
      categories: CANONICAL.categories,
    });
    const groups = groupWindowsByCategory(diffed);
    const gym = groups.find((g) => g.category.id === "category-gym");
    expect(gym?.category.status).toBe("deleted");
    expect(gym?.rows.map((w) => [w.id, w.status])).toEqual([
      ["win-gym", "deleted"],
    ]);
  });
});
