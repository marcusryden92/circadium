import type { Planner } from "@/types/prisma";
import { getTaskTreeIds } from "@/utils/goalPageHandlers";
import { defaultReadyForType } from "@/utils/plannerReadiness";
import { PRIORITY_DEFAULT } from "@/utils/plannerPriority";
import {
  DEFAULT_DRAFT_DURATION_MIN,
  type TriageType,
} from "@/app/(protected)/capture/_constants";

export type DumpItem = {
  // Minted at jot time and reused as the Planner row id — the idempotency key
  // for re-committing on a Back/forward loop.
  id: string;
  title: string;
  type: TriageType;
};

// A rough default duration by type. Goals hold subtasks and carry no duration
// of their own; tasks and plans get a placeholder the AI step refines.
export function durationForType(type: TriageType): number {
  return type === "goal" ? 0 : DEFAULT_DRAFT_DURATION_MIN;
}

// Builds a triaged Planner row from a brain-dump jot. Deadlines, start times,
// and real durations are deferred to the AI step; this only needs to produce a
// valid, schedulable row. isTriaged MUST be true so the assistant forest
// (triaged roots only) picks the item up. Readiness follows the create default
// (tasks/plans ready, goals not) so a jot is schedulable before AI refinement.
export function buildBrainDumpRow(
  item: DumpItem,
  userId: string,
  nowIso: string,
): Planner {
  return {
    id: item.id,
    title: item.title.trim(),
    parentId: null,
    plannerType: item.type,
    isReady: defaultReadyForType(item.type),
    isTriaged: true,
    duration: durationForType(item.type),
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
    priority: PRIORITY_DEFAULT,
    userId,
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

// A snapshot of what this flow last committed for a dump id — the guard that
// keeps a re-commit from clobbering edits the AI step made to the same row.
export type CommittedDump = { title: string; type: TriageType };

// Reconciles the planner array to the current brain-dump jots. New jots are
// appended; jots dropped since the last commit take their subtrees with them
// (the AI step may have attached children on a Back/forward loop). An existing
// row is patched ONLY for a field the user actually changed in the dump since
// the last commit — measured against `committed`, not the live row — so a
// title/type the AI refined survives a return trip through this step.
export function applyBrainDump(
  prev: Planner[],
  items: DumpItem[],
  committed: ReadonlyMap<string, CommittedDump>,
  userId: string,
  nowIso: string,
): Planner[] {
  const currentIds = new Set(items.map((it) => it.id));

  let next = prev;
  const removedIds = [...committed.keys()].filter((id) => !currentIds.has(id));
  if (removedIds.length > 0) {
    const toRemove = new Set(
      removedIds.flatMap((id) => getTaskTreeIds(prev, id)),
    );
    next = next.filter((p) => !toRemove.has(p.id));
  }

  const byId = new Map(next.map((p) => [p.id, p] as const));
  const appended: Planner[] = [];
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      appended.push(buildBrainDumpRow(item, userId, nowIso));
      continue;
    }
    const snapshot = committed.get(item.id);
    const title = item.title.trim();
    const titleChanged = !snapshot || snapshot.title !== title;
    const typeChanged = !snapshot || snapshot.type !== item.type;
    // Unchanged since the last commit: leave the row alone so any AI edit
    // (retype to goal, refined duration, attached children) is preserved.
    if (!titleChanged && !typeChanged) continue;
    byId.set(item.id, {
      ...existing,
      title: titleChanged ? title : existing.title,
      plannerType: typeChanged ? item.type : existing.plannerType,
      duration: typeChanged ? durationForType(item.type) : existing.duration,
      updatedAt: nowIso,
    });
  }

  return [...next.map((p) => byId.get(p.id) ?? p), ...appended];
}
