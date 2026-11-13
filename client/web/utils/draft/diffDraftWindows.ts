import type { DiffStatus } from "./diffDraftTree";
import type {
  DraftCategoryRecord,
  DraftTimeWindow,
  DraftWindowsState,
} from "./draftWindows";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { orderedWeekDays } from "@/utils/calendarUtils";

export interface DiffWindow extends DraftTimeWindow {
  status: DiffStatus;
  // Populated only when status === "modified".
  changedFields: string[];
}

export interface DiffCategoryRecord extends DraftCategoryRecord {
  status: DiffStatus;
  // Field names that differ from canonical (name, color, parentId,
  // locationId, useTimeWindows, isStrict, confineToOwnWindows). Populated
  // only when status === "modified".
  changedFields: string[];
}

export interface DiffWindowsState {
  windows: DiffWindow[];
  categories: DiffCategoryRecord[];
}

const WINDOW_FIELDS = ["categoryId", "day", "startTime", "endTime"] as const;

const CATEGORY_FIELDS = [
  "name",
  "color",
  "parentId",
  "locationId",
  "useTimeWindows",
  "isStrict",
  "confineToOwnWindows",
] as const;

function windowFieldsThatChanged(
  a: DraftTimeWindow,
  b: DraftTimeWindow,
): string[] {
  return WINDOW_FIELDS.filter((field) => a[field] !== b[field]);
}

function categoryFieldsThatChanged(
  a: DraftCategoryRecord,
  b: DraftCategoryRecord,
): string[] {
  return CATEGORY_FIELDS.filter((field) => a[field] !== b[field]);
}

// Match by id: working entries keep their order, canonical entries missing
// from working are appended as deleted so removals stay visible in the
// review pane.
export function diffDraftWindows(
  working: DraftWindowsState,
  canonical: DraftWindowsState,
): DiffWindowsState {
  const canonicalWindowsById = new Map(
    canonical.windows.map((w) => [w.id, w]),
  );
  const workingWindowIds = new Set(working.windows.map((w) => w.id));

  const windows: DiffWindow[] = working.windows.map((w) => {
    const base = canonicalWindowsById.get(w.id);
    if (!base) return { ...w, status: "added", changedFields: [] };
    const changedFields = windowFieldsThatChanged(w, base);
    return {
      ...w,
      status: changedFields.length > 0 ? "modified" : "unchanged",
      changedFields,
    };
  });

  for (const w of canonical.windows) {
    if (!workingWindowIds.has(w.id)) {
      windows.push({ ...w, status: "deleted", changedFields: [] });
    }
  }

  const canonicalCategoriesById = new Map(
    canonical.categories.map((c) => [c.id, c]),
  );
  const workingCategoryIds = new Set(working.categories.map((c) => c.id));

  const categories: DiffCategoryRecord[] = working.categories.map((c) => {
    const base = canonicalCategoriesById.get(c.id);
    if (!base) return { ...c, status: "added", changedFields: [] };
    const changedFields = categoryFieldsThatChanged(c, base);
    return {
      ...c,
      status: changedFields.length > 0 ? "modified" : "unchanged",
      changedFields,
    };
  });

  for (const c of canonical.categories) {
    if (!workingCategoryIds.has(c.id)) {
      categories.push({ ...c, status: "deleted", changedFields: [] });
    }
  }

  return { windows, categories };
}

export interface WindowCategoryGroup {
  category: DiffCategoryRecord;
  // Sorted from the user's week start, then by startTime.
  rows: DiffWindow[];
}

// Groups the diff by category in the diffed categories' own order (working
// order, canonical-deleted appended). Categories with no windows and no
// changes of their own are omitted — the tab reviews changes, not the whole
// taxonomy.
export function groupWindowsByCategory(
  diffed: DiffWindowsState,
  weekStartDay: WeekDayIntegers = 1,
): WindowCategoryGroup[] {
  const dayRank = new Map<number, number>(
    orderedWeekDays(weekStartDay).map((d, i) => [d, i]),
  );

  return diffed.categories
    .map((category) => {
      const rows = diffed.windows
        .filter((w) => w.categoryId === category.id)
        .sort(
          (a, b) =>
            (dayRank.get(a.day) ?? 7) - (dayRank.get(b.day) ?? 7) ||
            a.startTime.localeCompare(b.startTime),
        );
      return { category, rows };
    })
    .filter(
      (group) =>
        group.rows.length > 0 || group.category.status !== "unchanged",
    );
}

export function countWindowChanges(diffed: DiffWindowsState): number {
  return (
    diffed.windows.filter((w) => w.status !== "unchanged").length +
    diffed.categories.filter((c) => c.status !== "unchanged").length
  );
}
