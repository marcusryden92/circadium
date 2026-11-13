import type { Category, CategoryTimeWindow } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type {
  DraftCategoryRecord,
  DraftTimeWindow,
  DraftWindowsState,
} from "./draftWindows";

interface ApplyWindowsArgs {
  // The provider's live category array at Save time.
  currentCategories: Category[];
  // Snapshot taken when the modal opened.
  canonical: DraftWindowsState;
  working: DraftWindowsState;
  userId: string;
  now: string;
}

function windowFieldsEqual(
  row: CategoryTimeWindow,
  draft: DraftTimeWindow,
): boolean {
  return (
    row.categoryId === draft.categoryId &&
    row.day === draft.day &&
    row.startTime === draft.startTime &&
    row.endTime === draft.endTime
  );
}

const RECORD_FIELDS = [
  "name",
  "color",
  "parentId",
  "locationId",
  "useTimeWindows",
  "isStrict",
  "confineToOwnWindows",
] as const;

type RecordField = (typeof RECORD_FIELDS)[number];

// Fields the assistant actually changed this session (canonical vs working).
// Per-field, so an edit made elsewhere while the modal was open survives on
// any field the assistant left alone.
function assistantDelta(
  canonical: DraftCategoryRecord,
  working: DraftCategoryRecord,
): RecordField[] {
  return RECORD_FIELDS.filter((f) => canonical[f] !== working[f]);
}

// Materializes the assistant's working categories + windows state against the
// live category array: deletes (with current-tree cascade, matching the DB's
// parentId cascade), field updates, window redistribution, and new Category
// rows whose route-minted draft ids become the DB ids.
//
// CategoryTimeWindow rows carry no timestamps, so the sync diff is purely
// value-based — object identity there is render-churn hygiene. The category
// row itself IS compared with updatedAt included (timeSlots stripped), so
// field/flag changes restamp updatedAt and window-only changes must not touch
// the category's own fields. Untouched categories return by object identity.
export function applyDraftWindows({
  currentCategories,
  canonical,
  working,
  userId,
  now,
}: ApplyWindowsArgs): Category[] {
  const canonicalWindowIds = new Set(canonical.windows.map((w) => w.id));
  const workingWindowsById = new Map(working.windows.map((w) => [w.id, w]));
  const canonicalRecordsById = new Map(
    canonical.categories.map((c) => [c.id, c]),
  );
  const workingRecordsById = new Map(
    working.categories.map((c) => [c.id, c]),
  );
  const currentById = new Map(currentCategories.map((c) => [c.id, c]));

  // Deletions the assistant made, cascaded over the CURRENT tree so a
  // concurrent child created elsewhere under a deleted parent goes too —
  // the DB's parentId cascade will delete it server-side regardless, and
  // keeping it locally would leave a ghost row.
  const deletedRootIds = canonical.categories
    .map((c) => c.id)
    .filter((id) => !workingRecordsById.has(id) && currentById.has(id));
  const removedIds = new Set<string>();
  if (deletedRootIds.length > 0) {
    const childrenByParent = new Map<string, string[]>();
    for (const c of currentCategories) {
      if (!c.parentId) continue;
      const list = childrenByParent.get(c.parentId);
      if (list) list.push(c.id);
      else childrenByParent.set(c.parentId, [c.id]);
    }
    const queue = [...deletedRootIds];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (removedIds.has(id)) continue;
      removedIds.add(id);
      for (const child of childrenByParent.get(id) ?? []) queue.push(child);
    }
  }

  // New categories: in working, unknown to both the live array and the
  // canonical snapshot (a canonical id missing from current was deleted
  // concurrently elsewhere — recreating it would resurrect the row).
  const createdRecords = working.categories.filter(
    (c) => !currentById.has(c.id) && !canonicalRecordsById.has(c.id),
  );
  const survivingCategoryIds = new Set<string>();
  for (const c of currentCategories) {
    if (!removedIds.has(c.id)) survivingCategoryIds.add(c.id);
  }
  for (const c of createdRecords) survivingCategoryIds.add(c.id);

  // Distribute window rows into their target categories — an update can
  // reparent a window, so its destination may differ from where it lives now.
  // Windows whose target category doesn't survive are dropped.
  const rowsByCategory = new Map<string, CategoryTimeWindow[]>();
  const place = (categoryId: string, row: CategoryTimeWindow) => {
    if (!survivingCategoryIds.has(categoryId)) return;
    const list = rowsByCategory.get(categoryId);
    if (list) list.push(row);
    else rowsByCategory.set(categoryId, [row]);
  };

  const currentWindowIds = new Set<string>();
  for (const category of currentCategories) {
    for (const row of category.timeSlots) {
      currentWindowIds.add(row.id);
      const draft = workingWindowsById.get(row.id);
      if (!draft) {
        // Deleted by the assistant if it saw the row; otherwise a concurrent
        // row created elsewhere while the modal was open — preserved.
        if (!canonicalWindowIds.has(row.id)) place(row.categoryId ?? "", row);
        continue;
      }
      if (windowFieldsEqual(row, draft)) {
        place(draft.categoryId, row);
      } else {
        // A day/startTime change re-anchors the rule; exception keys point at
        // the old occurrences and would resurrect or misplace them.
        const reanchored =
          draft.day !== row.day || draft.startTime !== row.startTime;
        place(draft.categoryId, {
          ...row,
          categoryId: draft.categoryId,
          day: draft.day as WeekDayIntegers,
          startTime: draft.startTime,
          endTime: draft.endTime,
          recurrenceExceptions: reanchored ? null : row.recurrenceExceptions,
        });
      }
    }
  }

  for (const draft of working.windows) {
    if (currentWindowIds.has(draft.id)) continue;
    place(draft.categoryId, {
      id: draft.id,
      categoryId: draft.categoryId,
      day: draft.day as WeekDayIntegers,
      startTime: draft.startTime,
      endTime: draft.endTime,
      recurrenceExceptions: null,
      userId,
    });
  }

  const next: Category[] = [];
  for (const category of currentCategories) {
    if (removedIds.has(category.id)) continue;

    const nextSlots = rowsByCategory.get(category.id) ?? [];
    const slotsChanged =
      nextSlots.length !== category.timeSlots.length ||
      nextSlots.some((row, i) => row !== category.timeSlots[i]);

    const canonicalRecord = canonicalRecordsById.get(category.id);
    const workingRecord = workingRecordsById.get(category.id);
    const changedFields =
      canonicalRecord && workingRecord
        ? assistantDelta(canonicalRecord, workingRecord).filter(
            (f) => category[f] !== workingRecord[f],
          )
        : [];

    if (changedFields.length === 0 && !slotsChanged) {
      next.push(category);
      continue;
    }

    const patched: Category = { ...category, timeSlots: nextSlots };
    if (changedFields.length > 0) {
      for (const field of changedFields) {
        // Same-named fields carry compatible types between Category and
        // DraftCategoryRecord; TS can't see that through the union of keys.
        (patched as Record<RecordField, unknown>)[field] =
          (workingRecord as DraftCategoryRecord)[field];
      }
      patched.updatedAt = now;
    }
    next.push(patched);
  }

  // Append new rows in working order. sortOrder lands after the existing
  // siblings under the same parent (created siblings count too, in order).
  const maxSortOrderByParent = new Map<string | null, number>();
  for (const c of next) {
    const key = c.parentId ?? null;
    const prev = maxSortOrderByParent.get(key);
    if (prev === undefined || c.sortOrder > prev) {
      maxSortOrderByParent.set(key, c.sortOrder);
    }
  }
  for (const record of createdRecords) {
    const parentKey = record.parentId ?? null;
    const sortOrder = (maxSortOrderByParent.get(parentKey) ?? -1) + 1;
    maxSortOrderByParent.set(parentKey, sortOrder);
    next.push({
      id: record.id,
      name: record.name,
      icon: null,
      color: record.color,
      sortOrder,
      useTimeWindows: record.useTimeWindows,
      isStrict: record.isStrict,
      confineToOwnWindows: record.confineToOwnWindows,
      locationId: record.locationId,
      parentId: record.parentId,
      userId,
      timeSlots: rowsByCategory.get(record.id) ?? [],
      createdAt: now,
      updatedAt: now,
    });
  }

  return next;
}
