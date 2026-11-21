import {
  buildRoleCategories,
  reconcileRoleCategories,
  prefillRoleSelections,
  type RoleSelection,
} from "@/app/(protected)/onboarding/_lib/starterCategories";
import {
  buildWeekTemplates,
  expandDailyRange,
  reconcileWeekTemplateRows,
  ALL_WEEK_DAYS,
  WEEKDAYS,
  DEFAULT_WEEK,
  type WeekFormInput,
} from "@/app/(protected)/onboarding/_lib/weekTemplates";
import {
  applyWorkCategory,
  clearWorkCategoryWindows,
} from "@/app/(protected)/onboarding/_lib/workCategory";
import { buildRoleCategories as buildRoles } from "@/app/(protected)/onboarding/_lib/starterCategories";
import {
  applyBrainDump,
  buildBrainDumpRow,
  durationForType,
  type CommittedDump,
  type DumpItem,
} from "@/app/(protected)/onboarding/_lib/brainDumpRows";
import { migrateProgress } from "@/app/(protected)/onboarding/_lib/onboardingProgress";
import type { Planner } from "@/types/prisma";

function candidateIdsFor(selections: RoleSelection[]): Map<string, string> {
  return new Map(
    selections.map((s, i) => [s.name.trim().toLowerCase(), `cand-${i}`]),
  );
}

const USER_ID = "user-1";
const NOW = "2026-07-05T00:00:00.000Z";

describe("buildRoleCategories", () => {
  const selections: RoleSelection[] = [
    { key: "professional", name: "Professional", color: "#3b82f6" },
    { key: "self", name: "Self", color: "#22c55e" },
  ];

  it("builds one category per selection with onboarding defaults", () => {
    const categories = buildRoleCategories(selections, USER_ID, NOW);
    expect(categories).toHaveLength(2);
    for (const category of categories) {
      expect(category.userId).toBe(USER_ID);
      expect(category.parentId).toBeNull();
      expect(category.locationId).toBeNull();
      expect(category.useTimeWindows).toBe(false);
      expect(category.isStrict).toBe(false);
      expect(category.confineToOwnWindows).toBe(false);
      expect(category.timeSlots).toEqual([]);
      expect(category.createdAt).toBe(NOW);
      expect(category.updatedAt).toBe(NOW);
      expect(typeof category.id).toBe("string");
      expect(category.id.length).toBeGreaterThan(0);
    }
    expect(categories.map((c) => c.name)).toEqual(["Professional", "Self"]);
    expect(categories.map((c) => c.color)).toEqual(["#3b82f6", "#22c55e"]);
  });

  it("assigns unique ids and sequential sortOrder from the offset", () => {
    const categories = buildRoleCategories(selections, USER_ID, NOW, 5);
    expect(categories.map((c) => c.sortOrder)).toEqual([5, 6]);
    expect(new Set(categories.map((c) => c.id)).size).toBe(2);
  });

  it("trims whitespace from custom role names", () => {
    const [category] = buildRoleCategories(
      [{ key: "custom:reading", name: "  Reading  ", color: "#6366f1" }],
      USER_ID,
      NOW,
    );
    expect(category.name).toBe("Reading");
  });
});

describe("expandDailyRange", () => {
  it("keeps a within-day range as one block per day", () => {
    const blocks = expandDailyRange(WEEKDAYS, "09:00", "17:00");
    expect(blocks).toHaveLength(5);
    for (const block of blocks) {
      expect(block.startTime).toBe("09:00");
      expect(block.duration).toBe(480);
    }
    expect(blocks.map((b) => b.startDay)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps a midnight-crossing range as one overnight block on its start day", () => {
    const blocks = expandDailyRange([1], "23:00", "07:00");
    expect(blocks).toEqual([
      { startDay: 1, startTime: "23:00", duration: 480 },
    ]);
  });

  it("keeps a Saturday overnight block on Saturday rather than wrapping to Sunday", () => {
    const blocks = expandDailyRange([6], "23:00", "07:00");
    expect(blocks).toEqual([
      { startDay: 6, startTime: "23:00", duration: 480 },
    ]);
  });

  it("keeps a range ending at midnight as one within-day block", () => {
    const blocks = expandDailyRange([2], "23:00", "00:00");
    expect(blocks).toEqual([
      { startDay: 2, startTime: "23:00", duration: 60 },
    ]);
  });

  it("returns nothing for an empty day set", () => {
    expect(expandDailyRange([], "09:00", "17:00")).toEqual([]);
  });
});

describe("buildWeekTemplates", () => {
  it("expands overnight sleep into one continuous block per day", () => {
    const input: WeekFormInput = {
      sleep: { start: "23:00", end: "07:00" },
      work: null,
    };
    const templates = buildWeekTemplates(input, USER_ID, NOW);
    expect(templates).toHaveLength(ALL_WEEK_DAYS.length);
    expect(templates.every((t) => t.title === "Sleep")).toBe(true);
    expect(templates.every((t) => t.locationId === null)).toBe(true);
    expect(templates.every((t) => t.userId === USER_ID)).toBe(true);
    // One overnight block per day — never split at midnight.
    expect(templates.every((t) => t.startTime === "23:00")).toBe(true);
    expect(templates.every((t) => t.duration === 480)).toBe(true);
    expect(templates.map((t) => t.startDay).sort()).toEqual([...ALL_WEEK_DAYS]);
  });

  it("ignores work hours — they become Work category windows, not templates", () => {
    const input: WeekFormInput = {
      sleep: null,
      work: {
        start: "09:00",
        end: "17:00",
        days: WEEKDAYS,
        locationId: "loc-work",
      },
    };
    expect(buildWeekTemplates(input, USER_ID, NOW)).toEqual([]);
  });

  it("emits nothing when both sections are disabled", () => {
    expect(buildWeekTemplates({ sleep: null, work: null }, USER_ID, NOW)).toEqual(
      [],
    );
  });

  it("mints unique ids across every emitted template", () => {
    const templates = buildWeekTemplates(
      { sleep: { start: "23:00", end: "07:00" }, work: null },
      USER_ID,
      NOW,
    );
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  });

  it("emits a within-day routine as one short block per day", () => {
    const templates = buildWeekTemplates(
      { sleep: null, work: null, morning: { start: "07:00", end: "07:30" } },
      USER_ID,
      NOW,
    );
    expect(templates).toHaveLength(ALL_WEEK_DAYS.length);
    expect(templates.every((t) => t.title === "Morning routine")).toBe(true);
    expect(templates.every((t) => t.duration === 30)).toBe(true);
  });

  it("drops a routine whose end is not after its start instead of wrapping overnight", () => {
    // "10:00" meant as 10 PM but read as 10 AM: end <= start. A within-day
    // routine must not balloon into a multi-hour overnight block.
    const templates = buildWeekTemplates(
      {
        sleep: null,
        work: null,
        evening: { start: "21:30", end: "10:00" },
      },
      USER_ID,
      NOW,
    );
    expect(templates).toEqual([]);
  });
});

describe("applyWorkCategory", () => {
  const work = {
    start: "09:00",
    end: "17:00",
    days: WEEKDAYS,
    locationId: "loc-work",
  };

  it("returns prev unchanged with no work hours", () => {
    const prev = buildRoles([{ key: "self", name: "Self", color: "#22c55e" }], USER_ID, NOW);
    expect(applyWorkCategory(prev, null, USER_ID, NOW)).toBe(prev);
    expect(
      applyWorkCategory(prev, { ...work, days: [] }, USER_ID, NOW),
    ).toBe(prev);
  });

  it("creates a Professional role and a Work sub-category with windows and useTimeWindows on", () => {
    const next = applyWorkCategory([], work, USER_ID, NOW);
    const professional = next.find((c) => c.name === "Professional");
    const workCat = next.find((c) => c.name === "Work");
    expect(professional).toBeDefined();
    expect(professional?.parentId).toBeNull();
    expect(workCat).toBeDefined();
    expect(workCat?.parentId).toBe(professional?.id);
    expect(workCat?.useTimeWindows).toBe(true);
    expect(workCat?.isStrict).toBe(false);
    expect(workCat?.locationId).toBe("loc-work");
    expect(workCat?.timeSlots).toHaveLength(5);
    expect(workCat?.timeSlots.every((w) => w.startTime === "09:00")).toBe(true);
    expect(workCat?.timeSlots.every((w) => w.endTime === "17:00")).toBe(true);
    expect(workCat?.timeSlots.every((w) => w.categoryId === workCat?.id)).toBe(true);
    expect(workCat?.timeSlots.every((w) => w.userId === USER_ID)).toBe(true);
  });

  it("nests Work under an existing Professional role instead of duplicating it", () => {
    const prev = buildRoles(
      [{ key: "professional", name: "Professional", color: "#3b82f6" }],
      USER_ID,
      NOW,
    );
    const next = applyWorkCategory(prev, work, USER_ID, NOW);
    expect(next.filter((c) => c.name === "Professional")).toHaveLength(1);
    const workCat = next.find((c) => c.name === "Work");
    expect(workCat?.parentId).toBe(prev[0].id);
  });

  it("replaces Work windows wholesale on re-apply (idempotent Back/forward)", () => {
    const once = applyWorkCategory([], work, USER_ID, NOW);
    const twice = applyWorkCategory(once, { ...work, days: [1, 2] }, USER_ID, NOW);
    expect(twice.filter((c) => c.name === "Work")).toHaveLength(1);
    const workCat = twice.find((c) => c.name === "Work");
    expect(workCat?.timeSlots).toHaveLength(2);
    expect(workCat?.timeSlots.map((w) => w.day).sort()).toEqual([1, 2]);
  });

  it("splits an overnight shift at midnight with the morning piece on the following day", () => {
    const next = applyWorkCategory(
      [],
      { start: "22:00", end: "06:00", days: [1], locationId: null },
      USER_ID,
      NOW,
    );
    const workCat = next.find((c) => c.name === "Work");
    expect(workCat?.timeSlots).toEqual([
      expect.objectContaining({ day: 1, startTime: "22:00", endTime: "23:59" }),
      expect.objectContaining({ day: 2, startTime: "00:00", endTime: "06:00" }),
    ]);
  });
});

describe("clearWorkCategoryWindows", () => {
  const work = {
    start: "09:00",
    end: "17:00",
    days: WEEKDAYS,
    locationId: null,
  };

  it("clears the Work category's windows and disables useTimeWindows", () => {
    const applied = applyWorkCategory([], work, USER_ID, NOW);
    const LATER = "2026-07-06T00:00:00.000Z";
    const cleared = clearWorkCategoryWindows(applied, LATER);
    const workCat = cleared.find((c) => c.name === "Work");
    expect(workCat?.timeSlots).toEqual([]);
    expect(workCat?.useTimeWindows).toBe(false);
    expect(workCat?.updatedAt).toBe(LATER);
    // The Professional role itself is untouched.
    const role = cleared.find((c) => c.name === "Professional");
    expect(role?.updatedAt).toBe(NOW);
  });

  it("returns prev unchanged when there is nothing to clear", () => {
    const applied = applyWorkCategory([], work, USER_ID, NOW);
    const cleared = clearWorkCategoryWindows(applied, NOW);
    const twice = clearWorkCategoryWindows(cleared, "2026-07-07T00:00:00.000Z");
    expect(twice).toBe(cleared);
    expect(clearWorkCategoryWindows([], NOW)).toEqual([]);
  });
});

describe("reconcileWeekTemplateRows", () => {
  const input: WeekFormInput = {
    sleep: { start: "23:00", end: "07:00" },
    work: null,
  };

  it("reuses the previous row object for an unchanged block", () => {
    const first = buildWeekTemplates(input, USER_ID, NOW);
    const second = buildWeekTemplates(input, USER_ID, "2026-07-06T00:00:00.000Z");
    const reconciled = reconcileWeekTemplateRows(first, second);
    expect(reconciled).toHaveLength(second.length);
    for (const row of reconciled) {
      expect(first).toContain(row);
    }
  });

  it("keeps fresh rows for changed blocks and never reuses one row twice", () => {
    const withRoutine: WeekFormInput = {
      sleep: { start: "23:00", end: "07:00" },
      work: null,
      morning: { start: "07:00", end: "07:30" },
    };
    const first = buildWeekTemplates(withRoutine, USER_ID, NOW);
    const changed = buildWeekTemplates(
      { ...withRoutine, sleep: { start: "22:00", end: "07:00" } },
      USER_ID,
      "2026-07-06T00:00:00.000Z",
    );
    const reconciled = reconcileWeekTemplateRows(first, changed);
    // Sleep moved to 22:00 (fresh rows); the untouched morning routine rows
    // are reused from the previous commit.
    const sleep = reconciled.filter((t) => t.title === "Sleep");
    const morning = reconciled.filter((t) => t.title === "Morning routine");
    expect(sleep.every((t) => !first.includes(t))).toBe(true);
    expect(morning.every((t) => first.includes(t))).toBe(true);
    expect(new Set(reconciled.map((t) => t.id)).size).toBe(reconciled.length);
  });
});

describe("buildBrainDumpRow", () => {
  const base: Omit<DumpItem, "type"> = { id: "row-1", title: "  Write book  " };

  it("keeps the jotted id and trims the title", () => {
    const row = buildBrainDumpRow({ ...base, type: "task" }, USER_ID, NOW);
    expect(row.id).toBe("row-1");
    expect(row.title).toBe("Write book");
  });

  it("stamps triaged planning defaults, ready by type, for every type", () => {
    for (const type of ["task", "plan", "goal"] as const) {
      const row = buildBrainDumpRow({ ...base, type }, USER_ID, NOW);
      expect(row.plannerType).toBe(type);
      expect(row.isTriaged).toBe(true);
      // Tasks and plans are ready to schedule by default; goals are not.
      expect(row.isReady).toBe(type !== "goal");
      expect(row.parentId).toBeNull();
      expect(row.deadline).toBeNull();
      expect(row.starts).toBeNull();
      expect(row.categoryId).toBeNull();
      expect(row.locationId).toBeNull();
      expect(row.useParentLocation).toBe(false);
      expect(row.userId).toBe(USER_ID);
      expect(row.createdAt).toBe(NOW);
      expect(row.updatedAt).toBe(NOW);
    }
  });

  it("gives tasks and plans a placeholder duration, goals zero", () => {
    expect(durationForType("task")).toBe(30);
    expect(durationForType("plan")).toBe(30);
    expect(durationForType("goal")).toBe(0);
    expect(
      buildBrainDumpRow({ ...base, type: "task" }, USER_ID, NOW).duration,
    ).toBe(30);
    expect(
      buildBrainDumpRow({ ...base, type: "plan" }, USER_ID, NOW).duration,
    ).toBe(30);
    expect(
      buildBrainDumpRow({ ...base, type: "goal" }, USER_ID, NOW).duration,
    ).toBe(0);
  });
});

describe("reconcileRoleCategories", () => {
  const professional: RoleSelection = {
    key: "professional",
    name: "Professional",
    color: "#3b82f6",
  };
  const self: RoleSelection = { key: "self", name: "Self", color: "#22c55e" };

  it("creates categories with the supplied candidate ids and tracks them as owned", () => {
    const selections = [professional, self];
    const { categories, ownedIds } = reconcileRoleCategories(
      [],
      selections,
      new Set(),
      candidateIdsFor(selections),
      USER_ID,
      NOW,
    );
    expect(categories.map((c) => c.name)).toEqual(["Professional", "Self"]);
    expect(categories.map((c) => c.id)).toEqual(["cand-0", "cand-1"]);
    expect([...ownedIds]).toEqual(["cand-0", "cand-1"]);
  });

  it("removes an owned role the user deselected", () => {
    const selections = [professional, self];
    const first = reconcileRoleCategories(
      [],
      selections,
      new Set(),
      candidateIdsFor(selections),
      USER_ID,
      NOW,
    );
    const kept = [professional];
    const second = reconcileRoleCategories(
      first.categories,
      kept,
      first.ownedIds,
      candidateIdsFor(kept),
      USER_ID,
      NOW,
    );
    expect(second.categories.map((c) => c.name)).toEqual(["Professional"]);
    expect([...second.ownedIds]).toEqual(["cand-0"]);
  });

  it("restamps sortOrder on a post-commit reorder of owned roles", () => {
    const selections = [professional, self];
    const first = reconcileRoleCategories(
      [],
      selections,
      new Set(),
      candidateIdsFor(selections),
      USER_ID,
      NOW,
    );
    const reordered = [self, professional];
    const second = reconcileRoleCategories(
      first.categories,
      reordered,
      first.ownedIds,
      candidateIdsFor(reordered),
      USER_ID,
      NOW,
    );
    const byName = new Map(second.categories.map((c) => [c.name, c.sortOrder]));
    expect(byName.get("Self")).toBe(0);
    expect(byName.get("Professional")).toBe(1);
  });

  it("keeps a deselected role that has children, protecting a Work category", () => {
    const selections = [professional];
    const first = reconcileRoleCategories(
      [],
      selections,
      new Set(),
      candidateIdsFor(selections),
      USER_ID,
      NOW,
    );
    const withWork = applyWorkCategory(
      first.categories,
      { start: "09:00", end: "17:00", days: WEEKDAYS, locationId: null },
      USER_ID,
      NOW,
    );
    // Deselect Professional entirely; its Work child must keep it alive.
    const second = reconcileRoleCategories(
      withWork,
      [],
      first.ownedIds,
      new Map(),
      USER_ID,
      NOW,
    );
    expect(second.categories.some((c) => c.name === "Professional")).toBe(true);
    expect(second.categories.some((c) => c.name === "Work")).toBe(true);
  });

  it("does not delete a pre-existing category the flow never created", () => {
    const preexisting = buildRoles([self], USER_ID, NOW);
    // Self is not in ownedIds; deselecting it must not remove it.
    const { categories } = reconcileRoleCategories(
      preexisting,
      [],
      new Set(),
      new Map(),
      USER_ID,
      NOW,
    );
    expect(categories.map((c) => c.name)).toEqual(["Self"]);
  });

  it("never adopts a matched pre-existing category: no restamp, no later removal", () => {
    const preexisting = buildRoles([self], USER_ID, NOW);
    // The user selects the name of a category they already had.
    const first = reconcileRoleCategories(
      preexisting,
      [professional, self],
      new Set(),
      candidateIdsFor([professional, self]),
      USER_ID,
      NOW,
    );
    expect(first.ownedIds.has(preexisting[0].id)).toBe(false);
    const matched = first.categories.find((c) => c.id === preexisting[0].id);
    expect(matched?.updatedAt).toBe(NOW);
    expect(matched?.sortOrder).toBe(preexisting[0].sortOrder);
    // Deselecting it afterwards must not remove it.
    const second = reconcileRoleCategories(
      first.categories,
      [professional],
      first.ownedIds,
      candidateIdsFor([professional]),
      USER_ID,
      NOW,
    );
    expect(second.categories.some((c) => c.id === preexisting[0].id)).toBe(true);
  });

  it("keeps ownership of a deselected role kept alive by children", () => {
    const first = reconcileRoleCategories(
      [],
      [professional],
      new Set(),
      candidateIdsFor([professional]),
      USER_ID,
      NOW,
    );
    const withWork = applyWorkCategory(
      first.categories,
      { start: "09:00", end: "17:00", days: WEEKDAYS, locationId: null },
      USER_ID,
      NOW,
    );
    const deselected = reconcileRoleCategories(
      withWork,
      [],
      first.ownedIds,
      new Map(),
      USER_ID,
      NOW,
    );
    // Kept alive by the Work child, and still owned so a reselect manages it.
    expect(deselected.categories.some((c) => c.name === "Professional")).toBe(
      true,
    );
    expect(deselected.ownedIds).toEqual(first.ownedIds);
    const reselected = reconcileRoleCategories(
      deselected.categories,
      [{ ...professional, color: "#000000" }],
      deselected.ownedIds,
      candidateIdsFor([professional]),
      USER_ID,
      "2026-07-06T00:00:00.000Z",
    );
    const role = reselected.categories.find((c) => c.name === "Professional");
    expect(role?.color).toBe("#000000");
  });
});

describe("prefillRoleSelections", () => {
  it("maps top-level categories to selections in sortOrder, matching presets by name", () => {
    const categories = buildRoleCategories(
      [
        { key: "custom:reading", name: "Reading", color: "#111111" },
        { key: "self", name: "Self", color: "#8b5cf6" },
      ],
      USER_ID,
      NOW,
    );
    // Reverse sortOrder to prove the prefill sorts.
    categories[0].sortOrder = 1;
    categories[1].sortOrder = 0;
    const selections = prefillRoleSelections(categories);
    expect(selections.map((s) => s.name)).toEqual(["Self", "Reading"]);
    expect(selections[0].key).toBe("self");
    expect(selections[1].key).toBe("custom:reading");
  });

  it("ignores sub-categories", () => {
    const [role] = buildRoleCategories(
      [{ key: "professional", name: "Professional", color: "#3b82f6" }],
      USER_ID,
      NOW,
    );
    const child = { ...role, id: "child-1", name: "Work", parentId: role.id };
    expect(prefillRoleSelections([role, child]).map((s) => s.name)).toEqual([
      "Professional",
    ]);
  });
});

function dumpRow(overrides: Partial<Planner> & { id: string }): Planner {
  return buildBrainDumpRow(
    { id: overrides.id, title: overrides.title ?? "row", type: "task" },
    USER_ID,
    NOW,
  );
}

describe("applyBrainDump", () => {
  it("appends new jots and drops removed ones with their subtrees", () => {
    const items: DumpItem[] = [
      { id: "a", title: "Alpha", type: "task" },
      { id: "b", title: "Beta", type: "goal" },
    ];
    const committed = new Map<string, CommittedDump>();
    const next = applyBrainDump([], items, committed, USER_ID, NOW);
    expect(next.map((p) => p.id).sort()).toEqual(["a", "b"]);

    // Drop "a"; it was committed, so it leaves.
    const afterRemove = applyBrainDump(
      next,
      [items[1]],
      new Map([
        ["a", { title: "Alpha", type: "task" }],
        ["b", { title: "Beta", type: "goal" }],
      ]),
      USER_ID,
      NOW,
    );
    expect(afterRemove.map((p) => p.id)).toEqual(["b"]);
  });

  it("removes a committed goal together with its AI-attached children", () => {
    const goal = dumpRow({ id: "g" });
    const child: Planner = { ...dumpRow({ id: "c" }), parentId: "g" };
    const committed = new Map<string, CommittedDump>([
      ["g", { title: goal.title, type: "task" }],
    ]);
    const next = applyBrainDump([goal, child], [], committed, USER_ID, NOW);
    expect(next).toEqual([]);
  });

  it("preserves an AI edit when the dump value is unchanged since the last commit", () => {
    // The AI promoted "g" from task to goal, refined title and duration.
    const aiEdited: Planner = {
      ...dumpRow({ id: "g" }),
      title: "Refined by AI",
      plannerType: "goal",
      duration: 0,
    };
    const items: DumpItem[] = [{ id: "g", title: "Original jot", type: "task" }];
    const committed = new Map<string, CommittedDump>([
      ["g", { title: "Original jot", type: "task" }],
    ]);
    const next = applyBrainDump([aiEdited], items, committed, USER_ID, NOW);
    const row = next.find((p) => p.id === "g");
    expect(row?.title).toBe("Refined by AI");
    expect(row?.plannerType).toBe("goal");
    expect(row?.duration).toBe(0);
  });

  it("applies a genuine dump edit over the previous commit", () => {
    const existing = dumpRow({ id: "g" });
    const items: DumpItem[] = [{ id: "g", title: "Renamed", type: "goal" }];
    const committed = new Map<string, CommittedDump>([
      ["g", { title: "row", type: "task" }],
    ]);
    const next = applyBrainDump([existing], items, committed, USER_ID, NOW);
    const row = next.find((p) => p.id === "g");
    expect(row?.title).toBe("Renamed");
    expect(row?.plannerType).toBe("goal");
    expect(row?.duration).toBe(0);
  });
});

describe("migrateProgress", () => {
  it("returns null for a non-object payload", () => {
    expect(migrateProgress(null)).toBeNull();
    expect(migrateProgress("nope")).toBeNull();
  });

  it("maps a versionless AI-step payload to the new AI index and empties the dump", () => {
    const migrated = migrateProgress({
      stepIndex: 4,
      weekTemplateIds: ["t-1", "t-2"],
    });
    expect(migrated).toEqual({
      version: 4,
      stepIndex: 5,
      roleCommittedIds: [],
      weekTemplateIds: ["t-1", "t-2"],
      week: null,
      weekWorkApplied: false,
      dumpItems: [],
      dumpCommitted: [],
      aiConversationId: null,
    });
  });

  it("leaves an early versionless step index untouched", () => {
    expect(migrateProgress({ stepIndex: 1 })?.stepIndex).toBe(1);
  });

  it("rebuilds v2 dumpCommittedIds into snapshots from the persisted jots", () => {
    const dumpItems: DumpItem[] = [{ id: "d-1", title: "Ship", type: "goal" }];
    const migrated = migrateProgress({
      version: 2,
      stepIndex: 4,
      weekTemplateIds: [],
      dumpItems,
      dumpCommittedIds: ["d-1"],
    });
    expect(migrated).toEqual({
      version: 4,
      stepIndex: 4,
      roleCommittedIds: [],
      weekTemplateIds: [],
      week: null,
      weekWorkApplied: false,
      dumpItems,
      dumpCommitted: [{ id: "d-1", title: "Ship", type: "goal" }],
      aiConversationId: null,
    });
  });

  it("migrates a v3 payload with a null week snapshot and no work flag", () => {
    const payload = {
      version: 3,
      stepIndex: 4,
      roleCommittedIds: ["cat-1"],
      weekTemplateIds: ["t-1"],
      dumpItems: [{ id: "d-1", title: "Ship", type: "goal" }],
      dumpCommitted: [{ id: "d-1", title: "Ship", type: "goal" }],
    };
    expect(migrateProgress(payload)).toEqual({
      ...payload,
      version: 4,
      week: null,
      weekWorkApplied: false,
      aiConversationId: null,
    });
  });

  it("passes a v4 payload through, keeping a valid week snapshot", () => {
    const payload = {
      version: 4,
      stepIndex: 3,
      roleCommittedIds: ["cat-1"],
      weekTemplateIds: ["t-1"],
      week: { ...DEFAULT_WEEK, workEnabled: true, workLocationId: "loc-1" },
      weekWorkApplied: true,
      dumpItems: [],
      dumpCommitted: [],
      aiConversationId: "conv-1",
    };
    expect(migrateProgress(payload)).toEqual(payload);
  });

  it("rejects a malformed week snapshot instead of half-restoring it", () => {
    const migrated = migrateProgress({
      version: 4,
      stepIndex: 3,
      roleCommittedIds: [],
      weekTemplateIds: [],
      week: { ...DEFAULT_WEEK, sleepStart: "25:0", workDays: [1, "x"] },
      weekWorkApplied: false,
      dumpItems: [],
      dumpCommitted: [],
    });
    expect(migrated?.week).toBeNull();
  });

  it("drops non-string ids and malformed dump items", () => {
    const migrated = migrateProgress({
      version: 3,
      stepIndex: 4,
      roleCommittedIds: ["a", 2, null],
      weekTemplateIds: ["ok", 3, null],
      dumpItems: [
        { id: "d-1", title: "Ok", type: "task" },
        { id: "", title: "no id", type: "task" },
        { id: "d-2", title: "bad type", type: "nope" },
      ],
      dumpCommitted: [{ id: "d-1", title: "Ok", type: "task" }, "junk"],
    });
    expect(migrated?.roleCommittedIds).toEqual(["a"]);
    expect(migrated?.weekTemplateIds).toEqual(["ok"]);
    expect(migrated?.dumpItems).toEqual([{ id: "d-1", title: "Ok", type: "task" }]);
    expect(migrated?.dumpCommitted).toEqual([
      { id: "d-1", title: "Ok", type: "task" },
    ]);
  });
});
