/**
 * CalendarGenerator
 *
 * Main orchestrator for calendar generation.
 * Delegates to specialized subfunctions for each phase.
 */

import { WeekDayIntegers } from "@/types/calendarTypes";
import { Category } from "@/types/prisma";
import { TimeSlotManager } from "./TimeSlotManager";
import { TravelManager } from "./TravelManager";
import { Scheduler } from "./Scheduler";
import { CompositeStrategy } from "../strategies/SchedulingStrategy";
import {
  CalendarGenerationInput,
  CalendarGenerationResult,
  SchedulingMetrics,
} from "../models/SchedulingModels";
import { SCHEDULING_CONFIG, SchedulingFailureReason } from "../constants";
import {
  validateInput,
  buildInitialEventArray,
  expandTemplates,
  expandHabits,
  buildLocationMap,
  buildPlannerCategoryMap,
  buildCategoryEligibilityMap,
  buildPlannerConstraintsMap,
  prepareSchedulingContext,
  buildSchedulingStrategy,
  prepareCandidates,
  assembleFinalEvents,
  buildLoggingLookups,
  emitDebugLog,
  buildEngineMessages,
} from "../helpers/CalendarGenerator";
import {
  buildPrecedenceEdges,
  buildPredecessorMap,
} from "../helpers/Scheduler/precedenceEdges";
import { buildLeafGraph } from "../helpers/Scheduler/buildLeafGraph";
import {
  scoreCandidatesAndRootGoals,
  computeUrgencyScores,
  computeEffectiveScores,
} from "../helpers/PrioritySorter";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import {
  buildAvailableSlots,
  dropPastAvailableSlots,
  deriveSchedulingHorizon,
} from "../helpers/TimeSlotManager";
import {
  staticEventTravelPass,
  TravelPassRecorder,
} from "../helpers/TravelManager";
import { SchedulerRecorder } from "../helpers/Scheduler/SchedulerRecorder";
import { setTimeOnDate } from "@/utils/calendarUtils";
import { getRootParentId } from "@/utils/goalPageHandlers";

export class CalendarGenerator {
  // Class instances
  private readonly timeSlotManager: TimeSlotManager;
  private readonly travelManager: TravelManager;
  private readonly strategy: CompositeStrategy;

  // Config derived from input
  private readonly currentDate: Date;
  private readonly bufferTimeMinutes: number;
  private readonly enableLogging: boolean;
  private readonly scheduledCategories: Category[];

  // Mutable state
  private metrics: SchedulingMetrics;
  private travelPassRecorder: TravelPassRecorder | null = null;
  private schedulerRecorder: SchedulerRecorder | null = null;

  constructor(
    private readonly weekStartDay: WeekDayIntegers,
    private readonly input: CalendarGenerationInput,
  ) {
    this.currentDate = new Date();
    this.bufferTimeMinutes = input.config?.bufferTimeMinutes ?? 0;
    this.enableLogging = input.config?.enableLogging ?? false;
    // A category enters the scheduler only when it both opts into windows
    // (useTimeWindows) and actually has at least one window. Either condition
    // failing means the category is purely for classification — its location
    // inheritance still applies (via input.categories elsewhere), but its
    // windows / strictness do not constrain scheduling.
    this.scheduledCategories = (input.categories ?? []).filter(
      (c) => c.useTimeWindows && c.timeSlots.length > 0,
    );

    this.timeSlotManager = new TimeSlotManager(
      this.currentDate,
      this.bufferTimeMinutes,
    );
    this.travelManager = new TravelManager(
      this.timeSlotManager,
      this.bufferTimeMinutes,
      input.config?.travelTimeMatrix,
    );
    this.strategy = buildSchedulingStrategy({
      travelTimeMatrix: input.config?.travelTimeMatrix,
      strategyWeights: input.config?.strategyWeights,
      locationGroupingScores: input.config?.locationGroupingScores,
      locationGroupingPenalties: input.config?.locationGroupingPenalties,
    });

    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Generate calendar from input
   */
  generate(): CalendarGenerationResult {
    const startTime = performance.now();
    const {
      input,
      timeSlotManager,
      travelManager,
      strategy,
      currentDate,
      weekStartDay,
      enableLogging,
    } = this;

    // Phase 1: Validation
    const validation = validateInput(input);
    if (!validation.isValid) {
      return {
        success: false,
        events: [],
        categoryEvents: [],
        travelEvents: [],
        plannerScores: {},
        messages: [],
        failures: validation.failures,
        metrics: this.metrics,
      };
    }

    // Single urgency-score pass: covers scheduler candidates AND every
    // top-level uncompleted goal. Same denominator (sum of all planner
    // durations) so the scheduler's sort is unchanged, and downstream
    // consumers (dashboard, etc.) read scores for goals the scheduler
    // intentionally skipped without recomputing.
    const urgencyScores = scoreCandidatesAndRootGoals(
      input.planners,
      currentDate,
    );

    // Phase 1b: Expand habits into per-period occurrence candidates and score
    // them on the SAME urgency scale as tasks/goals (deadline = period end, so
    // an occurrence competes harder as its window closes). Denominator stays
    // the base planner durations so existing task/goal urgency is unchanged.
    // From here `schedulingPlanners` (base + occurrences) is what every
    // scheduling-phase tree walk reads; the occurrences never touch the fabric
    // (Phase 2), precedence, or the persisted planner rows.
    const habitExpansion = expandHabits({
      planners: input.planners,
      completions: input.habitCompletions ?? [],
      currentDate,
      horizonDays: SCHEDULING_CONFIG.HABIT_HORIZON_DAYS,
    });
    const hasHabitOccurrences = habitExpansion.occurrences.length > 0;
    if (hasHabitOccurrences) {
      const occurrenceScores = computeUrgencyScores(
        input.planners,
        habitExpansion.occurrences,
        currentDate,
      );
      for (const [id, score] of occurrenceScores) urgencyScores.set(id, score);
    }
    const schedulingPlanners = hasHabitOccurrences
      ? [...input.planners, ...habitExpansion.occurrences]
      : input.planners;

    // Phase 2: Build initial event array (memoized, plans, completed,
    // completed-habit occurrences). Occurrence CANDIDATES are not fabric; only
    // COMPLETED occurrences (frozen tiles) join the event array here.
    const { eventArray, memoizedEventIds, previousById } =
      buildInitialEventArray(
        input.userId,
        input.planners,
        input.previousCalendar,
        currentDate,
        input.habitCompletions ?? [],
      );

    // Phase 3: Expand templates
    const {
      filteredEvents,
      recurringTemplateEvents,
      perTemplateMasks,
      largestTemplateGap,
      updatedMetrics,
    } = expandTemplates(
      input.userId,
      eventArray,
      input.templates,
      weekStartDay,
      currentDate,
      enableLogging && !!input.config?.logging?.templateInfo,
      this.metrics,
    );

    this.metrics = updatedMetrics;

    // Imported external busy blocks join the fixed-event fabric here — after
    // template expansion, before slot building — so both the initial slot
    // carve and every horizon expansion (which reads context.scheduledEvents)
    // treat them as occupied time. assembleFinalEventList filters them back
    // out so they never reach the persisted engine output.
    const fabricEvents =
      input.externalBusyEvents && input.externalBusyEvents.length > 0
        ? [...filteredEvents, ...input.externalBusyEvents]
        : filteredEvents;

    // Phase 4: Build location map + effective category map (planner -> categoryId
    // resolved by walking up the parent chain). Both are read-only derivations
    // off the planners + categories and have no dependency on the slot array
    // or the travel pass — they belong here, next to each other, before the
    // slot pipeline kicks in.
    const plannerLocationMap = buildLocationMap(
      schedulingPlanners,
      input.templates,
      input.categories || [],
    );
    const plannerCategoryMap = buildPlannerCategoryMap(schedulingPlanners);
    // Eligibility uses the FULL category list (not just scheduledCategories) so
    // the parent chain can be walked through classification-only ancestors.
    const categoryEligibilityMap = buildCategoryEligibilityMap(
      input.categories ?? [],
    );
    // Per-planner scheduling constraints (earliest start + allowed times),
    // resolved down the tree so goal leaves inherit their ancestors' bounds.
    // Habit occurrences supply their own entry (with placementWindowEnd, which
    // is not column-derivable) — merged in after the column-derived pass.
    const plannerConstraintsMap = buildPlannerConstraintsMap(input.planners);
    for (const [id, constraints] of habitExpansion.occurrenceConstraints) {
      plannerConstraintsMap.set(id, constraints);
    }
    // Precedence edges (queue order + dependency prerequisites), transparency
    // already applied — the third sibling map. The placement gate reads the
    // predecessor grouping off the scheduling context.
    const precedenceEdges = buildPrecedenceEdges(
      input.queues ?? [],
      input.dependencies ?? [],
      input.planners,
    );
    const predecessorMap = buildPredecessorMap(precedenceEdges);

    // Priority inheritance: a prerequisite inherits the max score of everything
    // downstream that needs it, so the candidate sort places a high-priority
    // chain's low-scored prerequisites among high-priority work. Raw urgency
    // still feeds plannerScores (dashboard); only the scheduler's ordering uses
    // the inherited scores. Node-level dependency edges are lifted to their
    // structural-root pairs here — urgency is root-keyed (root urgency only in
    // v1), and the leaf-level lift in buildLeafGraph handles the fine grain.
    const rootLiftedEdges = precedenceEdges
      .map((edge) => ({
        fromId: getRootParentId(input.planners, edge.fromId) ?? edge.fromId,
        toId: getRootParentId(input.planners, edge.toId) ?? edge.toId,
      }))
      .filter((edge) => edge.fromId !== edge.toId);
    const effectiveScores = computeEffectiveScores(
      urgencyScores,
      rootLiftedEdges,
    );

    // Phase 6a: Build available slots over the full scheduling timeline
    const schedulingStartDate = setTimeOnDate(currentDate, "00:00");
    const builtSlots = buildAvailableSlots({
      startDate: schedulingStartDate,
      existingEvents: fabricEvents,
      templateMasks: perTemplateMasks,
      categories: this.scheduledCategories,
      plannerLocationMap,
      enableLogging,
    });

    // Phase 6b: Place travel slots (separate pass after slot building).
    // Load built slots into the manager's unified storage, then run the pass
    // which mutates the slots array in place via splice. Trespass markers
    // are set directly on CategorySlot fragments and read downstream from
    // the slot array — no side-channel.
    timeSlotManager.slots = [...builtSlots];

    const loggingConfig = input.config?.logging;
    const loggingLookups = buildLoggingLookups(
      this.scheduledCategories,
      fabricEvents,
    );
    const travelPassRecorder = new TravelPassRecorder({
      enabled: enableLogging && !!loggingConfig?.staticEventTravelPass,
      rangeStart: loggingConfig?.dateRangeStart ?? null,
      rangeEnd: loggingConfig?.dateRangeEnd ?? null,
      lookups: loggingLookups,
    });
    this.travelPassRecorder = travelPassRecorder;

    travelPassRecorder.startPass("preliminary");
    staticEventTravelPass(
      !!plannerLocationMap,
      this.scheduledCategories,
      timeSlotManager.slots,
      travelManager,
      travelPassRecorder,
    );

    // Phase 6c: Drop available slots ending before "now" so the scheduler
    // doesn't place tasks in the past.
    timeSlotManager.slots = dropPastAvailableSlots(
      timeSlotManager.slots,
      currentDate,
    );

    // Phase 7: Build the dynamic scheduling recorder. Same filter pattern as
    // travelPassRecorder — off by default, scoped to the configured date
    // range. Each scheduleTask call appends a record.
    const schedulerRecorder = new SchedulerRecorder({
      enabled: enableLogging && !!loggingConfig?.dynamicScheduling,
      rangeStart: loggingConfig?.dateRangeStart ?? null,
      rangeEnd: loggingConfig?.dateRangeEnd ?? null,
      lookups: loggingLookups,
    });
    this.schedulerRecorder = schedulerRecorder;

    // Phase 8: Prepare scheduling context
    const context = prepareSchedulingContext(
      input.userId,
      currentDate,
      weekStartDay,
      schedulingPlanners,
      fabricEvents,
      this.metrics,
      this.scheduledCategories,
      plannerLocationMap,
      plannerCategoryMap,
      categoryEligibilityMap,
      plannerConstraintsMap,
      predecessorMap,
      schedulerRecorder,
      previousById,
    );

    // Phase 9: Prepare candidates (filter root goals, tasks and sort by
    // priority). Sorts on the inheritance-adjusted scores so a prerequisite
    // rides its dependents' urgency.
    const candidates = prepareCandidates(
      schedulingPlanners,
      memoizedEventIds,
      effectiveScores,
      plannerCategoryMap,
      currentDate,
      plannerConstraintsMap,
    );

    // Phase 10: Build the leaf precedence graph (detour-spliced sequences +
    // queue/dependency edges + leaf-level inheritance) and schedule.
    const leafGraph = buildLeafGraph(
      candidates,
      schedulingPlanners,
      memoizedEventIds,
      precedenceEdges,
      urgencyScores,
    );

    const scheduler = new Scheduler(
      timeSlotManager,
      travelManager,
      strategy,
      context,
    );

    const schedulingResult = scheduler.scheduleTasksAndGoals(
      schedulingPlanners,
      candidates,
      memoizedEventIds,
      perTemplateMasks,
      plannerLocationMap,
      this.scheduledCategories,
      leafGraph,
      travelPassRecorder,
    );

    // Phase 11: Assemble final events.
    const schedulingEndDate = deriveSchedulingHorizon(
      timeSlotManager.slots,
      schedulingStartDate,
    );
    const {
      events: allEvents,
      categoryEvents,
      travelEvents,
    } = assembleFinalEvents(
      input.userId,
      travelManager,
      context,
      this.scheduledCategories,
      schedulingStartDate,
      schedulingEndDate,
      plannerLocationMap,
      timeSlotManager.slots,
      input.config?.logging,
    );

    // Update metrics
    const endTime = performance.now();
    this.metrics.totalExecutionTimeMs = endTime - startTime;
    const schedulerMetrics = scheduler.getMetrics();
    this.metrics.tasksAttempted = schedulerMetrics.tasksAttempted;
    this.metrics.tasksScheduled = schedulerMetrics.tasksScheduled;
    this.metrics.tasksFailed = schedulerMetrics.tasksFailed;
    this.metrics.totalIterations = schedulerMetrics.totalIterations;
    this.metrics.averageSchedulingTimeMs =
      schedulerMetrics.averageSchedulingTimeMs;

    if (enableLogging) {
      emitDebugLog(input, travelManager, {
        allEvents,
        recurringTemplateEvents,
        perTemplateMasks,
        largestTemplateGap,
        plannerLocationMap,
        strategy,
        schedulingResult,
        metrics: this.metrics,
        travelPassRecorder: this.travelPassRecorder,
        schedulerRecorder: this.schedulerRecorder,
      });
    }

    // Habit-occurrence failures never surface as-is: a NO_SLOTS "miss" is
    // expected (the absence of a completion for an elapsed period is a "missed"
    // window in the stats, not an error), and a structural failure (TOO_LARGE /
    // IMPOSSIBLE_CONSTRAINTS — a window smaller than the duration, or allowed
    // times that never meet the category windows) is remapped to the habit row
    // so it coalesces to ONE message per habit, not one per occurrence.
    const occurrenceIds = habitExpansion.occurrenceIds;
    const habitsById = new Map(input.planners.map((p) => [p.id, p] as const));
    const failures = schedulingResult.failures
      .filter(
        (f) =>
          !(
            occurrenceIds.has(f.taskId) &&
            f.reason === SchedulingFailureReason.NO_SLOTS
          ),
      )
      .map((f) => {
        if (!occurrenceIds.has(f.taskId)) return f;
        const habitId = plannerIdFromEventId(f.taskId);
        return {
          ...f,
          taskId: habitId,
          taskTitle: habitsById.get(habitId)?.title ?? f.taskTitle,
        };
      });

    // Phase 12: Emit engine messages. Per-type emit functions produce
    // already-coalesced rows (one per unique identity tuple), and the prior
    // messages array is consulted to carry forward the user-owned
    // `dismissed` flag by id.
    const messages = buildEngineMessages(
      input.userId,
      failures,
      travelEvents,
      input.planners,
      allEvents,
      currentDate,
      input.previousEngineMessages ?? [],
      schedulingResult.splitRelaxations,
      schedulingResult.goalCapRelaxations,
      schedulingResult.sequenceBreaks,
    );

    return {
      success: failures.length === 0,
      events: allEvents,
      categoryEvents,
      travelEvents,
      plannerScores: Object.fromEntries(
        [...urgencyScores].filter(([id]) => !occurrenceIds.has(id)),
      ),
      messages,
      failures,
      metrics: this.metrics,
    };
  }

  private createEmptyMetrics(): SchedulingMetrics {
    return {
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

  getMetrics(): SchedulingMetrics {
    return { ...this.metrics };
  }
}
