/**
 * Scheduling Context Preparation
 *
 * Prepares the context object for scheduling
 */

import { Planner, SimpleEvent, Category } from "@/types/prisma";
import { WeekDayIntegers } from "@/types/calendarTypes";
import {
  SchedulingContext,
  SchedulingMetrics,
} from "../../models/SchedulingModels";
import { SchedulerRecorder } from "../Scheduler/SchedulerRecorder";
import { PlannerSchedulingConstraints } from "./buildPlannerConstraintsMap";
import type { PrecedenceEdge } from "@/utils/precedence/types";

export function prepareSchedulingContext(
  userId: string,
  currentDate: Date,
  weekStartDay: WeekDayIntegers,
  allPlanners: Planner[],
  scheduledEvents: SimpleEvent[],
  metrics: SchedulingMetrics,
  scheduledCategories: Category[],
  plannerLocationMap: Map<string, string | null>,
  plannerCategoryMap: Map<string, string | null>,
  categoryEligibilityMap: Map<string, Set<string>>,
  plannerConstraintsMap: Map<string, PlannerSchedulingConstraints>,
  predecessorMap: Map<string, PrecedenceEdge[]>,
  schedulerRecorder: SchedulerRecorder | null,
  previousCalendarById?: Map<string, SimpleEvent>,
): SchedulingContext {
  const categoryById = new Map<string, Category>(
    scheduledCategories.map((c) => [c.id, c]),
  );

  return {
    currentDate,
    userId,
    weekStartDay,
    allPlanners,
    scheduledEvents,
    metrics,
    categories: categoryById,
    plannerLocationMap,
    plannerCategoryMap,
    categoryEligibilityMap,
    plannerConstraintsMap,
    predecessorMap,
    schedulerRecorder,
    previousCalendarById,
  };
}
