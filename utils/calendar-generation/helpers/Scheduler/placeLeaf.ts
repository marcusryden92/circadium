import { Planner, SimpleEvent, Category, PlannerType } from "@/types/prisma";
import { Scheduler } from "../../core/Scheduler";
import { SchedulingFailure } from "../../models/SchedulingModels";
import { SchedulingFailureReason } from "../../constants";
import { PerTemplateMask } from "../../models/TemplateModels";
import {
  leafStructuralCapacity,
  type EffectiveCapacityBreakdown,
  type LeafStructuralCapacity,
} from "./capacityCheck";
import { parseTaskSplitting, minChunkRequired } from "../../../taskSplitting";
import {
  SplitPlacementState,
  scheduleSplitTask,
  splitRemainingForRun,
} from "./scheduleSplitTask";
import {
  GoalCapContext,
  wholeBlockSizing,
  flexibleBlockSizing,
} from "./goalDayCap";

// Unified placement of ONE schedulable leaf — the primitive the flat-order
// loop drives. It merges what scheduleSingleTask (standalone tasks) and
// scheduleGoal's per-leaf block (goal leaves) used to do separately: the
// TOO_LARGE gate, split-task chunk loop, optional goal-day-cap sizing, and
// plain placement. Callers own the per-goal daily-cap context (goalCap) and
// the running afterTime chain; this function does not know about tree
// structure. A leaf is a leaf.

export interface PlaceLeafArgs {
  leaf: Planner;
  scheduler: Scheduler;
  perTemplateMasks: PerTemplateMask[];
  categories: Category[];
  plannerCategoryMap: Map<string, string | null>;
  categoryEligibilityMap: Map<string, Set<string>>;
  currentDate: Date;
  capacityCache: Map<string, EffectiveCapacityBreakdown>;
  leafCapacityCache?: Map<string, LeafStructuralCapacity>;
  splitState: SplitPlacementState;
  scheduledTaskIds: Set<string>;
  failures: SchedulingFailure[];
  afterTime?: Date;
  allowDayCapRelaxation?: boolean;
  /**
   * One entry per capped goal the leaf sits under (its own root plus every
   * detour host that splices it). Oversized/steering/attribution are decided
   * PER CAP: a leaf bigger than one goal's cap is oversized for that goal
   * only — the other caps still steer it and only the exceeded cap gets the
   * relaxation row. Every placement charges every ledger.
   */
  goalCaps?: GoalCapContext[];
}

export interface PlaceLeafResult {
  /** Fully placed this call (or already placed on a prior pass). */
  scheduled: boolean;
  /** TOO_LARGE / INVALID — never worth retrying; the chain steps past it. */
  permanentFailure: boolean;
  events: SimpleEvent[];
  /** Max end among events placed this call — advances the caller's chain. */
  lastEnd?: Date;
}

function maxEventEnd(events: SimpleEvent[]): Date | undefined {
  let max: Date | undefined;
  for (const e of events) {
    const end = new Date(e.end);
    if (!max || end > max) max = end;
  }
  return max;
}

export function placeLeaf(args: PlaceLeafArgs): PlaceLeafResult {
  const {
    leaf,
    scheduler,
    perTemplateMasks,
    categories,
    plannerCategoryMap,
    categoryEligibilityMap,
    currentDate,
    capacityCache,
    leafCapacityCache,
    splitState,
    scheduledTaskIds,
    failures,
    afterTime,
    allowDayCapRelaxation = false,
    goalCaps = [],
  } = args;

  if (scheduledTaskIds.has(leaf.id)) {
    return { scheduled: true, permanentFailure: false, events: [] };
  }

  // A habit occurrence reuses the `splitting` JSON to store min/max bounds for
  // a SINGLE flexible block, so it must never enter the multi-chunk split loop.
  const isHabit = leaf.plannerType === PlannerType.habit;
  const splitSettings = isHabit ? null : parseTaskSplitting(leaf.splitting);
  const habitBounds = isHabit ? parseTaskSplitting(leaf.splitting) : null;

  const allowedChain =
    scheduler.context.plannerConstraintsMap?.get(leaf.id)?.allowedTimes ?? [];
  const { maxCapacity, impossibleConstraints, limitingAxis } =
    leafStructuralCapacity({
    leaf,
    allowedChain,
    perTemplateMasks,
    categories,
    plannerCategoryMap,
    currentDate,
    categoryEligibilityMap,
    capacityCache,
    bufferTimeMinutes: scheduler.slotManager.bufferTimeMinutes,
    cache: leafCapacityCache,
  });
  if (impossibleConstraints) {
    failures.push({
      taskId: leaf.id,
      taskTitle: leaf.title,
      reason: SchedulingFailureReason.IMPOSSIBLE_CONSTRAINTS,
      details:
        "The item's allowed times and its category's scheduled windows never overlap in any week",
    });
    return { scheduled: false, permanentFailure: true, events: [] };
  }

  const requiredBlockMinutes = splitSettings
    ? minChunkRequired(splitRemainingForRun(leaf, splitState), splitSettings)
    : habitBounds
      ? habitBounds.minMinutes
      : leaf.duration;

  if (requiredBlockMinutes > maxCapacity) {
    failures.push({
      taskId: leaf.id,
      taskTitle: leaf.title,
      reason: SchedulingFailureReason.TOO_LARGE,
      details: `Task duration (${requiredBlockMinutes} min${splitSettings ? ", minimum chunk" : ""}) exceeds max effective capacity (${maxCapacity} min) given templates, category, and allowed-time constraints`,
      context: { duration: requiredBlockMinutes, maxCapacity, limitingAxis },
    });
    return { scheduled: false, permanentFailure: true, events: [] };
  }

  if (splitSettings) {
    const result = scheduleSplitTask({
      task: leaf,
      settings: splitSettings,
      scheduler,
      state: splitState,
      afterTime,
      allowDayCapRelaxation,
      goalCaps,
    });
    const lastEnd = maxEventEnd(result.events);
    if (result.fullyPlaced) {
      scheduledTaskIds.add(leaf.id);
      return {
        scheduled: true,
        permanentFailure: false,
        events: result.events,
        lastEnd,
      };
    }
    if (result.failure) failures.push(result.failure);
    // Partial placements stay on the calendar; the leaf remains unresolved and
    // resumes from its remainder after the next horizon expansion.
    return {
      scheduled: false,
      permanentFailure: false,
      events: result.events,
      lastEnd,
    };
  }

  // Habit occurrence: one flexible block sized to the slot's headroom, clamped
  // to [min, max] (or the fixed duration when no bounds). Habits are roots, so
  // there are never goal caps here — the placement-window upper bound in the
  // occurrence's constraints keeps it inside its period.
  if (isHabit) {
    const res = habitBounds
      ? scheduler.scheduleTask(
          leaf,
          afterTime,
          flexibleBlockSizing(habitBounds.minMinutes, habitBounds.maxMinutes),
        )
      : scheduler.scheduleTask(leaf, afterTime);
    if (res.success && res.event) {
      scheduledTaskIds.add(leaf.id);
      return {
        scheduled: true,
        permanentFailure: false,
        events: [res.event],
        lastEnd: new Date(res.event.end),
      };
    }
    if (res.failure) {
      failures.push(res.failure);
      if (res.failure.reason !== SchedulingFailureReason.NO_SLOTS) {
        return { scheduled: false, permanentFailure: true, events: [] };
      }
    }
    return { scheduled: false, permanentFailure: false, events: [] };
  }

  // A leaf bigger than a goal's daily cap can never place under that cap —
  // no horizon expansion creates such a day — so that cap is ruled out of
  // steering (recorded as an oversizedLeaf compromise on placement) instead
  // of starving the loop. Caps the leaf DOES fit keep steering it.
  const exceededCaps = goalCaps.filter((c) => leaf.duration > c.capMinutes);
  const fittingCaps = goalCaps.filter((c) => leaf.duration <= c.capMinutes);
  const fittingBudget = (slotStart: Date): number => {
    let min = Infinity;
    for (const c of fittingCaps) min = Math.min(min, c.budget(slotStart));
    return min;
  };
  let res =
    fittingCaps.length > 0
      ? scheduler.scheduleTask(
          leaf,
          afterTime,
          wholeBlockSizing(leaf.duration, fittingBudget),
        )
      : scheduler.scheduleTask(leaf, afterTime);
  let dayCapRelaxed = false;
  if (fittingCaps.length > 0 && !res.success && allowDayCapRelaxation) {
    res = scheduler.scheduleTask(leaf, afterTime);
    dayCapRelaxed = res.success;
  }

  if (res.success && res.event) {
    if (goalCaps.length > 0) {
      const start = new Date(res.event.start);
      const end = new Date(res.event.end);
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      for (const c of exceededCaps) {
        c.recordRelaxation("oversizedLeaf", minutes, res.event.start);
      }
      if (dayCapRelaxed) {
        for (const c of fittingCaps) {
          if (c.budget(start) < minutes) {
            c.recordRelaxation("dayCap", minutes, res.event.start);
          }
        }
      }
      for (const c of goalCaps) c.charge(start, end);
    }
    scheduledTaskIds.add(leaf.id);
    return {
      scheduled: true,
      permanentFailure: false,
      events: [res.event],
      lastEnd: new Date(res.event.end),
    };
  } else if (res.failure) {
    failures.push(res.failure);
    // NO_SLOTS is transient — the outer loop retries after other placements
    // free up room or the horizon expands. Any other failure is permanent.
    if (res.failure.reason !== SchedulingFailureReason.NO_SLOTS) {
      return { scheduled: false, permanentFailure: true, events: [] };
    }
    return { scheduled: false, permanentFailure: false, events: [] };
  }

  return { scheduled: false, permanentFailure: false, events: [] };
}
