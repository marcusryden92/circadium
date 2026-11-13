/**
 * Scheduler
 *
 * Core scheduling engine that places tasks into time slots using strategies.
 * Delegates to specialized subfunctions for each phase.
 */

import { Planner, SimpleEvent, Category } from "@/types/prisma";
import { TimeSlotManager } from "./TimeSlotManager";
import { TravelManager } from "./TravelManager";
import { SchedulingStrategy } from "../strategies/SchedulingStrategy";
import {
  ChunkSizing,
  SchedulingContext,
  SchedulingResult,
  SchedulingFailure,
  SchedulingMetrics,
} from "../models/SchedulingModels";
import { PerTemplateMask } from "../models/TemplateModels";
import { scheduleTask } from "../helpers/Scheduler/scheduleTask";
import { scheduleTasks } from "../helpers/Scheduler/scheduleTasks";
import { scheduleTasksAndGoals } from "../helpers/Scheduler/scheduleTasksAndGoals";
import type { LeafGraph } from "../helpers/Scheduler/buildLeafGraph";
import type { SplitRelaxation } from "../helpers/Scheduler/scheduleSplitTask";
import type { GoalCapRelaxation } from "../helpers/Scheduler/goalDayCap";
import type { SequenceBreak } from "../helpers/Scheduler/precedenceGate";
import { TravelPassRecorder } from "../helpers/TravelManager/TravelPassRecorder";

export class Scheduler {
  public readonly slotManager: TimeSlotManager;
  public readonly travelManager: TravelManager;
  public readonly strategy: SchedulingStrategy;
  public readonly context: SchedulingContext;
  private metrics: SchedulingMetrics = {
    tasksAttempted: 0,
    tasksScheduled: 0,
    tasksFailed: 0,
    goalsProcessed: 0,
    totalIterations: 0,
    averageSchedulingTimeMs: 0,
    totalExecutionTimeMs: 0,
    templateEventsGenerated: 0,
    templateExpansionTimeMs: 0,
    templatesFailed: 0,
  };

  constructor(
    slotManager: TimeSlotManager,
    travelManager: TravelManager,
    strategy: SchedulingStrategy,
    context: SchedulingContext,
  ) {
    this.slotManager = slotManager;
    this.travelManager = travelManager;
    this.strategy = strategy;
    this.context = context;
  }

  /**
   * Schedule a single task
   * Travel is stored as occupied slots, not SimpleEvents - they get converted at the end
   */
  scheduleTask(
    task: Planner,
    afterTime?: Date,
    sizing?: ChunkSizing,
  ): { success: boolean; event?: SimpleEvent; failure?: SchedulingFailure } {
    const startTime = performance.now();
    this.metrics.tasksAttempted++;

    const result = scheduleTask(
      task,
      this.slotManager,
      this.travelManager,
      this.strategy,
      this.context,
      afterTime,
      sizing,
    );

    if (!result.success) {
      this.metrics.tasksFailed++;
    } else {
      const endTime = performance.now();
      const schedulingTime = endTime - startTime;

      this.metrics.tasksScheduled++;
      this.metrics.totalIterations++;

      const totalTime =
        this.metrics.averageSchedulingTimeMs *
          (this.metrics.tasksScheduled - 1) +
        schedulingTime;
      this.metrics.averageSchedulingTimeMs =
        totalTime / this.metrics.tasksScheduled;
    }

    return result;
  }

  scheduleTasksAndGoals(
    allPlanners: Planner[],
    candidates: Planner[],
    memoizedEventIds: Set<string>,
    perTemplateMasks: PerTemplateMask[],
    plannerLocationMap: Map<string, string | null>,
    categories: Category[],
    leafGraph: LeafGraph,
    travelPassRecorder?: TravelPassRecorder,
  ): {
    success: boolean;
    newEvents: SimpleEvent[];
    failures: SchedulingFailure[];
    splitRelaxations: SplitRelaxation[];
    goalCapRelaxations: GoalCapRelaxation[];
    sequenceBreaks: SequenceBreak[];
  } {
    return scheduleTasksAndGoals(
      this,
      allPlanners,
      candidates,
      memoizedEventIds,
      perTemplateMasks,
      plannerLocationMap,
      categories,
      leafGraph,
      travelPassRecorder,
    );
  }

  /**
   * Schedule multiple tasks
   */
  scheduleTasks(tasks: Planner[]): SchedulingResult {
    return scheduleTasks(
      tasks,
      this.slotManager,
      this.travelManager,
      this.strategy,
      this.context,
      () => this.getMetrics(),
    );
  }

  /**
   * Get current metrics
   */
  getMetrics(): SchedulingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      tasksAttempted: 0,
      tasksScheduled: 0,
      tasksFailed: 0,
      goalsProcessed: 0,
      totalIterations: 0,
      averageSchedulingTimeMs: 0,
      totalExecutionTimeMs: 0,
      templateEventsGenerated: 0,
      templateExpansionTimeMs: 0,
      templatesFailed: 0,
    };
  }
}
