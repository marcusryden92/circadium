import { Planner, SimpleEvent, Category } from "@/types/prisma";
import { Scheduler } from "../../core/Scheduler";
import { PerTemplateMask } from "../../models/TemplateModels";
import { SchedulingFailure } from "../../models/SchedulingModels";
import { Slot } from "../../models/TimeSlot";
import { SCHEDULING_CONFIG, SchedulingFailureReason } from "../../constants";
import { expandSlots } from "./expandSlots";
import { TravelPassRecorder } from "../TravelManager/TravelPassRecorder";
import {
  largestCompatibleSlotForLargestTask,
  maxEffectiveCapacityFor,
  placementBlockMinutes,
} from "./capacityCheck";
import {
  SplitRelaxation,
  createSplitPlacementState,
} from "./scheduleSplitTask";
import {
  GoalCapContext,
  GoalCapRelaxation,
  createGoalCapState,
  goalDayCapMinutes,
  seedGoalDayLedger,
  buildGoalCapContext,
} from "./goalDayCap";
import { getRootParentId } from "../../../goalPageHandlers";
import type { PrecedenceEdge } from "@/utils/precedence/types";
import {
  ChainOutcome,
  SequenceBreak,
  seedChainOutcomes,
  gateCandidate,
  recordSequenceBreaks,
} from "./precedenceGate";
import { placeLeaf } from "./placeLeaf";
import type { LeafGraph, LeafNode } from "./buildLeafGraph";

// Flat-order scheduler over the leaf precedence graph (buildLeafGraph). Leaves
// are placed one at a time, ordered by inherited score then clustering index,
// gated by their chain predecessors (goal-internal + detour splices) and the
// root-level cross gate (queue/dependency). A detour target's leaves are pulled
// into the pool via the host's spliced sequence and metered against both the
// host and the target caps (composed pointwise-min).

function laterDate(a: Date | undefined, b: Date | undefined): Date | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function scheduleTasksAndGoals(
  scheduler: Scheduler,
  allPlanners: Planner[],
  candidates: Planner[],
  memoizedEventIds: Set<string>,
  perTemplateMasks: PerTemplateMask[],
  plannerLocationMap: Map<string, string | null>,
  categories: Category[],
  leafGraph: LeafGraph,
  travelPassRecorder?: TravelPassRecorder,
): {
  success: boolean;
  newEvents: SimpleEvent[];
  failures: SchedulingFailure[];
  splitRelaxations: SplitRelaxation[];
  goalCapRelaxations: GoalCapRelaxation[];
  sequenceBreaks: SequenceBreak[];
} {
  const { slotManager, travelManager, context } = scheduler;
  const events: SimpleEvent[] = [];
  const failures: SchedulingFailure[] = [];
  const scheduledTaskIds = new Set<string>();
  const permFailedIds = new Set<string>();
  const splitState = createSplitPlacementState();
  const goalCapState = createGoalCapState();

  const plannerCategoryMap =
    context.plannerCategoryMap ?? new Map<string, string | null>();
  const categoryEligibilityMap =
    context.categoryEligibilityMap ?? new Map<string, Set<string>>();
  const capacityCache = new Map<string, number>();
  const schedulableCategoryIds = new Set(categories.map((c) => c.id));
  const plannersById = new Map(allPlanners.map((p) => [p.id, p]));

  // Latest end among currently-materialized placeable slots. Drives the habit
  // "missed window" rule: an occurrence bounded to a window the horizon already
  // covers, that still didn't place, has lost the contest — not slot scarcity.
  const maxPlaceableEndOf = (slots: Slot[]): number => {
    let max = 0;
    for (const s of slots) {
      if (s.type !== "available" && s.type !== "category") continue;
      const endMs = s.end.getTime();
      if (endMs > max) max = endMs;
    }
    return max;
  };
  let maxPlaceableEndMs = maxPlaceableEndOf(slotManager.slots);

  const {
    nodes,
    chainPreds,
    crossGateRoots,
    completionRoots,
    rootLeafCount,
    leafEffScore,
  } = leafGraph;

  const isResolved = (id: string): boolean =>
    scheduledTaskIds.has(id) || permFailedIds.has(id);
  // Chain end published to successors: the real end for a placed leaf, or the
  // pass-through afterTime for a permanently-failed (TOO_LARGE) one so the
  // chain keeps flowing from the last real success.
  const leafChainEnd = new Map<string, Date>();
  // Max placed end per leaf across ALL attempts — a split task's early chunks
  // land in earlier passes than the pass that finally reports scheduled, and
  // successors must bound to the LAST chunk, not the resolving pass's.
  const leafPlacedEnd = new Map<string, Date>();

  const rootResolvedCount = new Map<string, number>();
  const rootPlacedAny = new Map<string, boolean>();
  const rootLastEnd = new Map<string, Date>();
  for (const id of rootLeafCount.keys()) rootResolvedCount.set(id, 0);

  const goalCapByRoot = new Map<string, GoalCapContext | undefined>();
  const goalCapFor = (rootId: string): GoalCapContext | undefined => {
    const cached = goalCapByRoot.get(rootId);
    if (cached !== undefined || goalCapByRoot.has(rootId)) return cached;
    const root = plannersById.get(rootId);
    let ctx: GoalCapContext | undefined;
    // Root rows only: node-level gate anchors share this tracking map, and a
    // stale maxMinutesPerDay on a nested goal row must stay inert.
    if (root && root.parentId == null) {
      const dayCap = goalDayCapMinutes(root);
      if (dayCap !== null) {
        seedGoalDayLedger(root, allPlanners, context.scheduledEvents, goalCapState);
        ctx = buildGoalCapContext(root, dayCap, goalCapState);
      }
    }
    goalCapByRoot.set(rootId, ctx);
    return ctx;
  };

  const predecessorMap =
    context.predecessorMap ?? new Map<string, PrecedenceEdge[]>();
  const allEdges: PrecedenceEdge[] = [];
  for (const list of predecessorMap.values()) allEdges.push(...list);
  const chainOutcome: Map<string, ChainOutcome> = seedChainOutcomes(
    allEdges,
    candidates,
    allPlanners,
    context.scheduledEvents,
  );
  // Detour targets and node-level gate anchors are excluded from candidates
  // but their leaves ARE in the pool, so the loop resolves their outcome as
  // they place. seedChainOutcomes (which only sees non-candidates) would
  // otherwise seed a ready target/anchor with no past events as failed/failed
  // — making a dependency/queue successor break immediately instead of
  // waiting. Drop those premature seeds; a source with zero schedulable
  // leaves (fully completed) is not in rootLeafCount and keeps its
  // legitimate seed.
  const candidateIdSet = new Set(candidates.map((c) => c.id));
  for (const rootId of rootLeafCount.keys()) {
    if (!candidateIdSet.has(rootId)) chainOutcome.delete(rootId);
  }
  const sequenceBreaks: SequenceBreak[] = [];
  const seenBreakKeys = new Set<string>();

  // Candidates with no schedulable leaves (all completed/memoized) resolve
  // through their OWN cross gate, publishing the gate bound as their end —
  // parity with the old scheduleGoal returning lastPlacedEnd = goalAfterTime.
  // Resolving them eagerly with no bound would let a queue successor jump the
  // chain past a fully-handled middle member. Fixpoint: a chain of zero-leaf
  // candidates resolves in one call once upstream outcomes exist.
  const pendingZeroLeaf = candidates.filter(
    (c) => (rootLeafCount.get(c.id) ?? 0) === 0,
  );
  const resolveZeroLeafCandidates = () => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = pendingZeroLeaf.length - 1; i >= 0; i--) {
        const candidate = pendingZeroLeaf[i];
        const gate = gateCandidate(candidate.id, predecessorMap, chainOutcome);
        if (gate.blocked) continue;
        recordSequenceBreaks(sequenceBreaks, seenBreakKeys, gate.failedEdges);
        chainOutcome.set(candidate.id, {
          status: "placed",
          lastEnd: gate.afterTime,
        });
        pendingZeroLeaf.splice(i, 1);
        progressed = true;
      }
    }
  };
  resolveZeroLeafCandidates();

  const resolveRoots = (leafId: string, placed: boolean) => {
    for (const rootId of completionRoots.get(leafId) ?? []) {
      const resolved = (rootResolvedCount.get(rootId) ?? 0) + 1;
      rootResolvedCount.set(rootId, resolved);
      if (placed) rootPlacedAny.set(rootId, true);
      if (resolved === rootLeafCount.get(rootId)) {
        chainOutcome.set(
          rootId,
          rootPlacedAny.get(rootId)
            ? { status: "placed", lastEnd: rootLastEnd.get(rootId) }
            : { status: "failed", failCause: "failed" },
        );
      }
    }
  };

  const chainBlocked = (leafId: string): boolean => {
    for (const predId of chainPreds.get(leafId) ?? []) {
      if (!isResolved(predId)) return true;
    }
    return false;
  };
  const crossBlocked = (leafId: string): boolean => {
    for (const rootId of crossGateRoots.get(leafId) ?? []) {
      if (gateCandidate(rootId, predecessorMap, chainOutcome).blocked) {
        return true;
      }
    }
    return false;
  };

  // Counts leaves that passed both gates and actually attempted placement in
  // the current pass — a pass with zero attempts is a precedence deadlock,
  // not slot scarcity, so expansion cannot help it.
  let attemptedThisPass = 0;

  // Attempt one leaf. Returns whether it resolved (placed or permanently
  // failed) and should leave the pool; a skip (blocked / NO_SLOTS / partial
  // split) keeps it for retry.
  const attemptLeaf = (node: LeafNode, allowDayCapRelaxation: boolean): boolean => {
    const leafId = node.leaf.id;
    if (chainBlocked(leafId)) return false;

    let afterTime: Date | undefined;
    for (const predId of chainPreds.get(leafId) ?? []) {
      afterTime = laterDate(afterTime, leafChainEnd.get(predId));
    }
    for (const rootId of crossGateRoots.get(leafId) ?? []) {
      const gate = gateCandidate(rootId, predecessorMap, chainOutcome);
      if (gate.blocked) return false;
      recordSequenceBreaks(sequenceBreaks, seenBreakKeys, gate.failedEdges);
      afterTime = laterDate(afterTime, gate.afterTime);
    }

    const caps: GoalCapContext[] = [];
    for (const rootId of completionRoots.get(leafId) ?? []) {
      const cap = goalCapFor(rootId);
      if (cap) caps.push(cap);
    }

    attemptedThisPass++;
    const result = placeLeaf({
      leaf: node.leaf,
      scheduler,
      perTemplateMasks,
      categories,
      plannerCategoryMap,
      categoryEligibilityMap,
      currentDate: context.currentDate,
      capacityCache,
      splitState,
      scheduledTaskIds,
      failures,
      afterTime,
      allowDayCapRelaxation,
      goalCaps: caps,
    });

    events.push(...result.events);

    // Accumulate the max placed end across every attempt — partial split
    // passes place real chunks that successors must respect.
    if (result.lastEnd) {
      const prior = leafPlacedEnd.get(leafId);
      if (!prior || result.lastEnd > prior) {
        leafPlacedEnd.set(leafId, result.lastEnd);
      }
      for (const rootId of completionRoots.get(leafId) ?? []) {
        const prev = rootLastEnd.get(rootId);
        if (!prev || result.lastEnd > prev) {
          rootLastEnd.set(rootId, result.lastEnd);
        }
      }
    }

    if (result.scheduled) {
      const end = leafPlacedEnd.get(leafId);
      if (end) leafChainEnd.set(leafId, end);
      resolveRoots(leafId, true);
      return true;
    }
    if (result.permanentFailure) {
      // Pass-through: the chain flows from the last real success — or from
      // the leaf's own partial chunks when it placed some before failing.
      const end = laterDate(afterTime, leafPlacedEnd.get(leafId));
      if (end) leafChainEnd.set(leafId, end);
      permFailedIds.add(leafId);
      resolveRoots(leafId, false);
      return true;
    }
    // Habit occurrence "missed" window: a placement-window-bounded leaf whose
    // window the horizon already fully covers, that still didn't place, has
    // lost the contest for every slot in its window (not slot scarcity — no
    // expansion can add room past its window end). Drop it silently; the
    // NO_SLOTS placeLeaf pushed for it is filtered downstream (a miss is not an
    // error, it is the absence of a completion for that period in the stats).
    const windowEnd =
      context.plannerConstraintsMap?.get(leafId)?.placementWindowEnd;
    if (windowEnd && maxPlaceableEndMs >= windowEnd.getTime()) {
      permFailedIds.add(leafId);
      resolveRoots(leafId, false);
      return true;
    }
    return false;
  };

  // Category-constrained leaves pick slots first (they have strictly fewer
  // options), then inherited score, then the clustering index — the same
  // two-tier order sortByPriorityAndConstraints gives the candidate walk.
  const leafConstrained = (leaf: Planner): boolean =>
    (plannerCategoryMap.get(leaf.id) ?? leaf.categoryId) !== null;
  let remaining: LeafNode[] = [...nodes].sort((a, b) => {
    const ca = leafConstrained(a.leaf) ? 1 : 0;
    const cb = leafConstrained(b.leaf) ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const sa = leafEffScore.get(a.leaf.id) ?? 0;
    const sb = leafEffScore.get(b.leaf.id) ?? 0;
    if (sb !== sa) return sb - sa;
    return a.scheduleIndex - b.scheduleIndex;
  });

  let expansionsDone = 0;

  while (remaining.length > 0 && expansionsDone < SCHEDULING_CONFIG.MAX_WEEKS_TO_SEARCH) {
    resolveZeroLeafCandidates();
    context.placementCutoffDate = computePlacementCutoff(slotManager.slots);
    maxPlaceableEndMs = maxPlaceableEndOf(slotManager.slots);

    let availableCount = 0;
    for (const s of slotManager.slots) {
      if (s.type === "available") availableCount++;
    }
    let biggestRemaining = 0;
    let biggestLeaf: Planner | null = null;
    for (const node of remaining) {
      const leafId = node.leaf.id;
      if (chainBlocked(leafId) || crossBlocked(leafId)) continue;
      const duration = placementBlockMinutes(node.leaf);
      const capacityCeiling = maxEffectiveCapacityFor(
        node.leaf,
        perTemplateMasks,
        categories,
        plannerCategoryMap,
        context.currentDate,
        categoryEligibilityMap,
        capacityCache,
      );
      if (duration > capacityCeiling) continue;
      if (biggestLeaf === null || duration > biggestRemaining) {
        biggestRemaining = duration;
        biggestLeaf = node.leaf;
      }
    }
    const biggestFit = largestCompatibleSlotForLargestTask(
      biggestLeaf,
      slotManager.slots,
      plannerCategoryMap,
      categoryEligibilityMap,
      context.placementCutoffDate,
      schedulableCategoryIds,
    );

    if (
      availableCount < SCHEDULING_CONFIG.LOW_SLOT_WATERMARK ||
      biggestFit < biggestRemaining
    ) {
      expansionsDone++;
      expandSlots(
        context,
        perTemplateMasks,
        plannerLocationMap,
        categories,
        slotManager,
        travelManager,
        "watermark",
        travelPassRecorder,
      );
      continue;
    }

    attemptedThisPass = 0;
    const resolvedIds = new Set<string>();
    for (const node of remaining) {
      if (attemptLeaf(node, false)) resolvedIds.add(node.leaf.id);
    }

    if (resolvedIds.size > 0) {
      remaining = remaining.filter((n) => !resolvedIds.has(n.leaf.id));
      if (remaining.length > 0) continue;
    }

    if (remaining.length > 0) {
      // A pass where NOTHING even attempted placement is a precedence
      // deadlock (authoring validation blocks these, but stale data must not
      // burn the whole expansion budget): force-fail the missing gate
      // outcomes so successors proceed with loud breaks instead.
      if (attemptedThisPass === 0) {
        let stamped = false;
        for (const node of remaining) {
          for (const rootId of crossGateRoots.get(node.leaf.id) ?? []) {
            for (const edge of predecessorMap.get(rootId) ?? []) {
              if (!chainOutcome.has(edge.fromId)) {
                chainOutcome.set(edge.fromId, {
                  status: "failed",
                  failCause: "failed",
                });
                stamped = true;
              }
            }
          }
        }
        if (stamped) continue;
      }
      expansionsDone++;
      expandSlots(
        context,
        perTemplateMasks,
        plannerLocationMap,
        categories,
        slotManager,
        travelManager,
        "fallback",
        travelPassRecorder,
      );
    }
  }

  if (remaining.length > 0) {
    for (const edge of allEdges) {
      if (!chainOutcome.has(edge.fromId)) {
        chainOutcome.set(edge.fromId, { status: "failed", failCause: "horizon" });
      }
    }
    resolveZeroLeafCandidates();
  }

  if (remaining.length > 0) {
    context.placementCutoffDate = computePlacementCutoff(slotManager.slots);
    maxPlaceableEndMs = maxPlaceableEndOf(slotManager.slots);
    const resolvedIds = new Set<string>();
    for (const node of remaining) {
      if (attemptLeaf(node, true)) resolvedIds.add(node.leaf.id);
    }
    if (resolvedIds.size > 0) {
      remaining = remaining.filter((n) => !resolvedIds.has(n.leaf.id));
    }
  }
  resolveZeroLeafCandidates();

  // One budget-exhaustion failure per structural root, not per leaf — message
  // identity (TASK_UNSCHEDULABLE id = plannerId) and console rows match the
  // old per-candidate emission. A spliced target leaf reports on the target.
  const failedRootIds = new Set<string>();
  for (const node of remaining) {
    const rootId = getRootParentId(allPlanners, node.leaf.id) ?? node.leaf.id;
    if (failedRootIds.has(rootId)) continue;
    failedRootIds.add(rootId);
    const root = plannersById.get(rootId) ?? node.leaf;
    failures.push({
      taskId: root.id,
      taskTitle: root.title,
      reason: SchedulingFailureReason.NO_SLOTS,
      details: `Horizon expansion budget exhausted (${expansionsDone} expansions) before a slot was found`,
      context: { expansionsDone },
    });
  }

  const finalFailures = failures.filter((f) => !scheduledTaskIds.has(f.taskId));

  return {
    success: finalFailures.length === 0 && remaining.length === 0,
    newEvents: events,
    failures: finalFailures,
    splitRelaxations: splitState.relaxations,
    goalCapRelaxations: goalCapState.relaxations,
    sequenceBreaks,
  };
}

// Tail-buffer cutoff: dynamic placement is suppressed at and after this date.
// Anchor = max end among placeable slots (Available + Category) - buffer days.
function computePlacementCutoff(slots: Slot[]): Date | null {
  let lastPlaceableEndMs = 0;
  for (const s of slots) {
    if (s.type !== "available" && s.type !== "category") continue;
    const endMs = s.end.getTime();
    if (endMs > lastPlaceableEndMs) lastPlaceableEndMs = endMs;
  }
  if (lastPlaceableEndMs === 0) return null;
  return new Date(
    lastPlaceableEndMs -
      SCHEDULING_CONFIG.PLACEMENT_BUFFER_DAYS * 24 * 60 * 60 * 1000,
  );
}
