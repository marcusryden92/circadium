import { v4 as uuidv4 } from "uuid";
import type {
  Planner,
  PlannerDependency,
  Queue,
  QueueMember,
} from "@/types/prisma";
import {
  collectValidationEdges,
  detourComponentMap,
  contractPrecedenceEdges,
} from "@/utils/precedence/validationEdges";
import {
  findCycleInGraph,
  wouldCreateCycleAddingDependency,
} from "@/utils/precedence/findCycle";
import {
  isValidDependencyEndpoint,
  isValidPrecedenceEndpoint,
} from "@/utils/precedence/endpoints";
import { sortQueueMembers } from "@/utils/queue-handlers/mutateQueueMembers";
import { SORT_ORDER_STEP } from "@/utils/queue-handlers/sortOrderKeys";
import {
  dependencyKey,
  type DraftDependency,
  type DraftPrecedenceState,
} from "./draftPrecedence";

interface ApplyPrecedenceArgs {
  // The provider's live arrays at Save time.
  currentQueues: Queue[];
  currentDependencies: PlannerDependency[];
  // Snapshot taken when the modal opened.
  canonical: DraftPrecedenceState;
  working: DraftPrecedenceState;
  // Draft id -> permanent id minted by this save's forest apply, at every
  // level (new roots AND children re-minted on delete+recreate paths). Queue
  // members and dependency endpoints referencing drafts from the same
  // conversation resolve through it; an unmapped draft id names a draft that
  // was never saved and is dropped.
  nodeIdMap: ReadonlyMap<string, string>;
  // The planner array being saved — endpoint validity checks run against it.
  nextPlanner: Planner[];
  validCategoryIds: ReadonlySet<string>;
  userId: string;
  now: string;
}

export interface ApplyPrecedenceResult {
  queues: Queue[];
  dependencies: PlannerDependency[];
}

// Materializes the assistant's working precedence state against the live
// arrays with the same concurrent-safety rules the other domains follow:
// per-field queue deltas (edits made elsewhere survive on untouched fields),
// no resurrection (a queue or member removed concurrently elsewhere stays
// removed), concurrent additions preserved, and the user's concurrent
// placement winning a one-queue-per-item conflict. Untouched queues return
// by object identity so the sync diff stays empty for them. A final cycle
// defense drops assistant-added artifacts (never user rows) if concurrent
// edits composed a loop the op-time validation could not see.
export function applyDraftPrecedence({
  currentQueues,
  currentDependencies,
  canonical,
  working,
  nodeIdMap,
  nextPlanner,
  validCategoryIds,
  userId,
  now,
}: ApplyPrecedenceArgs): ApplyPrecedenceResult {
  const remap = (id: string): string => nodeIdMap.get(id) ?? id;

  // Mirrors the thunk's central pruning — invalid references never become
  // rows (central pruning would drop them a beat later anyway, but a
  // QueueMember row with a dangling planner FK must not reach the sync).
  // Members keep the root predicate; dependency endpoints accept any node
  // whose structural root is triaged and non-plan.
  const validMemberIds = new Set(
    nextPlanner.filter(isValidPrecedenceEndpoint).map((p) => p.id),
  );
  const nextPlannerById = new Map(nextPlanner.map((p) => [p.id, p]));
  const validDependencyEndpoint = (id: string): boolean =>
    isValidDependencyEndpoint(nextPlannerById, id);

  const canonicalById = new Map(canonical.queues.map((q) => [q.id, q]));
  const workingById = new Map(working.queues.map((q) => [q.id, q]));

  // Assistant deletions; a queue deleted concurrently elsewhere is simply
  // absent from current and the assistant's edits to it evaporate with it.
  const assistantDeletedQueueIds = new Set(
    canonical.queues.map((q) => q.id).filter((id) => !workingById.has(id)),
  );
  const keptCurrent = currentQueues.filter(
    (q) => !assistantDeletedQueueIds.has(q.id),
  );

  // Created queues keep their route-minted id (it becomes the DB id).
  const createdDrafts = working.queues.filter(
    (q) =>
      !canonicalById.has(q.id) && !currentQueues.some((c) => c.id === q.id),
  );

  // Whether the assistant changed a queue's member list (canonical vs
  // working; both reference saved ids on the canonical side, so only the
  // working side needs the remap).
  const membershipTouched = (queueId: string): boolean => {
    const c = canonicalById.get(queueId);
    const w = workingById.get(queueId);
    if (!c || !w) return false;
    const remapped = w.memberPlannerIds.map(remap);
    return (
      remapped.length !== c.memberPlannerIds.length ||
      remapped.some((id, i) => id !== c.memberPlannerIds[i])
    );
  };

  // Final memberships resolve in two passes: untouched queues keep their
  // current members; touched/created queues compute a target that respects
  // no-resurrection and the one-queue invariant. `claimedBy` tracks which
  // queue holds each planner as targets settle — the user's concurrent
  // placement (an untouched queue) always claims first.
  const claimedBy = new Map<string, string>();
  for (const queue of keptCurrent) {
    if (membershipTouched(queue.id)) continue;
    for (const m of queue.members) claimedBy.set(m.plannerId, queue.id);
  }

  const targetsByQueueId = new Map<string, string[]>();
  const addedByQueueId = new Map<string, Set<string>>();

  const resolveTarget = (
    queueId: string,
    workingMemberIds: string[],
    canonicalMemberIds: readonly string[],
    currentMemberIds: readonly string[],
  ) => {
    const canonicalSet = new Set(canonicalMemberIds);
    const currentSet = new Set(currentMemberIds);
    const workingSet = new Set(workingMemberIds);
    const assistantRemoved = new Set(
      canonicalMemberIds.filter((id) => !workingSet.has(id)),
    );
    const added = new Set<string>();
    const target: string[] = [];
    for (const id of workingMemberIds) {
      if (currentSet.has(id)) {
        // Retained (or the assistant reordered it) — still ours.
        target.push(id);
        continue;
      }
      if (canonicalSet.has(id)) {
        // In canonical and working but gone from current: removed
        // concurrently elsewhere — re-adding would resurrect it.
        continue;
      }
      // A genuine assistant addition.
      if (!validMemberIds.has(id)) continue;
      const owner = claimedBy.get(id);
      if (owner !== undefined && owner !== queueId) continue;
      target.push(id);
      added.add(id);
    }
    // Concurrent additions made elsewhere while the modal was open: not in
    // canonical (assistant never saw them), not in working — preserved, in
    // their current relative order.
    for (const id of currentMemberIds) {
      if (workingSet.has(id) || assistantRemoved.has(id)) continue;
      if (canonicalSet.has(id)) continue;
      target.push(id);
    }
    for (const id of target) claimedBy.set(id, queueId);
    targetsByQueueId.set(queueId, target);
    addedByQueueId.set(queueId, added);
  };

  for (const queue of keptCurrent) {
    if (!membershipTouched(queue.id)) continue;
    const w = workingById.get(queue.id)!;
    const c = canonicalById.get(queue.id)!;
    resolveTarget(
      queue.id,
      w.memberPlannerIds.map(remap),
      c.memberPlannerIds,
      sortQueueMembers(queue.members).map((m) => m.plannerId),
    );
  }
  for (const draft of createdDrafts) {
    resolveTarget(draft.id, draft.memberPlannerIds.map(remap), [], []);
  }

  // Assemble the next queue rows.
  let queuesChanged =
    assistantDeletedQueueIds.size > 0 || createdDrafts.length > 0;

  const buildMembers = (
    queueId: string,
    target: string[],
    currentMembers: QueueMember[],
  ): QueueMember[] => {
    const sorted = sortQueueMembers(currentMembers);
    if (
      sorted.length === target.length &&
      sorted.every((m, i) => m.plannerId === target[i])
    ) {
      return currentMembers;
    }
    const existingByPlannerId = new Map(
      currentMembers.map((m) => [m.plannerId, m]),
    );
    return target.map((plannerId, i) => {
      const existing = existingByPlannerId.get(plannerId);
      const sortOrder = (i + 1) * SORT_ORDER_STEP;
      if (existing) {
        return existing.sortOrder === sortOrder
          ? existing
          : { ...existing, sortOrder, updatedAt: now };
      }
      return {
        id: uuidv4(),
        sortOrder,
        queueId,
        plannerId,
        userId,
        createdAt: now,
        updatedAt: now,
      };
    });
  };

  const nextQueues: Queue[] = keptCurrent.map((queue) => {
    const canonicalRecord = canonicalById.get(queue.id);
    const workingRecord = workingById.get(queue.id);

    // Per-field deltas the assistant actually made; a field it left alone
    // keeps whatever the row holds now (concurrent edits win there).
    let title = queue.title;
    let categoryId = queue.categoryId ?? null;
    let color = queue.color ?? null;
    let recordChanged = false;
    if (canonicalRecord && workingRecord) {
      if (
        canonicalRecord.title !== workingRecord.title &&
        workingRecord.title !== queue.title
      ) {
        title = workingRecord.title;
        recordChanged = true;
      }
      if (
        canonicalRecord.categoryId !== workingRecord.categoryId &&
        workingRecord.categoryId !== (queue.categoryId ?? null) &&
        (workingRecord.categoryId === null ||
          validCategoryIds.has(workingRecord.categoryId))
      ) {
        categoryId = workingRecord.categoryId;
        recordChanged = true;
      }
      if (
        (canonicalRecord.color ?? null) !== (workingRecord.color ?? null) &&
        (workingRecord.color ?? null) !== (queue.color ?? null)
      ) {
        color = workingRecord.color ?? null;
        recordChanged = true;
      }
    }

    const target = targetsByQueueId.get(queue.id);
    const members = target
      ? buildMembers(queue.id, target, queue.members)
      : queue.members;

    if (!recordChanged && members === queue.members) return queue;
    queuesChanged = true;
    return {
      ...queue,
      title,
      categoryId,
      color,
      members,
      ...(recordChanged ? { updatedAt: now } : {}),
    };
  });

  let maxSortOrder = nextQueues.reduce(
    (max, q) => Math.max(max, q.sortOrder),
    0,
  );
  for (const draft of createdDrafts) {
    maxSortOrder += 1;
    nextQueues.push({
      id: draft.id,
      title: draft.title,
      sortOrder: maxSortOrder,
      color: draft.color ?? null,
      categoryId:
        draft.categoryId !== null && validCategoryIds.has(draft.categoryId)
          ? draft.categoryId
          : null,
      userId,
      createdAt: now,
      updatedAt: now,
      members: buildMembers(draft.id, targetsByQueueId.get(draft.id) ?? [], []),
    });
  }

  // Dependencies: removals by pair, then additions validated against the
  // merged final state.
  const workingDependencyKeys = new Set(
    working.dependencies.map((d) =>
      dependencyKey({
        predecessorId: remap(d.predecessorId),
        successorId: remap(d.successorId),
      }),
    ),
  );
  const assistantRemovedKeys = new Set(
    canonical.dependencies
      .map(dependencyKey)
      .filter((key) => !workingDependencyKeys.has(key)),
  );
  let nextDependencies = currentDependencies.filter(
    (d) => !assistantRemovedKeys.has(dependencyKey(d)),
  );
  let dependenciesChanged =
    nextDependencies.length !== currentDependencies.length;

  const canonicalKeys = new Set(canonical.dependencies.map(dependencyKey));
  const addedPairs: DraftDependency[] = [];
  const seenAddedKeys = new Set<string>();
  for (const d of working.dependencies) {
    const pair = {
      predecessorId: remap(d.predecessorId),
      successorId: remap(d.successorId),
    };
    const key = dependencyKey(pair);
    if (canonicalKeys.has(key) || seenAddedKeys.has(key)) continue;
    seenAddedKeys.add(key);
    addedPairs.push(pair);
  }

  // Concurrent-edit cycle defense: op-time validation covered the working
  // state, but a dependency or detour link created elsewhere while the modal
  // was open — or a propose_goals restructure that reordered leaves under
  // existing node-level edges — can compose a loop. Drop assistant artifacts
  // until acyclic: first assistant-ADDED queue members, then node-level
  // dependency edges involved in the cycle (the restructure that closed the
  // loop is the assistant's artifact; planner rows are never dropped). The
  // graph lives at leaf granularity with detour components contracted, so
  // victims resolve through the authored endpoint ids (fromNodeId/toNodeId)
  // the expansion preserves.
  const detourRepr = detourComponentMap(nextPlanner);
  const idsByRepr = new Map<string, string[]>();
  for (const [id, repr] of detourRepr) {
    const list = idsByRepr.get(repr);
    if (list) list.push(id);
    else idsByRepr.set(repr, [id]);
  }
  const realIdsFor = (contractedId: string): string[] =>
    idsByRepr.get(contractedId) ?? [contractedId];
  const isNodeLevelPair = (predecessorId: string, successorId: string) =>
    nextPlannerById.get(predecessorId)?.parentId != null ||
    nextPlannerById.get(successorId)?.parentId != null;
  let guard = 0;
  for (;;) {
    const cycle = findCycleInGraph(
      contractPrecedenceEdges(
        collectValidationEdges(nextQueues, nextDependencies, nextPlanner),
        detourRepr,
      ),
    );
    if (!cycle || guard++ > 100) break;
    let dropped = false;
    for (const edge of cycle) {
      if (edge.source !== "queue" || !edge.queueId) continue;
      const added = addedByQueueId.get(edge.queueId);
      const victim =
        [
          edge.toNodeId ?? edge.toId,
          edge.fromNodeId ?? edge.fromId,
        ]
          .flatMap((id) => realIdsFor(id))
          .find((id) => added?.has(id)) ?? null;
      if (!victim) continue;
      const index = nextQueues.findIndex((q) => q.id === edge.queueId);
      if (index === -1) continue;
      const queue = nextQueues[index];
      nextQueues[index] = {
        ...queue,
        members: queue.members.filter((m) => m.plannerId !== victim),
      };
      added?.delete(victim);
      queuesChanged = true;
      dropped = true;
      break;
    }
    if (!dropped) {
      for (const edge of cycle) {
        if (edge.source !== "dependency") continue;
        const predecessorId = edge.fromNodeId ?? edge.fromId;
        const successorId = edge.toNodeId ?? edge.toId;
        if (!isNodeLevelPair(predecessorId, successorId)) continue;
        const before = nextDependencies.length;
        nextDependencies = nextDependencies.filter(
          (d) =>
            d.predecessorId !== predecessorId ||
            d.successorId !== successorId,
        );
        if (nextDependencies.length !== before) {
          dependenciesChanged = true;
          dropped = true;
          break;
        }
      }
    }
    if (!dropped) break;
  }

  for (const pair of addedPairs) {
    if (
      !validDependencyEndpoint(pair.predecessorId) ||
      !validDependencyEndpoint(pair.successorId) ||
      pair.predecessorId === pair.successorId
    ) {
      continue;
    }
    if (
      nextDependencies.some((d) => dependencyKey(d) === dependencyKey(pair))
    ) {
      continue;
    }
    const cycle = wouldCreateCycleAddingDependency(
      nextQueues,
      nextDependencies,
      pair.predecessorId,
      pair.successorId,
      nextPlanner,
    );
    if (cycle) continue;
    nextDependencies = [
      ...nextDependencies,
      {
        id: uuidv4(),
        predecessorId: pair.predecessorId,
        successorId: pair.successorId,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    ];
    dependenciesChanged = true;
  }

  return {
    queues: queuesChanged ? nextQueues : currentQueues,
    dependencies: dependenciesChanged ? nextDependencies : currentDependencies,
  };
}
