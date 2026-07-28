import { Category, Planner, PlannerType } from "@/types/prisma";
import { SCHEDULING_CONFIG, TIME_CONSTANTS } from "../../constants";
import {
  AllowedTimesSettings,
  rangeMinutes,
  weeklyAllowedMinutes,
} from "../../../allowedTimes";

// The ONE scheduling-order comparator, shared by the candidate sort
// (sortByPriorityAndConstraints) and the flat scheduler's leaf ordering
// (scheduleTasksAndGoals) — the two orderings must never disagree. Tiers:
//
//   1. constrained first (a resolved category or an allowed-times chain:
//      scarce slots get first pick), ordered within by weekly eligible
//      minutes ascending — four window-hours a week places before forty
//   2. EDF: in-horizon deadlines by slack ascending (deadline - now -
//      required block). Deadline-free and far-future items sort after every
//      EDF item. A discrete tier, not a score adjustment — folded into the
//      score it would be diluted by priority, which is the bug it fixes.
//   3. score descending (urgency / inheritance-adjusted)
//   4. failed attempts descending (anti-starvation aging: a leaf that has
//      been losing the retry loop longest gets first pick within its band —
//      never overriding the constrained, EDF, or score tiers)
//   5. stable index ascending (total, deterministic order)

export interface SchedulingOrderKey {
  constrained: boolean;
  /** Weekly eligible minutes (scarcity proxy); null = unconstrained */
  scarcityMinutes: number | null;
  /** null = deadline-free, beyond the EDF horizon, habit, or tier disabled */
  slackMinutes: number | null;
  score: number;
  /** Placement attempts so far (retry-loop aging); 0 outside the scheduler */
  attempts: number;
  index: number;
}

export function compareSchedulingOrder(
  a: SchedulingOrderKey,
  b: SchedulingOrderKey,
): number {
  if (a.constrained !== b.constrained) return a.constrained ? -1 : 1;
  const aScarcity = a.scarcityMinutes ?? Infinity;
  const bScarcity = b.scarcityMinutes ?? Infinity;
  if (aScarcity !== bScarcity) return aScarcity - bScarcity;
  const aEdf = a.slackMinutes !== null;
  const bEdf = b.slackMinutes !== null;
  if (aEdf !== bEdf) return aEdf ? -1 : 1;
  if (aEdf && bEdf && a.slackMinutes !== b.slackMinutes) {
    return (a.slackMinutes as number) - (b.slackMinutes as number);
  }
  if (a.score !== b.score) return b.score - a.score;
  if (a.attempts !== b.attempts) return b.attempts - a.attempts;
  return a.index - b.index;
}

/**
 * Weekly eligible minutes — the constrained tier's scarcity key. The min of
 * the item's weekly eligible category-window minutes (own effective category
 * plus its upward cascade, window-bearing members only) and its weekly
 * allowed-times minutes. True MRV (per-leaf fitting-slot counts) would be
 * O(leaves x slots); this weekly proxy is a cheap cached sum. null =
 * unconstrained on both axes (the key is inert outside the constrained tier).
 */
export function scarcityMinutesFor(args: {
  effectiveCategoryId: string | null;
  allowedChain: AllowedTimesSettings[];
  windowedCategories: Category[];
  categoryEligibilityMap?: Map<string, Set<string>>;
  weeklyWindowMinutesCache?: Map<string, number>;
}): number | null {
  let windowWeekly = Infinity;
  if (args.effectiveCategoryId) {
    const cached = args.weeklyWindowMinutesCache?.get(args.effectiveCategoryId);
    if (cached !== undefined) {
      windowWeekly = cached;
    } else {
      const eligible = args.categoryEligibilityMap?.get(
        args.effectiveCategoryId,
      );
      let total = 0;
      let anyWindows = false;
      if (eligible) {
        for (const category of args.windowedCategories) {
          if (!eligible.has(category.id)) continue;
          for (const window of category.timeSlots) {
            total += rangeMinutes(window);
            anyWindows = true;
          }
        }
      }
      windowWeekly = anyWindows ? total : Infinity;
      args.weeklyWindowMinutesCache?.set(args.effectiveCategoryId, windowWeekly);
    }
  }

  let allowedWeekly = Infinity;
  for (const settings of args.allowedChain) {
    const weekly = weeklyAllowedMinutes(settings);
    if (weekly < allowedWeekly) allowedWeekly = weekly;
  }

  const scarcity = Math.min(windowWeekly, allowedWeekly);
  return Number.isFinite(scarcity) ? scarcity : null;
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
