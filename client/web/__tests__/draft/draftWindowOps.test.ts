import {
  addDraftCategories,
  addDraftTimeWindows,
  deleteDraftCategories,
  deleteDraftTimeWindows,
  updateDraftCategories,
  updateDraftTimeWindows,
} from "@/utils/draft/draftWindowOps";
import {
  draftWindowsStateEqual,
  findWindowOverlaps,
  normalizeDraftWindowsState,
  type DraftCategoryRecord,
  type DraftTimeWindow,
  type DraftWindowsState,
} from "@/utils/draft/draftWindows";

const CATEGORY_WORK = "category-work";
const CATEGORY_GYM = "category-gym";
const LOCATION_OFFICE = "location-office";
const VALID_LOCATIONS = new Set([LOCATION_OFFICE]);

function window(overrides: Partial<DraftTimeWindow> = {}): DraftTimeWindow {
  return {
    id: "win-1",
    categoryId: CATEGORY_WORK,
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
    id: CATEGORY_WORK,
    name: "Work",
    color: "#1976D2",
    parentId: null,
    locationId: null,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    ...overrides,
  };
}

function state(overrides: Partial<DraftWindowsState> = {}): DraftWindowsState {
  return {
    windows: [window()],
    categories: [
      record(),
      record({ id: CATEGORY_GYM, name: "Gym", useTimeWindows: false }),
    ],
    ...overrides,
  };
}

describe("addDraftTimeWindows", () => {
  it("mints fresh ids and discards model-supplied ones", () => {
    const result = addDraftTimeWindows(state(), [
      {
        id: "model-made-this-up",
        categoryId: CATEGORY_WORK,
        day: 2,
        startTime: "08:00",
        endTime: "12:00",
      },
    ]);
    expect(result.failures).toHaveLength(0);
    expect(result.changed).toBe(true);
    expect(result.state.windows).toHaveLength(2);
    expect(result.state.windows[1].id).not.toBe("model-made-this-up");
    expect(result.state.windows[1].id.length).toBeGreaterThan(0);
    expect(result.autoEnabledCategoryIds).toHaveLength(0);
  });

  it("auto-enables useTimeWindows on the target category and reports it", () => {
    const result = addDraftTimeWindows(state(), [
      { categoryId: CATEGORY_GYM, day: 3, startTime: "18:00", endTime: "20:00" },
    ]);
    const gym = result.state.categories.find((c) => c.id === CATEGORY_GYM);
    expect(gym?.useTimeWindows).toBe(true);
    expect(result.autoEnabledCategoryIds).toEqual([CATEGORY_GYM]);
  });

  it("accepts a category created earlier in the same working state", () => {
    const created = addDraftCategories(
      state(),
      [{ name: "Study" }],
      VALID_LOCATIONS,
    );
    const studyId = created.state.categories.find(
      (c) => c.name === "Study",
    )?.id as string;
    const result = addDraftTimeWindows(created.state, [
      { categoryId: studyId, day: 2, startTime: "19:00", endTime: "21:00" },
    ]);
    expect(result.failures).toHaveLength(0);
    expect(result.autoEnabledCategoryIds).toEqual([studyId]);
  });

  it("collects per-row validation failures without dropping valid rows", () => {
    const result = addDraftTimeWindows(state(), [
      { categoryId: "nope", day: 1, startTime: "09:00", endTime: "10:00" },
      { categoryId: CATEGORY_WORK, day: 7, startTime: "09:00", endTime: "10:00" },
      { categoryId: CATEGORY_WORK, day: 1, startTime: "24:00", endTime: "10:00" },
      { categoryId: CATEGORY_WORK, day: 1, startTime: "09:00", endTime: "09:00" },
      { categoryId: CATEGORY_WORK, day: 5, startTime: "10:00", endTime: "23:59" },
      { categoryId: CATEGORY_WORK, day: 1, startTime: "23:00", endTime: "07:00" },
    ]);
    // Unknown category, bad day, bad time, equal bounds fail; the within-day
    // and the overnight (start > end) rows are accepted.
    expect(result.failures).toHaveLength(4);
    expect(result.state.windows).toHaveLength(3);
    expect(
      result.state.windows
        .slice(1)
        .map((w) => `${w.startTime}-${w.endTime}`)
        .sort(),
    ).toEqual(["10:00-23:59", "23:00-07:00"]);
  });

  it("accepts an overnight window whose startTime is after its endTime", () => {
    const result = addDraftTimeWindows(state(), [
      { categoryId: CATEGORY_WORK, day: 1, startTime: "23:00", endTime: "07:00" },
    ]);
    expect(result.failures).toHaveLength(0);
    expect(result.state.windows).toHaveLength(2);
    expect(result.state.windows[1]).toMatchObject({
      startTime: "23:00",
      endTime: "07:00",
    });
  });

  it("does not mutate the input state", () => {
    const input = state();
    addDraftTimeWindows(input, [
      { categoryId: CATEGORY_GYM, day: 3, startTime: "18:00", endTime: "20:00" },
    ]);
    expect(input).toEqual(state());
  });
});

describe("updateDraftTimeWindows", () => {
  it("applies partial patches including reparenting", () => {
    const result = updateDraftTimeWindows(state(), [
      { id: "win-1", categoryId: CATEGORY_GYM, startTime: "10:00" },
    ]);
    expect(result.failures).toHaveLength(0);
    expect(result.state.windows[0]).toMatchObject({
      categoryId: CATEGORY_GYM,
      startTime: "10:00",
      endTime: "17:00",
    });
  });

  it("validates the patched start/end pair together, rejecting equal bounds", () => {
    // The window ends 17:00; patching startTime to 17:00 collapses it.
    const result = updateDraftTimeWindows(state(), [
      { id: "win-1", startTime: "17:00" },
    ]);
    expect(result.failures).toHaveLength(1);
    expect(result.state.windows[0].startTime).toBe("09:00");
  });

  it("accepts a patch that turns the window overnight", () => {
    const result = updateDraftTimeWindows(state(), [
      { id: "win-1", startTime: "22:00", endTime: "06:00" },
    ]);
    expect(result.failures).toHaveLength(0);
    expect(result.state.windows[0]).toMatchObject({
      startTime: "22:00",
      endTime: "06:00",
    });
  });

  it("fails on unknown id and unknown categoryId", () => {
    const result = updateDraftTimeWindows(state(), [
      { id: "ghost", day: 2 },
      { id: "win-1", categoryId: "nope" },
    ]);
    expect(result.failures).toHaveLength(2);
    expect(result.state.windows[0].categoryId).toBe(CATEGORY_WORK);
  });

  it("does not mutate the input state", () => {
    const input = state();
    updateDraftTimeWindows(input, [{ id: "win-1", day: 4 }]);
    expect(input.windows[0].day).toBe(1);
  });
});

describe("deleteDraftTimeWindows", () => {
  it("removes rows, dedupes ids, and reports unknown ids", () => {
    const result = deleteDraftTimeWindows(
      state({ windows: [window(), window({ id: "win-2", day: 2 })] }),
      ["win-2", "win-2", "ghost"],
    );
    expect(result.changed).toBe(true);
    expect(result.state.windows).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe("ghost");
  });
});

describe("addDraftCategories", () => {
  it("mints ids, trims names, and defaults flags off", () => {
    const result = addDraftCategories(
      state(),
      [{ name: "  Study  ", color: "#16A085" }],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(0);
    expect(result.changed).toBe(true);
    const study = result.state.categories.find((c) => c.name === "Study");
    expect(study).toMatchObject({
      color: "#16A085",
      parentId: null,
      locationId: null,
      useTimeWindows: false,
      isStrict: false,
      confineToOwnWindows: false,
    });
    expect(study?.id.length).toBeGreaterThan(0);
  });

  it("nests under an existing parent and accepts a valid location", () => {
    const result = addDraftCategories(
      state(),
      [{ name: "Deep work", parentId: CATEGORY_WORK, locationId: LOCATION_OFFICE }],
      VALID_LOCATIONS,
    );
    const child = result.state.categories.find((c) => c.name === "Deep work");
    expect(child?.parentId).toBe(CATEGORY_WORK);
    expect(child?.locationId).toBe(LOCATION_OFFICE);
  });

  it("rejects unknown parent, unknown location, bad color, and empty name", () => {
    const result = addDraftCategories(
      state(),
      [
        { name: "A", parentId: "ghost" },
        { name: "B", locationId: "ghost" },
        { name: "C", color: "blue" },
        { name: "   " },
      ],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(4);
    expect(result.changed).toBe(false);
  });

  it("rejects a duplicate name among same-parent siblings but allows it elsewhere", () => {
    const duplicate = addDraftCategories(
      state(),
      [{ name: "work" }],
      VALID_LOCATIONS,
    );
    expect(duplicate.failures).toHaveLength(1);
    const nested = addDraftCategories(
      state(),
      [{ name: "Work", parentId: CATEGORY_GYM }],
      VALID_LOCATIONS,
    );
    expect(nested.failures).toHaveLength(0);
  });
});

describe("updateDraftCategories", () => {
  it("patches name, color, location, and flags by id", () => {
    const result = updateDraftCategories(
      state(),
      [
        {
          id: CATEGORY_WORK,
          name: "Career",
          color: null,
          locationId: LOCATION_OFFICE,
          isStrict: true,
        },
      ],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(0);
    const work = result.state.categories.find((c) => c.id === CATEGORY_WORK);
    expect(work).toMatchObject({
      name: "Career",
      color: null,
      locationId: LOCATION_OFFICE,
      useTimeWindows: true,
      isStrict: true,
    });
  });

  it("reparents and rejects cycles", () => {
    const withChild = addDraftCategories(
      state(),
      [{ name: "Deep work", parentId: CATEGORY_WORK }],
      VALID_LOCATIONS,
    );
    const childId = withChild.state.categories.find(
      (c) => c.name === "Deep work",
    )?.id as string;

    const moved = updateDraftCategories(
      withChild.state,
      [{ id: childId, parentId: CATEGORY_GYM }],
      VALID_LOCATIONS,
    );
    expect(moved.failures).toHaveLength(0);
    expect(
      moved.state.categories.find((c) => c.id === childId)?.parentId,
    ).toBe(CATEGORY_GYM);

    const selfParent = updateDraftCategories(
      withChild.state,
      [{ id: CATEGORY_WORK, parentId: CATEGORY_WORK }],
      VALID_LOCATIONS,
    );
    expect(selfParent.failures).toHaveLength(1);

    const cycle = updateDraftCategories(
      withChild.state,
      [{ id: CATEGORY_WORK, parentId: childId }],
      VALID_LOCATIONS,
    );
    expect(cycle.failures).toHaveLength(1);
  });

  it("fails on unknown category, unknown location, and empty patches", () => {
    const result = updateDraftCategories(
      state(),
      [
        { id: "nope", isStrict: true },
        { id: CATEGORY_WORK, locationId: "ghost" },
        { id: CATEGORY_WORK },
      ],
      VALID_LOCATIONS,
    );
    expect(result.failures).toHaveLength(3);
    expect(result.changed).toBe(false);
  });

  it("does not mutate the input state", () => {
    const input = state();
    updateDraftCategories(
      input,
      [{ id: CATEGORY_WORK, isStrict: true }],
      VALID_LOCATIONS,
    );
    expect(input.categories[0].isStrict).toBe(false);
  });
});

describe("deleteDraftCategories", () => {
  it("cascades over the subtree and removes their windows", () => {
    const withChild = addDraftCategories(
      state({
        windows: [
          window(),
          window({ id: "win-gym", categoryId: CATEGORY_GYM, day: 3 }),
        ],
      }),
      [{ name: "Deep work", parentId: CATEGORY_WORK }],
      VALID_LOCATIONS,
    );
    const childId = withChild.state.categories.find(
      (c) => c.name === "Deep work",
    )?.id as string;
    const withChildWindow = addDraftTimeWindows(withChild.state, [
      { categoryId: childId, day: 4, startTime: "09:00", endTime: "11:00" },
    ]);

    const result = deleteDraftCategories(withChildWindow.state, [
      CATEGORY_WORK,
    ]);
    expect(result.changed).toBe(true);
    expect(result.state.categories.map((c) => c.id)).toEqual([CATEGORY_GYM]);
    expect(result.state.windows.map((w) => w.id)).toEqual(["win-gym"]);
  });

  it("reports unknown ids without dropping valid deletes", () => {
    const result = deleteDraftCategories(state(), ["ghost", CATEGORY_GYM]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe("ghost");
    expect(result.state.categories.map((c) => c.id)).toEqual([CATEGORY_WORK]);
  });
});

describe("findWindowOverlaps", () => {
  it("reports same-day intersections within and across categories", () => {
    const overlaps = findWindowOverlaps([
      window({ id: "work-sat", day: 6, startTime: "10:00", endTime: "14:00" }),
      window({
        id: "fun-sat",
        categoryId: CATEGORY_GYM,
        day: 6,
        startTime: "12:00",
        endTime: "16:00",
      }),
      window({ id: "work-sun", day: 0, startTime: "10:00", endTime: "14:00" }),
    ]);
    expect(overlaps).toHaveLength(1);
    expect([overlaps[0].a.id, overlaps[0].b.id].sort()).toEqual([
      "fun-sat",
      "work-sat",
    ]);
  });

  it("does not flag adjacent ranges (end == start) or different days", () => {
    expect(
      findWindowOverlaps([
        window({ id: "a", day: 2, startTime: "09:00", endTime: "12:00" }),
        window({ id: "b", day: 2, startTime: "12:00", endTime: "15:00" }),
        window({ id: "c", day: 3, startTime: "09:00", endTime: "12:00" }),
      ]),
    ).toHaveLength(0);
  });

  it("scopes to involved ids so pre-existing overlaps are not re-reported", () => {
    const windows = [
      window({ id: "old-1", day: 1, startTime: "09:00", endTime: "12:00" }),
      window({ id: "old-2", day: 1, startTime: "11:00", endTime: "13:00" }),
      window({ id: "new-1", day: 1, startTime: "12:30", endTime: "14:00" }),
    ];
    const scoped = findWindowOverlaps(windows, new Set(["new-1"]));
    expect(scoped).toHaveLength(1);
    expect([scoped[0].a.id, scoped[0].b.id].sort()).toEqual([
      "new-1",
      "old-2",
    ]);
    expect(findWindowOverlaps(windows)).toHaveLength(2);
  });

  it("flags an overnight window colliding with the next morning across the day boundary", () => {
    const overlaps = findWindowOverlaps([
      window({ id: "mon-night", day: 1, startTime: "23:00", endTime: "07:00" }),
      window({ id: "tue-morning", day: 2, startTime: "06:00", endTime: "09:00" }),
    ]);
    expect(overlaps).toHaveLength(1);
  });

  it("does not flag an overnight window against an unrelated next-day window", () => {
    const overlaps = findWindowOverlaps([
      window({ id: "mon-night", day: 1, startTime: "23:00", endTime: "07:00" }),
      window({ id: "tue-day", day: 2, startTime: "09:00", endTime: "17:00" }),
    ]);
    expect(overlaps).toHaveLength(0);
  });

  it("wraps a Saturday overnight window into Sunday morning on the weekly ring", () => {
    const overlaps = findWindowOverlaps([
      window({ id: "sat-night", day: 6, startTime: "23:00", endTime: "07:00" }),
      window({ id: "sun-morning", day: 0, startTime: "05:00", endTime: "08:00" }),
    ]);
    expect(overlaps).toHaveLength(1);
  });
});

describe("draftWindowsStateEqual / normalizeDraftWindowsState", () => {
  it("is order-insensitive on both arrays", () => {
    const a = state({
      windows: [window(), window({ id: "win-2", day: 2 })],
    });
    const b = state({
      windows: [window({ id: "win-2", day: 2 }), window()],
      categories: [...state().categories].reverse(),
    });
    expect(draftWindowsStateEqual(a, b)).toBe(true);
  });

  it("detects window field, category field, and membership changes", () => {
    expect(
      draftWindowsStateEqual(
        state(),
        state({ windows: [window({ endTime: "16:00" })] }),
      ),
    ).toBe(false);
    expect(draftWindowsStateEqual(state(), state({ windows: [] }))).toBe(false);
    expect(
      draftWindowsStateEqual(
        state(),
        state({
          categories: [
            record({ name: "Career" }),
            record({ id: CATEGORY_GYM, name: "Gym", useTimeWindows: false }),
          ],
        }),
      ),
    ).toBe(false);
    expect(
      draftWindowsStateEqual(
        state(),
        state({
          categories: [
            record({ parentId: CATEGORY_GYM }),
            record({ id: CATEGORY_GYM, name: "Gym", useTimeWindows: false }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("drops malformed entries from SSE payloads", () => {
    const normalized = normalizeDraftWindowsState({
      windows: [
        window(),
        { id: "x", categoryId: CATEGORY_WORK, day: 1, startTime: "09:00", endTime: "09:00" },
        "not an object",
      ],
      categories: [
        record(),
        record({ id: "", name: "no id" }),
        record({ id: "bad-color", color: "blue" as unknown as string }),
      ],
    });
    expect(normalized?.windows).toHaveLength(1);
    expect(normalized?.categories).toHaveLength(1);
  });

  it("returns null for payloads missing either array", () => {
    expect(normalizeDraftWindowsState({ windows: [] })).toBeNull();
    expect(normalizeDraftWindowsState(null)).toBeNull();
  });
});
