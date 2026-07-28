/**
 * Candidate Preparation
 *
 * Prepares and sorts candidates for scheduling
 */

import { Planner, PlannerType } from "@/types/prisma";
import { sortByPriorityAndConstraints } from "../PrioritySorter";
import type { PlannerSchedulingConstraints } from "./buildPlannerConstraintsMap";
import { taskIsCompleted } from "../../../taskHelpers";
import { getScheduledLeafSequence } from "../../../goalPageHandlers";
import { isOccurrenceEventId } from "../../../planRecurrence";

export function prepareCandidates(
  planners: Planner[],
  memoizedEventIds: Set<string>,
  urgencyScores: Map<string, number>,
  plannerCategoryMap: Map<string, string | null> | undefined,
  currentDate: Date,
  plannerConstraintsMap?: Map<string, PlannerSchedulingConstraints>,
): Planner[] {
  const plannersById = new Map(planners.map((p) => [p.id, p]));

  function rootOf(item: Planner): Planner {
    let current = item;
    const seen = new Set<string>([current.id]);
    while (current.parentId) {
      const parent = plannersById.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current;
  }

  // Completed items are rendered at their completion window by
  // buildCompletedEvents and must never re-enter the scheduler.
  // Readiness is the universal scheduling gate: tasks and goals alike only
  // become candidates when isReady === true. Tasks inside a goal subtree are
  // owned by the goal's ready gate — the scheduler places them when the root
  // goal is ready, and an unready goal's subtree stays off the calendar
  // entirely — so they are excluded here regardless (they inherit the root's
  // readiness via the cascade).
  const preCandidates = planners.filter((item) => {
    if (taskIsCompleted(item) || memoizedEventIds.has(item.id)) return false;
    // Habit occurrences (synthetic `${habitId}|${periodKey}` rows injected by
    // expandHabits) are first-class candidates; a bare habit row is not — it is
    // only a template for its occurrences.
    if (item.plannerType === PlannerType.habit) {
      return isOccurrenceEventId(item.id) && item.isReady !== false;
    }
    if (item.plannerType === PlannerType.goal) {
      return !item.parentId && item.isReady === true;
    }
    if (item.plannerType !== PlannerType.task) return false;
    if (item.isReady !== true) return false;
    if (!item.parentId) return true;
    return rootOf(item).plannerType !== PlannerType.goal;
  });

  // A detour target schedules via its host's spliced sequence, never as an
  // independent candidate (else its leaves would place twice) — but only when
  // an ACTIVE candidate actually splices it. The followed set comes from the
  // same enumerator walk the leaf graph uses, so a target whose every host is
  // completed, unready, or otherwise not a candidate schedules independently.
  const activeTargetIds = new Set<string>();
  for (const item of preCandidates) {
    getScheduledLeafSequence(planners, item.id, activeTargetIds);
  }
  const candidates = preCandidates.filter(
    (item) => !activeTargetIds.has(item.id),
  );

  return sortByPriorityAndConstraints(
    planners,
    candidates,
    urgencyScores,
    plannerCategoryMap,
    currentDate,
    plannerConstraintsMap,
  );
}
