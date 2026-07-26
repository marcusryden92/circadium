import { Planner, PlannerType } from "@/types/prisma";
import { addDays } from "date-fns";
import { PlannerSchedulingConstraints } from "./buildPlannerConstraintsMap";
import { HabitCompletionInput } from "../../models/SchedulingModels";
import { parseAllowedTimes, parseEarliestStartDate } from "../../../allowedTimes";
import { occurrenceEventId } from "../../../planRecurrence";
import { enumerateHabitPeriods } from "@/utils/habits/habitPeriods";

// Expands each habit row into per-period occurrence CANDIDATES that flow through
// the same leaf pool / scoring / placement pipeline as tasks and goals. One
// occurrence per recurrence period (day/week/month, aligned to the user's week
// start — the shared enumerateHabitPeriods, so scheduling and stats agree on
// which period is which), bounded to that period via placementWindowEnd so a
// weekly habit's occurrence stays inside its own week. Each occurrence carries
// deadline = periodEnd, which lets the shared urgency scorer treat it like a
// deadline-bearing task — urgency climbs as the window closes, so whether it
// places or is skipped ("missed") emerges from the same contest.
//
// Past periods (window fully elapsed) and already-completed periods (per
// options.habitCompletions) are never emitted — the engine only schedules
// forward, and a missing completion for an elapsed period is a "missed" window
// derived by the stats layer, not the engine.

export interface HabitExpansion {
  /** Synthetic childless-root candidates, one per future uncompleted period. */
  occurrences: Planner[];
  /** occurrenceId -> its resolved constraints (with placementWindowEnd). */
  occurrenceConstraints: Map<string, PlannerSchedulingConstraints>;
  /** All emitted occurrence ids, for failure filtering + score scoping. */
  occurrenceIds: Set<string>;
}

function latest(...dates: (Date | null | undefined)[]): Date {
  let max: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max ?? new Date(0);
}

export function expandHabits(args: {
  planners: Planner[];
  completions: HabitCompletionInput[];
  currentDate: Date;
  horizonDays: number;
}): HabitExpansion {
  const { planners, completions, currentDate, horizonDays } = args;

  const occurrences: Planner[] = [];
  const occurrenceConstraints = new Map<string, PlannerSchedulingConstraints>();
  const occurrenceIds = new Set<string>();

  const completedIds = new Set(
    completions.map((c) => occurrenceEventId(c.plannerId, c.occurrenceKey)),
  );
  const horizonEnd = addDays(currentDate, horizonDays);

  for (const habit of planners) {
    if (habit.plannerType !== PlannerType.habit) continue;
    if (habit.isReady === false) continue;
    if (!habit.duration || habit.duration <= 0) continue;

    const ownEarliest = parseEarliestStartDate(habit.earliestStartDate);
    const ownAllowed = parseAllowedTimes(habit.allowedTimes);
    const allowedChain = ownAllowed ? [ownAllowed] : [];

    const periods = enumerateHabitPeriods({
      habit,
      until: horizonEnd,
    });

    for (const period of periods) {
      // Fully-elapsed period: nothing to schedule forward; stats mark it missed.
      if (period.end <= currentDate) continue;

      const id = occurrenceEventId(habit.id, period.key);
      if (completedIds.has(id)) continue;

      // A current partial period starts at "now"; a fully-future one at its
      // period start. The habit's own earliest-start floor still applies.
      const earliestStart = latest(period.start, currentDate, ownEarliest);

      occurrenceConstraints.set(id, {
        earliestStart,
        allowedTimes: allowedChain,
        placementWindowEnd: period.end,
      });
      occurrenceIds.add(id);
      occurrences.push({
        ...habit,
        id,
        parentId: null,
        isReady: true,
        deadline: period.end.toISOString(),
        // A habit can never legitimately carry a detour link, but a stale one
        // copied by the spread would make prepareCandidates' detour walk
        // exclude the linked target from independent candidacy.
        linkedItemId: null,
      });
    }
  }

  return { occurrences, occurrenceConstraints, occurrenceIds };
}
