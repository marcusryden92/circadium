import type { EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { serializeRecurrenceExceptions } from "@/utils/planRecurrence";
import { exceptionListsEqual, type DraftTemplate } from "./draftTemplates";

interface ApplyTemplatesArgs {
  // The provider's live template array at Save time.
  current: EventTemplate[];
  // Snapshot taken when the modal opened.
  canonical: DraftTemplate[];
  working: DraftTemplate[];
  userId: string;
  now: string;
}

function fieldsEqual(row: EventTemplate, draft: DraftTemplate): boolean {
  return (
    row.title === draft.title &&
    row.startDay === draft.startDay &&
    row.startTime === draft.startTime &&
    row.duration === draft.duration &&
    (row.color ?? null) === draft.color &&
    (row.locationId ?? null) === draft.locationId
  );
}

// Materializes the assistant's working template list against the live array.
// Untouched rows are returned by reference: the sync diff compares whole rows
// (timestamps included), so preserving updatedAt is what makes an unchanged
// template a no-op instead of a phantom update. Rows created elsewhere while
// the modal was open (in current, never seen in canonical) are preserved.
export function applyDraftTemplates({
  current,
  canonical,
  working,
  userId,
  now,
}: ApplyTemplatesArgs): EventTemplate[] {
  const canonicalIds = new Set(canonical.map((t) => t.id));
  const canonicalById = new Map(canonical.map((t) => [t.id, t]));
  const workingIds = new Set(working.map((t) => t.id));
  const currentById = new Map(current.map((t) => [t.id, t]));

  const next: EventTemplate[] = [];

  for (const row of current) {
    if (canonicalIds.has(row.id) && !workingIds.has(row.id)) continue;
    next.push(row);
  }

  const result = next.map((row) => {
    const draft = working.find((t) => t.id === row.id);
    if (!draft) return row;
    // Exceptions apply as a delta against the canonical snapshot, not a
    // wholesale write: a calendar-made exception created while the modal was
    // open survives an assistant edit that never touched exceptions.
    const exceptionsChanged = !exceptionListsEqual(
      draft.exceptions,
      canonicalById.get(row.id)?.exceptions ?? [],
    );
    if (fieldsEqual(row, draft) && !exceptionsChanged) return row;
    return {
      ...row,
      title: draft.title,
      startDay: draft.startDay as WeekDayIntegers,
      startTime: draft.startTime,
      duration: draft.duration,
      color: draft.color,
      locationId: draft.locationId,
      // A day/time change re-anchors the series; per-occurrence exceptions
      // are keyed to the old weekly pattern and would go stale (ghost moved
      // one-offs, resurrected deleted occurrences).
      recurrenceExceptions: exceptionsChanged
        ? serializeRecurrenceExceptions(draft.exceptions)
        : draft.startDay !== row.startDay || draft.startTime !== row.startTime
          ? null
          : row.recurrenceExceptions,
      updatedAt: now,
    };
  });

  for (const draft of working) {
    if (currentById.has(draft.id)) continue;
    result.push({
      id: draft.id,
      title: draft.title,
      startDay: draft.startDay as WeekDayIntegers,
      startTime: draft.startTime,
      duration: draft.duration,
      color: draft.color,
      locationId: draft.locationId,
      recurrenceExceptions: serializeRecurrenceExceptions(draft.exceptions),
      userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  return result;
}
