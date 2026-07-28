import { Planner, Category } from "@/types/prisma";
import { PerTemplateMask } from "../../models/TemplateModels";
import type { CapacityLimitingAxis } from "../../models/EngineMessage";
import { Slot } from "../../models/TimeSlot";
import { gapIntervalsForDay } from "../TemplateExpander/gapIntervalsForDay";
import { expandSlotForDay } from "../TimeSlotManager/expandSlotForDay";
import { dateTimeService } from "../../utils/dateTimeService";
import {
  AllowedTimesSettings,
  DateInterval,
  intersectIntervalLists,
  intersectIntervalWithAllowed,
  maxAllowedBlockMinutes,
  maxConstrainedBlockMinutes,
  mergeIntervals,
  rangeIsOvernight,
  type WeeklyWindowOccurrence,
} from "../../../allowedTimes";
import {
  parseTaskSplitting,
  minChunkRequired,
  splitRemainingMinutes,
  taskIsSplittable,
} from "../../../taskSplitting";

// The flat scheduler sizes the watermark per leaf. A split leaf is placed one
// chunk at a time, so its fit size is the required minimum chunk (the whole
// remainder once it drops below 2*min), never the full duration — the
// aggregate would pin `biggestFit < biggestRemaining` permanently true and
// burn the whole expansion budget. taskIsSplittable already excludes plans AND
// habits (a habit's `splitting` is reinterpreted as flexible-block bounds, not
// the multi-chunk loop), so a habit sizes on its full duration here.
export function placementBlockMinutes(item: Planner): number {
  if (taskIsSplittable(item)) {
    const settings = parseTaskSplitting(item.splitting)!;
    return minChunkRequired(splitRemainingMinutes(item), settings);
  }
  return item.duration;
}

// Max usable duration in a single category window, ignoring everything else.
// Handles midnight wrap the same way expandSlotForDay does so the result is
// consistent with what the scheduler will actually see at placement time.
function largestWindowInCategory(category: Category): number {
  let max = 0;
  for (const ts of category.timeSlots) {
    const [sh, sm] = ts.startTime.split(":").map(Number);
    const [eh, em] = ts.endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    const dur = endMin - startMin;
    if (dur > max) max = dur;
  }
  return max;
}

// Subtract a set of exclusion intervals from one source interval. Returns the
// surviving sub-intervals in order. Inputs need not be sorted.
function subtractIntervals(
  source: { start: Date; end: Date },
  exclusions: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  let pieces: Array<{ start: Date; end: Date }> = [source];
  for (const ex of exclusions) {
    const next: Array<{ start: Date; end: Date }> = [];
    for (const p of pieces) {
      if (
        ex.end.getTime() <= p.start.getTime() ||
        ex.start.getTime() >= p.end.getTime()
      ) {
        next.push(p);
        continue;
      }
      if (ex.start.getTime() > p.start.getTime()) {
        next.push({ start: p.start, end: ex.start });
      }
      if (ex.end.getTime() < p.end.getTime()) {
        next.push({ start: ex.end, end: p.end });
      }
    }
    pieces = next;
  }
  return pieces;
}

// Upper bounds on the duration this specific task could ever occupy in a clean
// week, kept as two separate facts so the composed gate can attribute which
// one bound the leaf:
//   - largestGap: templates carve the day into gap intervals, and strict
//     categories the task is NOT eligible for subtract from any gap they
//     overlap (the task can never use them),
//   - categoryCeiling: if the task is window-constrained, the largest single
//     window across the categories it is eligible for (Infinity otherwise).
// Used to short-circuit TOO_LARGE at task entry before any slot-picking work.
//
// `eligibleCategoryIds` is the task's own effective category plus the
// non-confined ancestors it cascades into (see buildCategoryEligibilityMap);
// only members that actually bear windows constrain the ceiling.
//
// Cache is keyed by `categoryId ?? "anywhere"` because the calculation is
// identical for all tasks that resolve to the same effective category (and thus
// the same eligible set). Caller owns the cache (creates one per scheduling pass).
export interface EffectiveCapacityBreakdown {
  categoryCeiling: number;
  largestGap: number;
}

export function effectiveCapacityBreakdown(
  task: Planner,
  perTemplateMasks: PerTemplateMask[],
  categories: Category[],
  plannerCategoryMap: Map<string, string | null>,
  currentDate: Date,
  categoryEligibilityMap?: Map<string, Set<string>>,
  cache?: Map<string, EffectiveCapacityBreakdown>,
): EffectiveCapacityBreakdown {
  const taskCategoryId = plannerCategoryMap.get(task.id) ?? null;
  const cacheKey = taskCategoryId ?? "anywhere";
  const cached = cache?.get(cacheKey);
  if (cached !== undefined) return cached;

  const eligibleCategoryIds = taskCategoryId
    ? categoryEligibilityMap?.get(taskCategoryId)
    : undefined;

  // Window-bearing categories the task may occupy. Empty ⇒ unconstrained (the
  // task uses free gaps only, ceiling stays Infinity).
  const eligibleWindowCategories = eligibleCategoryIds
    ? categories.filter((c) => eligibleCategoryIds.has(c.id))
    : [];

  let categoryCeiling = Infinity;
  if (eligibleWindowCategories.length > 0) {
    categoryCeiling = 0;
    for (const category of eligibleWindowCategories) {
      const w = largestWindowInCategory(category);
      if (w > categoryCeiling) categoryCeiling = w;
    }
  }

  const weekStart = dateTimeService.startOfDay(currentDate);
  let largestGap = 0;

  for (let d = 0; d < 7; d++) {
    const dayStart = dateTimeService.shiftDays(weekStart, d);
    const gaps = gapIntervalsForDay(perTemplateMasks, dayStart);

    const exclusions: Array<{ start: Date; end: Date }> = [];
    for (const cat of categories) {
      if (!cat.isStrict) continue;
      if (eligibleCategoryIds?.has(cat.id)) continue;
      for (const ts of cat.timeSlots) {
        const period = expandSlotForDay(ts, dayStart);
        if (period) exclusions.push(period);
      }
    }

    for (const gap of gaps) {
      const remaining = subtractIntervals(gap, exclusions);
      for (const piece of remaining) {
        const len = (piece.end.getTime() - piece.start.getTime()) / 60000;
        if (len > largestGap) largestGap = len;
      }
    }
  }

  const result = { categoryCeiling, largestGap };
  cache?.set(cacheKey, result);
  return result;
}

// True weekly ceiling folding the week's template structure into the leaf's
// placement constraints: the largest contiguous fragment of (template-free
// gaps ∩ allowed times ∩ eligible category windows) over the sampled week.
// The axes are gated independently elsewhere (maxAllowedBlockMinutes for the
// allowed pattern alone, the template-gap largestGap and largest-window
// ceiling in effectiveCapacityBreakdown, maxConstrainedBlockMinutes for the
// exact allowed x windows pair), and every projection can look roomy while
// the full intersection never hosts the block — an evening gap satisfies the
// template axis, a wide daily range the allowed axis, a weekday window the
// category axis — so the leaf would burn the whole expansion budget as
// transient NO_SLOTS instead of failing loud as TOO_LARGE.
//
// Gaps are sampled per local day, so a fragment that chains across midnight
// at placement time is invisible here. Every guard errs toward a LARGER
// ceiling (a missed gate burns expansion budget; a false TOO_LARGE wrongly
// fails the item):
//   - an overnight allowed range drops the allowed axis,
//   - an overnight eligible window drops the window axis (no axis left ⇒
//     Infinity, check skipped),
//   - a template whose per-occurrence exceptions can touch a day the
//     remaining axes care about skips the check — a vacated occurrence can
//     open room on a specific date the sampled week cannot see; exceptions on
//     templates confined to irrelevant days cannot change the ceiling. The
//     window axis's own exceptions guard lives in the caller
//     (eligibleCategoryWindows returns [] when any eligible window carries
//     exceptions).
export function maxTemplateConstrainedBlockMinutes(
  allowedChain: AllowedTimesSettings[],
  eligibleWindows: WeeklyWindowOccurrence[],
  perTemplateMasks: PerTemplateMask[],
  currentDate: Date,
): number {
  const chain = allowedChain.some((s) => s.ranges?.some(rangeIsOvernight))
    ? []
    : allowedChain;
  const windows = eligibleWindows.some(rangeIsOvernight)
    ? []
    : eligibleWindows;
  if (chain.length === 0 && windows.length === 0) return Infinity;

  const dayRelevant = (day: number): boolean =>
    chain.every((s) => s.days === null || s.days.includes(day)) &&
    (windows.length === 0 || windows.some((w) => w.day === day));
  for (const mask of perTemplateMasks) {
    const exceptions = mask.recurrenceExceptions;
    if (!exceptions?.length) continue;
    if (
      dayRelevant(mask.dayOfWeek) ||
      (mask.endMinutes > 1440 && dayRelevant((mask.dayOfWeek + 1) % 7))
    ) {
      return Infinity;
    }
    for (const exception of exceptions) {
      if (
        exception.type === "moved" &&
        dayRelevant(new Date(exception.newStart).getDay())
      ) {
        return Infinity;
      }
    }
  }

  const weekStart = dateTimeService.startOfDay(currentDate);
  let largest = 0;
  for (let d = 0; d < 7; d++) {
    const dayStart = dateTimeService.shiftDays(weekStart, d);
    let dayWindows: DateInterval[] | null = null;
    if (windows.length > 0) {
      const occurrences: DateInterval[] = [];
      for (const window of windows) {
        const period = expandSlotForDay(window, dayStart);
        if (period) occurrences.push(period);
      }
      if (occurrences.length === 0) continue;
      dayWindows = mergeIntervals(occurrences);
    }
    for (const gap of gapIntervalsForDay(perTemplateMasks, dayStart)) {
      let fragments: DateInterval[] = intersectIntervalWithAllowed(
        gap.start,
        gap.end,
        chain,
      );
      if (dayWindows) {
        fragments = intersectIntervalLists(fragments, dayWindows);
      }
      for (const fragment of fragments) {
        const len =
          (fragment.end.getTime() - fragment.start.getTime()) / 60000;
        if (len > largest) largest = len;
      }
    }
  }
  return largest;
}

// Weekly occurrences of the window-bearing categories this leaf may occupy.
// Returns [] (skipping the structural checks' window axis) when any eligible
// window carries per-occurrence exceptions — a moved occurrence can land
// inside the allowed times even when the weekly patterns never coincide.
function eligibleCategoryWindows(
  leaf: Planner,
  categories: Category[],
  plannerCategoryMap: Map<string, string | null>,
  categoryEligibilityMap?: Map<string, Set<string>>,
): WeeklyWindowOccurrence[] {
  const effectiveCategoryId = plannerCategoryMap.get(leaf.id) ?? null;
  if (!effectiveCategoryId) return [];
  const eligibleIds = categoryEligibilityMap?.get(effectiveCategoryId);
  if (!eligibleIds) return [];

  const windows: WeeklyWindowOccurrence[] = [];
  for (const category of categories) {
    if (!eligibleIds.has(category.id)) continue;
    if (!category.useTimeWindows || category.timeSlots.length === 0) continue;
    for (const window of category.timeSlots) {
      if (window.recurrenceExceptions) return [];
      windows.push(window);
    }
  }
  return windows;
}

export interface LeafStructuralCapacityArgs {
  leaf: Planner;
  allowedChain: AllowedTimesSettings[];
  perTemplateMasks: PerTemplateMask[];
  categories: Category[];
  plannerCategoryMap: Map<string, string | null>;
  currentDate: Date;
  categoryEligibilityMap?: Map<string, Set<string>>;
  capacityCache?: Map<string, EffectiveCapacityBreakdown>;
  bufferTimeMinutes: number;
  cache?: Map<string, LeafStructuralCapacity>;
}

export interface LeafStructuralCapacity {
  maxCapacity: number;
  // The allowed times and the eligible category windows never coincide in any
  // week — structurally unplaceable no matter how far the horizon expands
  // (surfaced as IMPOSSIBLE_CONSTRAINTS, distinct from TOO_LARGE).
  impossibleConstraints: boolean;
  // Which ceiling produced maxCapacity — rides the TOO_LARGE payload so the
  // console can explain the failure specifically. Ties go to the earlier
  // (simpler) axis: an intersection is only blamed when strictly tighter than
  // its projections.
  limitingAxis: CapacityLimitingAxis;
}

// The one structural ceiling for a leaf: every per-axis capacity bound plus
// the true weekly intersections, composed exactly as the TOO_LARGE gate
// enforces them. min() of independent per-axis ceilings misses the cases
// where the constraint patterns never coincide — or coincide only where
// templates sit — so the intersections are folded in here. placeLeaf AND the
// proactive-expansion watermark must consult the SAME number: a leaf only an
// intersection gate can fail would otherwise keep `biggestFit <
// biggestRemaining` true forever (its compatible slots never materialize) and
// burn the whole expansion budget before the gate ever fires. Every input is
// run-static, so results cache per leaf id.
export function leafStructuralCapacity(
  args: LeafStructuralCapacityArgs,
): LeafStructuralCapacity {
  const {
    leaf,
    allowedChain,
    perTemplateMasks,
    categories,
    plannerCategoryMap,
    currentDate,
    categoryEligibilityMap,
    capacityCache,
    bufferTimeMinutes,
    cache,
  } = args;
  const cached = cache?.get(leaf.id);
  if (cached !== undefined) return cached;

  const breakdown = effectiveCapacityBreakdown(
    leaf,
    perTemplateMasks,
    categories,
    plannerCategoryMap,
    currentDate,
    categoryEligibilityMap,
    capacityCache,
  );
  let maxCapacity = breakdown.largestGap;
  let limitingAxis: CapacityLimitingAxis = "templateGaps";
  const consider = (value: number, axis: CapacityLimitingAxis) => {
    if (value < maxCapacity) {
      maxCapacity = value;
      limitingAxis = axis;
    }
  };
  consider(breakdown.categoryCeiling, "categoryWindow");
  consider(maxAllowedBlockMinutes(allowedChain), "allowedTimes");
  let impossibleConstraints = false;

  const eligibleWindows = eligibleCategoryWindows(
    leaf,
    categories,
    plannerCategoryMap,
    categoryEligibilityMap,
  );
  if (allowedChain.length > 0 && eligibleWindows.length > 0) {
    const constrainedCeiling = maxConstrainedBlockMinutes(
      allowedChain,
      eligibleWindows,
    );
    if (constrainedCeiling === 0) impossibleConstraints = true;
    consider(constrainedCeiling, "allowedTimesWindows");
  }
  if (
    !impossibleConstraints &&
    (allowedChain.length > 0 || eligibleWindows.length > 0)
  ) {
    // The fit-test requires the block PLUS its trailing buffer inside one
    // fragment, so the usable ceiling is the largest intersection fragment
    // minus the buffer — a block that exactly matches its largest fragment
    // (or whose windows are template-covered) can never place.
    const templateCeiling = maxTemplateConstrainedBlockMinutes(
      allowedChain,
      eligibleWindows,
      perTemplateMasks,
      currentDate,
    );
    if (templateCeiling !== Infinity) {
      consider(
        Math.max(0, templateCeiling - bufferTimeMinutes),
        "templateIntersection",
      );
    }
  }

  const result = { maxCapacity, impossibleConstraints, limitingAxis };
  cache?.set(leaf.id, result);
  return result;
}

// Walks the current slot array and returns the largest slot the scheduler
// would accept for `biggest` — the caller-supplied biggest remaining candidate
// (by effectiveCandidateDuration; computed once per iteration in
// scheduleTasksAndGoals and shared with the watermark comparison). Mirrors the
// predicate in findAllFittingSlots: categorized task → only matching-category
// slots; uncategorized task → Available + non-strict-category slots. Used by
// the proactive expansion watermark in scheduleTasksAndGoals to decide whether
// to extend the horizon before attempting the next placement.
// placementCutoffDate (tail buffer) is respected the same way findAllFittingSlots
// honors it, so the watermark agrees with what the scheduler will actually
// see — otherwise the watermark could report "we have room" while every fit
// lies inside the buffer zone.
// schedulableCategoryIds is the set of categories that actually constrain
// geometry (useTimeWindows + windows) — the same filter findValidSlots
// applies via context.categories. A categoryId outside it (classification-
// only category) must be treated as unconstrained here too, or the watermark
// demands category slots that can never exist and starves the placement walk.
export function largestCompatibleSlotForLargestTask(
  biggest: Planner | null,
  slots: Slot[],
  plannerCategoryMap: Map<string, string | null>,
  categoryEligibilityMap: Map<string, Set<string>>,
  placementCutoffDate: Date | null | undefined,
  schedulableCategoryIds: Set<string>,
): number {
  if (!biggest) return 0;

  const rawCategoryId = plannerCategoryMap.get(biggest.id) ?? null;
  // Window-bearing categories this task cascades into. Constrained only when
  // that set is non-empty — mirrors findValidSlots / findAllFittingSlots.
  const eligibleWindowIds = rawCategoryId
    ? new Set(
        Array.from(categoryEligibilityMap.get(rawCategoryId) ?? []).filter(
          (id) => schedulableCategoryIds.has(id),
        ),
      )
    : new Set<string>();
  const constrained = eligibleWindowIds.size > 0;
  const cutoffMs = placementCutoffDate?.getTime();

  let largest = 0;
  for (const slot of slots) {
    if (slot.type !== "available" && slot.type !== "category") continue;
    if (cutoffMs !== undefined && slot.start.getTime() >= cutoffMs) break;
    if (constrained) {
      if (slot.type !== "category" || !eligibleWindowIds.has(slot.categoryId)) {
        continue;
      }
    } else if (slot.type === "category" && slot.isStrictCategory) {
      continue;
    }
    if (slot.durationMinutes > largest) largest = slot.durationMinutes;
  }
  return largest;
}
