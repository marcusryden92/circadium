import { Planner, PlannerType } from "@/types/prisma";
import { addDays } from "date-fns";
import { OccurrenceCompletionInput } from "../../models/SchedulingModels";
import {
  occurrenceEventId,
  plannerHasFlexibleRecurrence,
} from "../../../planRecurrence";
import { enumerateRecurrencePeriods } from "@/utils/recurringPeriods";

// Expands each flexibly recurring root (task or goal with a recurrence rule —
// the retired habit type's scheduling model) into per-period occurrence
// CANDIDATES that flow through the same leaf pool / scoring / placement
// pipeline as one-off work. One occurrence per recurrence period (the shared
// enumerateRecurrencePeriods, so scheduling and stats agree on which period is
// which), bounded to its period via placementWindowEnd so a weekly item's
// occurrence stays inside its own week. Every clone carries deadline =
// periodEnd, which lets the shared urgency scorer treat it like a
// deadline-bearing task — urgency climbs as the window closes, so whether it
// places or is skipped ("missed") emerges from the same contest.
//
// A recurring TASK clones as a single childless root (`${taskId}|${periodKey}`)
// — exactly the old habit occurrence. A recurring GOAL clones its WHOLE
// subtree per period: every node re-minted as `${nodeId}|${periodKey}` with
// parent pointers remapped into the clone tree, so the ordinary goal machinery
// (leaf enumeration, chain edges, day caps, category/location inheritance)
// operates on each period without knowing about recurrence. Leaves whose
// period is logged in the completion log are stamped completed on the clone —
// row-level completion columns are always nulled first, because clones derive
// completion EXCLUSIVELY from the log (a pre-recurrence row-level completion
// must not complete every future period).
//
// Past periods (window fully elapsed) and completed periods are never emitted
// — the engine only schedules forward, and a missing completion for an elapsed
// period is a "missed" window derived by the stats layer, not the engine.
// Detour links are nulled on every clone: splicing an external target into a
// repeating period would multiply-schedule the target.

export interface OccurrenceMeta {
  /** Real planner row this clone was minted from. */
  sourceId: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface RecurrenceExpansion {
  /** Synthetic per-period candidate rows: task clones + goal-subtree clones. */
  occurrences: Planner[];
  /** cloneId -> source + period bounds, consumed by the constraints merge. */
  occurrenceMeta: Map<string, OccurrenceMeta>;
  /** Every clone id (roots + descendants), for failure filtering + scoping. */
  occurrenceIds: Set<string>;
}

export function expandRecurringItems(args: {
  planners: Planner[];
  completions: OccurrenceCompletionInput[];
  currentDate: Date;
  horizonDays: number;
}): RecurrenceExpansion {
  const { planners, completions, currentDate, horizonDays } = args;

  const occurrences: Planner[] = [];
  const occurrenceMeta = new Map<string, OccurrenceMeta>();
  const occurrenceIds = new Set<string>();

  const completionByEventId = new Map(
    completions.map(
      (c) => [occurrenceEventId(c.plannerId, c.occurrenceKey), c] as const,
    ),
  );
  const horizonEnd = addDays(currentDate, horizonDays);

  const childrenByParent = new Map<string, Planner[]>();
  for (const p of planners) {
    if (!p.parentId) continue;
    const list = childrenByParent.get(p.parentId);
    if (list) list.push(p);
    else childrenByParent.set(p.parentId, [p]);
  }

  const collectSubtree = (rootId: string): Planner[] => {
    const out: Planner[] = [];
    const seen = new Set<string>();
    const stack = [...(childrenByParent.get(rootId) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      out.push(node);
      for (const child of childrenByParent.get(node.id) ?? []) {
        stack.push(child);
      }
    }
    return out;
  };

  for (const item of planners) {
    // Roots only — a nested recurrence value is inert by design.
    if (item.parentId) continue;
    if (!plannerHasFlexibleRecurrence(item)) continue;
    if (item.isReady !== true) continue;

    const isGoal = item.plannerType === PlannerType.goal;
    const subtree = isGoal ? collectSubtree(item.id) : [];
    if (isGoal && subtree.length === 0) continue;
    if (!isGoal && (!item.duration || item.duration <= 0)) continue;

    const structuralLeaves = subtree.filter(
      (n) => !childrenByParent.has(n.id),
    );

    const periods = enumerateRecurrencePeriods({ item, until: horizonEnd });

    for (const period of periods) {
      // Fully-elapsed period: nothing to schedule forward; stats mark it
      // missed, and logged completions freeze via
      // buildOccurrenceCompletedEvents.
      if (period.end <= currentDate) continue;

      const rootCloneId = occurrenceEventId(item.id, period.key);

      if (!isGoal) {
        if (completionByEventId.has(rootCloneId)) continue;
        occurrences.push({
          ...item,
          id: rootCloneId,
          parentId: null,
          isReady: true,
          deadline: period.end.toISOString(),
          recurrence: null,
          recurrenceExceptions: null,
          linkedItemId: null,
          completedStartTime: null,
          completedEndTime: null,
          completedSegments: null,
        });
        occurrenceMeta.set(rootCloneId, {
          sourceId: item.id,
          periodStart: period.start,
          periodEnd: period.end,
        });
        occurrenceIds.add(rootCloneId);
        continue;
      }

      // A period whose every structural leaf is logged is done — emit nothing.
      const anyLeafOpen = structuralLeaves.some(
        (leaf) =>
          !completionByEventId.has(occurrenceEventId(leaf.id, period.key)),
      );
      if (!anyLeafOpen) continue;

      occurrences.push({
        ...item,
        id: rootCloneId,
        parentId: null,
        isReady: true,
        deadline: period.end.toISOString(),
        recurrence: null,
        recurrenceExceptions: null,
        linkedItemId: null,
        completedStartTime: null,
        completedEndTime: null,
        completedSegments: null,
      });
      occurrenceMeta.set(rootCloneId, {
        sourceId: item.id,
        periodStart: period.start,
        periodEnd: period.end,
      });
      occurrenceIds.add(rootCloneId);

      for (const node of subtree) {
        const cloneId = occurrenceEventId(node.id, period.key);
        const completion = completionByEventId.get(cloneId);
        occurrences.push({
          ...node,
          id: cloneId,
          // Subtree nodes always have a parent; remap it into the clone tree
          // (a direct child's parent is the root clone by construction).
          parentId: occurrenceEventId(node.parentId!, period.key),
          recurrence: null,
          recurrenceExceptions: null,
          linkedItemId: null,
          completedStartTime: completion?.start ?? null,
          completedEndTime: completion?.end ?? null,
          completedSegments: null,
        });
        occurrenceMeta.set(cloneId, {
          sourceId: node.id,
          periodStart: period.start,
          periodEnd: period.end,
        });
        occurrenceIds.add(cloneId);
      }
    }
  }

  return { occurrences, occurrenceMeta, occurrenceIds };
}
