import type { DiffStatus } from "./diffDraftTree";
import {
  dependencyKey,
  type DraftDependency,
  type DraftPrecedenceState,
  type DraftQueue,
} from "./draftPrecedence";

export interface DiffQueueMember {
  plannerId: string;
  status: DiffStatus;
}

export interface DiffQueue extends DraftQueue {
  status: DiffStatus;
  // "title" | "category" | "members" — populated only when modified.
  changedFields: string[];
  members: DiffQueueMember[];
}

export interface DiffDependency extends DraftDependency {
  status: DiffStatus;
}

export interface DiffPrecedenceState {
  queues: DiffQueue[];
  dependencies: DiffDependency[];
}

function diffMembers(
  working: readonly string[],
  canonical: readonly string[],
): DiffQueueMember[] {
  const canonicalSet = new Set(canonical);
  const workingSet = new Set(working);
  const rows: DiffQueueMember[] = working.map((plannerId) => ({
    plannerId,
    status: canonicalSet.has(plannerId) ? "unchanged" : "added",
  }));
  for (const plannerId of canonical) {
    if (!workingSet.has(plannerId)) {
      rows.push({ plannerId, status: "deleted" });
    }
  }
  return rows;
}

// Match by id: working queues keep their order, canonical queues missing from
// working are appended as deleted so removals stay visible. Dependencies
// match by endpoint pair.
export function diffDraftPrecedence(
  working: DraftPrecedenceState,
  canonical: DraftPrecedenceState,
): DiffPrecedenceState {
  const canonicalById = new Map(canonical.queues.map((q) => [q.id, q]));
  const workingIds = new Set(working.queues.map((q) => q.id));

  const queues: DiffQueue[] = working.queues.map((q) => {
    const base = canonicalById.get(q.id);
    if (!base) {
      return {
        ...q,
        status: "added",
        changedFields: [],
        members: q.memberPlannerIds.map((plannerId) => ({
          plannerId,
          status: "added",
        })),
      };
    }
    const changedFields: string[] = [];
    if (q.title !== base.title) changedFields.push("title");
    if (q.categoryId !== base.categoryId) changedFields.push("category");
    if ((q.color ?? null) !== (base.color ?? null)) changedFields.push("color");
    const orderChanged =
      q.memberPlannerIds.length !== base.memberPlannerIds.length ||
      q.memberPlannerIds.some((id, i) => id !== base.memberPlannerIds[i]);
    if (orderChanged) changedFields.push("members");
    return {
      ...q,
      status: changedFields.length > 0 ? "modified" : "unchanged",
      changedFields,
      members: diffMembers(q.memberPlannerIds, base.memberPlannerIds),
    };
  });

  for (const q of canonical.queues) {
    if (!workingIds.has(q.id)) {
      queues.push({
        ...q,
        status: "deleted",
        changedFields: [],
        members: q.memberPlannerIds.map((plannerId) => ({
          plannerId,
          status: "deleted",
        })),
      });
    }
  }

  const canonicalKeys = new Set(canonical.dependencies.map(dependencyKey));
  const workingKeys = new Set(working.dependencies.map(dependencyKey));
  const dependencies: DiffDependency[] = working.dependencies.map((d) => ({
    ...d,
    status: canonicalKeys.has(dependencyKey(d)) ? "unchanged" : "added",
  }));
  for (const d of canonical.dependencies) {
    if (!workingKeys.has(dependencyKey(d))) {
      dependencies.push({ ...d, status: "deleted" });
    }
  }

  return { queues, dependencies };
}

export function countPrecedenceChanges(diffed: DiffPrecedenceState): number {
  return (
    diffed.queues.filter((q) => q.status !== "unchanged").length +
    diffed.dependencies.filter((d) => d.status !== "unchanged").length
  );
}
