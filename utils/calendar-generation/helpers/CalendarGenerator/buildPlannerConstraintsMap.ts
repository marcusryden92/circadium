import { Planner, PlannerType } from "@/types/prisma";
import {
  AllowedTimesSettings,
  parseAllowedTimes,
  parseEarliestStartDate,
} from "../../../allowedTimes";

/**
 * Per-planner scheduling constraints resolved down the tree: a row is bound by
 * its own earliestStartDate/allowedTimes AND every ancestor's. earliestStart
 * resolves to the latest date in the chain; allowedTimes stays a chain of
 * settings the placement sites intersect interval-wise (intersecting the
 * settings objects themselves would need day-set x range-set algebra for no
 * gain). Plans are excluded — they are fixed anchors, never dynamically placed.
 *
 * placementWindowEnd is an upper bound on where the placement unit may END. It
 * is null for every column-derived row (there is no column for it); habit
 * occurrences supply a real value (their period end) via expandHabits, merged
 * into the map after this pass, so a weekly occurrence stays inside its week.
 */
export interface PlannerSchedulingConstraints {
  earliestStart: Date | null;
  allowedTimes: AllowedTimesSettings[];
  placementWindowEnd: Date | null;
}

export function buildPlannerConstraintsMap(
  planners: Planner[],
): Map<string, PlannerSchedulingConstraints> {
  const plannerMap = new Map(planners.map((p) => [p.id, p]));
  const resolved = new Map<string, PlannerSchedulingConstraints | null>();

  function resolve(id: string): PlannerSchedulingConstraints | null {
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;

    const planner = plannerMap.get(id);
    if (!planner) {
      resolved.set(id, null);
      return null;
    }

    const inherited = planner.parentId ? resolve(planner.parentId) : null;
    const ownEarliest = parseEarliestStartDate(planner.earliestStartDate);
    const ownAllowed = parseAllowedTimes(planner.allowedTimes);

    if (!ownEarliest && !ownAllowed) {
      resolved.set(id, inherited);
      return inherited;
    }

    const earliestStart =
      inherited?.earliestStart && ownEarliest
        ? inherited.earliestStart > ownEarliest
          ? inherited.earliestStart
          : ownEarliest
        : (ownEarliest ?? inherited?.earliestStart ?? null);

    const constraints: PlannerSchedulingConstraints = {
      earliestStart,
      allowedTimes: ownAllowed
        ? [...(inherited?.allowedTimes ?? []), ownAllowed]
        : (inherited?.allowedTimes ?? []),
      placementWindowEnd: null,
    };
    resolved.set(id, constraints);
    return constraints;
  }

  const result = new Map<string, PlannerSchedulingConstraints>();
  for (const planner of planners) {
    if (planner.plannerType === PlannerType.plan) continue;
    const constraints = resolve(planner.id);
    if (constraints) result.set(planner.id, constraints);
  }
  return result;
}
