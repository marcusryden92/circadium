import { applyDraftWindows } from "@/utils/draft/applyDraftWindows";
import {
  categoriesToDraftWindows,
  type DraftWindowsState,
} from "@/utils/draft/draftWindows";
import type { Category, CategoryTimeWindow } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

const USER_ID = "user-1";
const NOW = "2026-07-04T12:00:00.000Z";
const THEN = "2026-01-01T00:00:00.000Z";

function slot(overrides: Partial<CategoryTimeWindow> = {}): CategoryTimeWindow {
  return {
    id: "win-1",
    categoryId: "category-work",
    day: 1 as WeekDayIntegers,
    startTime: "09:00",
    endTime: "17:00",
    recurrenceExceptions: null,
    userId: USER_ID,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "category-work",
    name: "Work",
    icon: null,
    color: null,
    sortOrder: 0,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    locationId: null,
    parentId: null,
    userId: USER_ID,
    createdAt: THEN,
    updatedAt: THEN,
    timeSlots: [slot()],
    ...overrides,
  } as Category;
}

function draftState(categories: Category[]): DraftWindowsState {
  return categoriesToDraftWindows(categories);
}

describe("applyDraftWindows", () => {
  it("returns untouched categories by object identity", () => {
    const current = [category()];
    const canonical = draftState(current);
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working: canonical,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0]).toBe(current[0]);
  });

  it("window-only changes do not restamp the category row", () => {
    const current = [category()];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: [{ ...canonical.windows[0], endTime: "16:00" }],
      categories: canonical.categories,
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0]).not.toBe(current[0]);
    expect(result[0].updatedAt).toBe(THEN);
    expect(result[0].timeSlots[0].endTime).toBe("16:00");
    expect(result[0].timeSlots[0].userId).toBe(USER_ID);
  });

  it("flag changes restamp updatedAt", () => {
    const current = [category()];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: canonical.windows,
      categories: [{ ...canonical.categories[0], isStrict: true }],
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0].isStrict).toBe(true);
    expect(result[0].updatedAt).toBe(NOW);
  });

  it("creates new windows with the draft uuid and userId, deletes removed ones", () => {
    const current = [category()];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: [
        {
          id: "minted-uuid",
          categoryId: "category-work",
          day: 3,
          startTime: "08:00",
          endTime: "12:00",
        },
      ],
      categories: canonical.categories,
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0].timeSlots).toHaveLength(1);
    expect(result[0].timeSlots[0]).toMatchObject({
      id: "minted-uuid",
      day: 3,
      userId: USER_ID,
    });
  });

  it("reparents a window across categories", () => {
    const current = [
      category(),
      category({ id: "category-gym", name: "Gym", timeSlots: [] }),
    ];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: [{ ...canonical.windows[0], categoryId: "category-gym" }],
      categories: canonical.categories,
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0].timeSlots).toHaveLength(0);
    expect(result[1].timeSlots).toHaveLength(1);
    expect(result[1].timeSlots[0].categoryId).toBe("category-gym");
  });

  it("preserves concurrent rows the assistant never saw", () => {
    const opened = [category()];
    const canonical = draftState(opened);
    const concurrent = slot({ id: "win-concurrent", day: 5 as WeekDayIntegers });
    const current = [category({ timeSlots: [slot(), concurrent] })];
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working: canonical,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0].timeSlots).toContain(concurrent);
  });

  it("assistant flag edits win, but untouched flags keep concurrent edits", () => {
    const opened = [category()];
    const canonical = draftState(opened);
    // While the modal was open, someone flipped isStrict elsewhere.
    const current = [category({ isStrict: true, updatedAt: "2026-06-01T00:00:00.000Z" })];
    const untouched = applyDraftWindows({
      currentCategories: current,
      canonical,
      working: canonical,
      userId: USER_ID,
      now: NOW,
    });
    expect(untouched[0].isStrict).toBe(true);
    expect(untouched[0]).toBe(current[0]);
  });

  it("creates a new category row keeping the draft id, appending sortOrder, and attaching its windows", () => {
    const current = [category()];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: [
        ...canonical.windows,
        {
          id: "new-window",
          categoryId: "draft-study",
          day: 2,
          startTime: "19:00",
          endTime: "21:00",
        },
      ],
      categories: [
        ...canonical.categories,
        {
          id: "draft-study",
          name: "Study",
          color: "#16A085",
          parentId: null,
          locationId: null,
          useTimeWindows: true,
          isStrict: false,
          confineToOwnWindows: false,
        },
      ],
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result).toHaveLength(2);
    const study = result.find((c) => c.id === "draft-study");
    expect(study).toMatchObject({
      name: "Study",
      color: "#16A085",
      sortOrder: 1,
      userId: USER_ID,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(study?.timeSlots).toHaveLength(1);
    expect(study?.timeSlots[0]).toMatchObject({
      id: "new-window",
      userId: USER_ID,
    });
    expect(result[0]).toBe(current[0]);
  });

  it("renames and reparents restamp updatedAt; untouched fields keep concurrent values", () => {
    const current = [
      category(),
      category({ id: "category-gym", name: "Gym", timeSlots: [] }),
    ];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: canonical.windows,
      categories: canonical.categories.map((c) =>
        c.id === "category-gym"
          ? { ...c, name: "Fitness", parentId: "category-work" }
          : c,
      ),
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    const gym = result.find((c) => c.id === "category-gym");
    expect(gym).toMatchObject({
      name: "Fitness",
      parentId: "category-work",
      updatedAt: NOW,
    });
    expect(result.find((c) => c.id === "category-work")).toBe(current[0]);
  });

  it("deletes a category the assistant removed, cascading over the current tree", () => {
    const opened = [category(), category({ id: "category-gym", name: "Gym", timeSlots: [] })];
    const canonical = draftState(opened);
    // Concurrent child created elsewhere under Gym while the modal was open.
    const concurrentChild = category({
      id: "category-yoga",
      name: "Yoga",
      parentId: "category-gym",
      timeSlots: [],
    });
    const current = [...opened, concurrentChild];
    const working: DraftWindowsState = {
      windows: canonical.windows,
      categories: canonical.categories.filter((c) => c.id !== "category-gym"),
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result.map((c) => c.id)).toEqual(["category-work"]);
  });

  it("preserves a concurrent category the assistant never saw", () => {
    const opened = [category()];
    const canonical = draftState(opened);
    const concurrent = category({
      id: "category-new",
      name: "Made elsewhere",
      timeSlots: [],
    });
    const current = [category(), concurrent];
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working: canonical,
      userId: USER_ID,
      now: NOW,
    });
    expect(result).toContain(concurrent);
  });

  it("does not resurrect a category deleted concurrently elsewhere", () => {
    const opened = [
      category(),
      category({ id: "category-gym", name: "Gym", timeSlots: [] }),
    ];
    const canonical = draftState(opened);
    // Gym was deleted in another tab while the modal was open; the assistant
    // renamed it in its draft. The concurrent delete wins.
    const current = [category()];
    const working: DraftWindowsState = {
      windows: canonical.windows,
      categories: canonical.categories.map((c) =>
        c.id === "category-gym" ? { ...c, name: "Fitness" } : c,
      ),
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result.map((c) => c.id)).toEqual(["category-work"]);
  });
});

describe("applyDraftWindows recurrence exceptions", () => {
  const EXCEPTIONS = '[{"key":"2026-01-06T09:00","type":"deleted"}]';

  it("preserves exceptions on untouched windows by object identity", () => {
    const current = [
      category({ timeSlots: [slot({ recurrenceExceptions: EXCEPTIONS })] }),
    ];
    const canonical = draftState(current);
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working: canonical,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0]).toBe(current[0]);
    expect(result[0].timeSlots[0].recurrenceExceptions).toBe(EXCEPTIONS);
  });

  it("preserves exceptions on an endTime-only draft change", () => {
    const current = [
      category({ timeSlots: [slot({ recurrenceExceptions: EXCEPTIONS })] }),
    ];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: [{ ...canonical.windows[0], endTime: "16:00" }],
      categories: canonical.categories,
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    expect(result[0].timeSlots[0].endTime).toBe("16:00");
    expect(result[0].timeSlots[0].recurrenceExceptions).toBe(EXCEPTIONS);
  });

  it("clears exceptions when the assistant re-anchors day or startTime", () => {
    const current = [
      category({
        timeSlots: [
          slot({ recurrenceExceptions: EXCEPTIONS }),
          slot({
            id: "win-2",
            day: 4 as WeekDayIntegers,
            recurrenceExceptions: EXCEPTIONS,
          }),
        ],
      }),
    ];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: canonical.windows.map((w) =>
        w.id === "win-1"
          ? { ...w, day: 2 }
          : { ...w, startTime: "10:00" },
      ),
      categories: canonical.categories,
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    for (const row of result[0].timeSlots) {
      expect(row.recurrenceExceptions).toBeNull();
    }
  });

  it("new draft rows land with null exceptions", () => {
    const current = [category()];
    const canonical = draftState(current);
    const working: DraftWindowsState = {
      windows: [
        ...canonical.windows,
        {
          id: "new-window",
          categoryId: "category-work",
          day: 3,
          startTime: "08:00",
          endTime: "12:00",
        },
      ],
      categories: canonical.categories,
    };
    const result = applyDraftWindows({
      currentCategories: current,
      canonical,
      working,
      userId: USER_ID,
      now: NOW,
    });
    const created = result[0].timeSlots.find((w) => w.id === "new-window");
    expect(created?.recurrenceExceptions).toBeNull();
  });
});
