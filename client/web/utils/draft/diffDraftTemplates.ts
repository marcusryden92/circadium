import type { DiffStatus } from "./diffDraftTree";
import { exceptionListsEqual, type DraftTemplate } from "./draftTemplates";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { orderedWeekDays } from "@/utils/calendarUtils";

export interface DiffTemplate extends DraftTemplate {
  status: DiffStatus;
  // Populated only when status === "modified".
  changedFields: string[];
}

const COMPARED_FIELDS = [
  "title",
  "startDay",
  "startTime",
  "duration",
  "color",
  "locationId",
] as const;

function fieldsThatChanged(a: DraftTemplate, b: DraftTemplate): string[] {
  const changed: string[] = COMPARED_FIELDS.filter(
    (field) => a[field] !== b[field],
  );
  if (!exceptionListsEqual(a.exceptions, b.exceptions)) {
    changed.push("exceptions");
  }
  return changed;
}

// Match by id: working rows keep their order, canonical rows missing from
// working are appended as deleted so removals stay visible in the review pane.
export function diffDraftTemplates(
  working: DraftTemplate[],
  canonical: DraftTemplate[],
): DiffTemplate[] {
  const canonicalById = new Map(canonical.map((t) => [t.id, t]));
  const workingIds = new Set(working.map((t) => t.id));

  const diffed: DiffTemplate[] = working.map((t) => {
    const base = canonicalById.get(t.id);
    if (!base) return { ...t, status: "added", changedFields: [] };
    const changedFields = fieldsThatChanged(t, base);
    return {
      ...t,
      status: changedFields.length > 0 ? "modified" : "unchanged",
      changedFields,
    };
  });

  for (const t of canonical) {
    if (!workingIds.has(t.id)) {
      diffed.push({ ...t, status: "deleted", changedFields: [] });
    }
  }

  return diffed;
}

export interface TemplateDayGroup {
  day: number;
  rows: DiffTemplate[];
}

// Ordered from the user's week start (matches the WeekStructureModal grid);
// days without rows are omitted. Rows within a day sort by startTime, ties by
// title.
export function groupTemplatesByDay(
  templates: DiffTemplate[],
  weekStartDay: WeekDayIntegers = 1,
): TemplateDayGroup[] {
  const dayOrder = orderedWeekDays(weekStartDay);
  return dayOrder
    .map((day) => ({
      day,
      rows: templates
        .filter((t) => t.startDay === day)
        .sort(
          (a, b) =>
            a.startTime.localeCompare(b.startTime) ||
            a.title.localeCompare(b.title),
        ),
    }))
    .filter((group) => group.rows.length > 0);
}

export function countTemplateChanges(templates: DiffTemplate[]): number {
  return templates.filter((t) => t.status !== "unchanged").length;
}
