/**
 * Initial Event Array Builder
 *
 * Builds the initial event array with memoized, plan, and completed items
 */

import { Planner, SimpleEvent } from "@/types/prisma";
import {
  buildMemoizedEvents,
  buildPlanEvents,
  buildCompletedEvents,
  buildHabitCompletedEvents,
} from "../EventAssembler";
import { taskIsSplittable } from "../../../taskSplitting";
import { HabitCompletionInput } from "../../models/SchedulingModels";

export function buildInitialEventArray(
  userId: string,
  planners: Planner[],
  previousCalendar: SimpleEvent[],
  currentDate: Date,
  habitCompletions: HabitCompletionInput[],
): {
  eventArray: SimpleEvent[];
  memoizedEventIds: Set<string>;
  previousById: Map<string, SimpleEvent>;
} {
  const eventArray: SimpleEvent[] = [];

  // Previous emits by id — event builders reuse identity fields from here so
  // an unchanged row diffs as a no-op (see stabilizeEvent).
  const previousById = new Map<string, SimpleEvent>(
    previousCalendar.map((e) => [e.id, e]),
  );

  const splitPlannerIds = new Set(
    planners.filter(taskIsSplittable).map((p) => p.id),
  );

  const { events: memoizedEvents, eventIds: memoizedEventIds } =
    buildMemoizedEvents(previousCalendar, currentDate, splitPlannerIds);

  eventArray.push(...memoizedEvents);

  const planEvents = buildPlanEvents(
    userId,
    planners,
    memoizedEventIds,
    previousById,
    currentDate,
  );
  eventArray.push(...planEvents);

  const completedEvents = buildCompletedEvents(
    userId,
    planners,
    memoizedEventIds,
    previousById,
  );
  eventArray.push(...completedEvents);

  const habitCompletedEvents = buildHabitCompletedEvents(
    userId,
    planners,
    habitCompletions,
    previousById,
  );
  eventArray.push(...habitCompletedEvents);

  return { eventArray, memoizedEventIds, previousById };
}
