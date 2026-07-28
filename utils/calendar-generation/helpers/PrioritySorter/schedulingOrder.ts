import { Planner, PlannerType } from "@/types/prisma";
import { SCHEDULING_CONFIG, TIME_CONSTANTS } from "../../constants";

// The ONE scheduling-order comparator, shared by the candidate sort
// (sortByPriorityAndConstraints) and the flat scheduler's leaf ordering
// (scheduleTasksAndGoals) — the two orderings must never disagree. Tiers:
//
//   1. category-constrained first (scarce windows get first pick)
//   2. EDF: in-horizon deadlines by slack ascending (deadline - now -
//      required block). Deadline-free and far-future items sort after every
//      EDF item. A discrete tier, not a score adjustment — folded into the
//      score it would be diluted by priority, which is the bug it fixes.
//   3. score descending (urgency / inheritance-adjusted)
//   4. stable index ascending (total, deterministic order)

export interface SchedulingOrderKey {
  constrained: boolean;
  /** null = deadline-free, beyond the EDF horizon, habit, or tier disabled */
  slackMinutes: number | null;
  score: number;
  index: number;
}

export function compareSchedulingOrder(
  a: SchedulingOrderKey,
  b: SchedulingOrderKey,
): number {
  if (a.constrained !== b.constrained) return a.constrained ? -1 : 1;
  const aEdf = a.slackMinutes !== null;
  const bEdf = b.slackMinutes !== null;
  if (aEdf !== bEdf) return aEdf ? -1 : 1;
  if (aEdf && bEdf && a.slackMinutes !== b.slackMinutes) {
    return (a.slackMinutes as number) - (b.slackMinutes as number);
  }
  if (a.score !== b.score) return b.score - a.score;
  return a.index - b.index;
}

/**
 * Walk up the parent chain to find the nearest deadline. Cached per planner
 * so a wide tree with hundreds of leaves only pays one walk per branch.
 * Cycle-safe via a visited set — malformed data shouldn't hang the engine.
 */
export function resolveInheritedDeadline(
  planner: Planner,
  plannerById: Map<string, Planner>,
  cache: Map<string, Date | null>,
): Date | null {
  const cached = cache.get(planner.id);
  if (cached !== undefined) return cached;

  const visited = new Set<string>();
  let current: Planner | undefined = planner;
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    if (current.deadline) {
      const resolved = new Date(current.deadline);
      cache.set(planner.id, resolved);
      return resolved;
    }
    current = current.parentId
      ? plannerById.get(current.parentId)
      : undefined;
  }

  cache.set(planner.id, null);
  return null;
}

/**
 * EDF-tier membership + ordering key. Habit occurrences are excluded — their
 * synthetic period deadline is a placement window, not a commitment, and
 * hoisting them above deadline-free work would break the designed contest
 * where a low-priority habit yields.
 */
export function edfSlackMinutes(
  item: Planner,
  deadline: Date | null,
  now: Date,
  requiredBlockMinutes: number,
): number | null {
  if (!SCHEDULING_CONFIG.EDF_TIER_ENABLED) return null;
  if (item.plannerType === PlannerType.habit) return null;
  if (!deadline) return null;
  const minutesUntilDeadline =
    (deadline.getTime() - now.getTime()) / TIME_CONSTANTS.MS_PER_MINUTE;
  if (
    minutesUntilDeadline >
    SCHEDULING_CONFIG.EDF_HORIZON_DAYS * TIME_CONSTANTS.MINUTES_PER_DAY
  ) {
    return null;
  }
  return minutesUntilDeadline - requiredBlockMinutes;
}
