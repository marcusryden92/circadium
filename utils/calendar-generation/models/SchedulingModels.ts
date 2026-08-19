/**
 * Scheduling Models
 *
 * Core interfaces and types for the scheduling system
 */

import {
  SimpleEvent,
  Planner,
  EventTemplate,
  Category,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  PlannerDependency,
} from "@/types/prisma";

import { SchedulingFailureReason } from "../constants";
import { PlaceableSlot } from "./TimeSlot";
import type { TravelShardSpan } from "../utils/timeSlotUtils";
import type { SchedulerRecorder } from "../helpers/Scheduler/SchedulerRecorder";
import type { PlannerSchedulingConstraints } from "../helpers/CalendarGenerator/buildPlannerConstraintsMap";
import type { PrecedenceEdge } from "@/utils/precedence/types";

/**
 * Result of a scheduling operation
 */
export interface SchedulingResult {
  /** Whether scheduling completed successfully */
  success: boolean;
  /** Generated calendar events */
  events: SimpleEvent[];
  /** List of tasks that couldn't be scheduled */
  failures: SchedulingFailure[];
  /** Performance and diagnostic metrics */
  metrics: SchedulingMetrics;
}

/**
 * Full output of the calendar generator orchestrator (CalendarGenerator).
 * Extends the inner scheduling pass result with the materialized category
 * occurrences (with trespass info) the engine writes for each regen.
 */
export interface CalendarGenerationResult extends SchedulingResult {
  /**
   * Materialized weekly category occurrences. Persisted alongside `events` —
   * renderer reads these to draw category wrappers. Empty when no scheduled
   * categories were configured.
   */
  categoryEvents: CategoryEvent[];
  /**
   * Materialized travel events between scheduled items. Persisted alongside
   * `events` — renderer reads these to draw travel blocks. Empty when travel
   * injection is disabled or no cross-location placements exist.
   */
  travelEvents: TravelEvent[];
  /**
   * Per-planner urgency score the engine computed for this regen. Keys are
   * planner ids; covers scheduling candidates plus every top-level
   * uncompleted goal so consumers can rank goals the scheduler skipped
   * (e.g. not-yet-ready ones). Ephemeral — not persisted to the DB.
   */
  plannerScores: Record<string, number>;
  /**
   * Structured, coalesced messages describing scheduling failures and
   * warnings. One row per (type, groupKey) after aggregation — e.g. 400
   * insufficient-travel instances on the same route collapse to a single
   * row with affectedCount and worst-case shortage. Persisted alongside
   * events for cross-session recall; the UI's engine console renders them.
   */
  messages: EngineMessage[];
}

/**
 * Details about a scheduling failure
 */
export interface SchedulingFailure {
  /** ID of the task that failed to schedule */
  taskId: string;
  /** Title of the task for easier debugging */
  taskTitle: string;
  /** Reason for failure */
  reason: SchedulingFailureReason;
  /** Human-readable details */
  details: string;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Metrics collected during scheduling
 */
export interface SchedulingMetrics {
  /** Total number of tasks attempted */
  tasksAttempted: number;
  /** Number of tasks successfully scheduled */
  tasksScheduled: number;
  /** Number of tasks that failed */
  tasksFailed: number;
  /** Number of goals processed */
  goalsProcessed: number;
  /** Total iterations used across all scheduling operations */
  totalIterations: number;
  /** Average time to schedule a task (in ms) */
  averageSchedulingTimeMs: number;
  /** Total execution time (in ms) */
  totalExecutionTimeMs: number;
  /** Number of template events generated */
  templateEventsGenerated: number;
  /** Time spent on template expansion (in ms) */
  templateExpansionTimeMs: number;
  /** Number of templates that failed to expand (incomplete data) */
  templatesFailed?: number;
}

/**
 * Context provided to scheduling strategies
 */
export interface SchedulingContext {
  /** Current date/time */
  currentDate: Date;
  /** User ID */
  userId: string;
  /** Week start day (0-6, Sunday-Saturday) */
  weekStartDay: number;
  /** All planner items for tree walks */
  allPlanners: Planner[];
  /** Already scheduled events */
  scheduledEvents: SimpleEvent[];
  /** Scheduling metrics (mutable, updated during scheduling) */
  metrics: SchedulingMetrics;
  /** Category constraints for time-based scheduling */
  categories?: Map<string, Category>;
  /** Effective planner -> location map */
  plannerLocationMap?: Map<string, string | null>;
  /** Effective planner -> categoryId map (resolved by walking up parent chain) */
  plannerCategoryMap?: Map<string, string | null>;
  /**
   * categoryId -> set of category ids whose windows that category's items may
   * occupy (itself + non-confined ancestors, up to a confineToOwnWindows
   * ceiling). Built once per pass from the full category list; the match sites
   * intersect against the window-bearing categories. See
   * buildCategoryEligibilityMap.
   */
  categoryEligibilityMap?: Map<string, Set<string>>;
  /**
   * plannerId -> resolved scheduling constraints (earliest start date +
   * allowed-times chain, own + inherited from ancestors). Only rows with an
   * actual constraint have an entry. See buildPlannerConstraintsMap.
   */
  plannerConstraintsMap?: Map<string, PlannerSchedulingConstraints>;
  /**
   * plannerId -> incoming precedence edges (queue order + dependencies) whose
   * transparency filtering already happened at build time. The placement gate
   * bounds each candidate to start after the max end across all placed
   * predecessors. See buildPrecedenceEdges / buildPredecessorMap.
   */
  predecessorMap?: Map<string, PrecedenceEdge[]>;
  /**
   * Optional per-task recorder for dynamic scheduling traces (mirrors the
   * staticEventTravelPass recorder). When attached, every scheduleTask
   * call appends a record describing the decision branching, actions
   * taken, and resulting slot state. No-op when null/undefined.
   */
  schedulerRecorder?: SchedulerRecorder | null;
  /**
   * Tail-buffer cutoff: dynamic placement is suppressed for slots starting
   * after this date. Set per-iteration by scheduleTasksAndGoals from
   * SCHEDULING_CONFIG.PLACEMENT_BUFFER_DAYS, so the next expansion's
   * static-pass resume has empty room at the seam to re-decide travel
   * placement without colliding with already-placed dynamic events.
   */
  placementCutoffDate?: Date | null;
  /** Same-duration swap pass after placement (flagged, default off) */
  polishPassEnabled?: boolean;
  /**
   * Previous regen's events by id. Event builders reuse identity fields
   * (extendedProps.id, createdAt, updatedAt) from here so an unchanged
   * placement diffs as a no-op instead of a fresh-uuid phantom update.
   */
  previousCalendarById?: Map<string, SimpleEvent>;
}

/**
 * A candidate time slot with its score
 */
export interface ScoredSlot {
  /** The time slot */
  slot: {
    start: Date;
    end: Date;
    durationMinutes: number;
  };
  /** The scored PlaceableSlot itself, so consumers avoid a re-find by time */
  source: PlaceableSlot;
  /** Combined score from all strategies */
  score: number;
  /** Individual scores from each strategy for debugging */
  strategyScores: Record<string, number>;
}

/**
 * Travel time entry for location-aware scheduling
 */
export interface TravelTimeEntry {
  fromLocationId: string;
  toLocationId: string;
  rushHourMinutes: number;
  regularMinutes: number;
  nightMinutes: number;
}

/**
 * Context for handling travel leg calculations
 */
export type TravelProcessingAction = {
  prevLocation: string;
  nextLocation: string;
  placeAtSlotStart: boolean;
  travelMinutes: number;
};

/**
 * Granular logging configuration
 */
export interface LoggingConfig {
  /** Log scheduling metrics */
  metrics?: boolean;
  /** Log scheduling failures */
  failures?: boolean;
  /** Log final events array */
  finalEvents?: boolean;
  /** Log travel calculation debug info */
  travelDebug?: boolean;
  /** Log template expansion info */
  templateInfo?: boolean;
  /** Log input planners */
  planners?: boolean;
  /** Log input templates */
  templates?: boolean;
  /** Log location map */
  locations?: boolean;
  /** Log strategy settings */
  strategySettings?: boolean;
  /** Log lean calendar (title, start, end, location) sorted by start */
  leanCalendar?: boolean;
  /**
   * Log a per-slot decision/action trail from staticEventTravelPass plus an
   * end-state snapshot of the timespan after each iteration. Filtered by
   * dateRangeStart / dateRangeEnd. Use this to trace where a faulty travel
   * item came from and what got rearranged or absorbed at each step.
   */
  staticEventTravelPass?: boolean;
  /**
   * Log a per-task decision/action trail from the dynamic scheduling pass
   * (the phase that places task events into slots, including travel
   * absorbing, gap reclaiming, and span removal). Same dateRangeStart /
   * dateRangeEnd filter applies. Use this to trace why a dynamic task
   * absorbed a travel it shouldn't have, or ended up in the wrong slot.
   */
  dynamicScheduling?: boolean;
  /**
   * Optional inclusive lower bound for event-based logs. Items whose start
   * is before this date are excluded. null/undefined means "no lower bound".
   */
  dateRangeStart?: Date | null;
  /**
   * Optional inclusive upper bound for event-based logs. Items whose start
   * is after this date are excluded. null/undefined means "no upper bound".
   */
  dateRangeEnd?: Date | null;
}

/**
 * Location grouping strategy score configuration
 */
export interface LocationGroupingScoresConfig {
  bothMatch?: number;
  oneMatchOneOpen?: number;
  oneMatch?: number;
  bothOpen?: number;
  oneOpenNoMatch?: number;
  neitherMatch?: number;
  noLocation?: number;
}

/**
 * Location grouping strategy penalty configuration
 */
export interface LocationGroupingPenaltiesConfig {
  singleTravelPenaltyScale?: number;
  doubleTravelPenaltyScale?: number;
}

/**
 * Configuration for calendar generation
 */
export interface CalendarGenerationConfig {
  /** Maximum iterations per task */
  maxIterationsPerTask?: number;
  /** Whether to enable detailed logging (master switch) */
  enableLogging?: boolean;
  /** Granular logging options (only used if enableLogging is true) */
  logging?: LoggingConfig;
  /** Buffer time between scheduled items in minutes */
  bufferTimeMinutes?: number;
  /** Strategy weights (for slot scoring, not task ordering) */
  strategyWeights?: {
    earliestSlot?: number;
    locationGrouping?: number;
    fitTightness?: number;
  };
  /** Location grouping strategy internal scores */
  locationGroupingScores?: LocationGroupingScoresConfig;
  /** Location grouping strategy penalties */
  locationGroupingPenalties?: LocationGroupingPenaltiesConfig;
  /** Travel time matrix for location-aware scheduling */
  travelTimeMatrix?: Map<string, TravelTimeEntry>;
  /** Whether to inject travel events between location changes */
  injectTravelEvents?: boolean;
  /** Same-duration swap pass after placement (flagged, default off) */
  polishPass?: boolean;
}

/**
 * Input for calendar generation
 */
export interface CalendarGenerationInput {
  /** User ID */
  userId: string;
  /** Week start day (0-6) */
  weekStartDay: number;
  /** Event templates */
  templates: EventTemplate[];
  /** Planner items (tasks, goals, plans) */
  planners: Planner[];
  /** Previous calendar events to preserve */
  previousCalendar: SimpleEvent[];
  /**
   * Previous engine messages, consulted at emit time to carry forward the
   * user-owned `dismissed` flag. A re-emit of an id whose prior row was
   * dismissed stays dismissed; a fresh id is naturally undismissed.
   */
  previousEngineMessages?: EngineMessage[];
  /** Optional configuration overrides */
  config?: CalendarGenerationConfig;
  /** Categories with time constraints */
  categories?: Category[];
  /** User-authored queues (pipes) — ordered precedence over root items */
  queues?: Queue[];
  /** Prerequisite edges between root items */
  dependencies?: PlannerDependency[];
  /**
   * Imported external-calendar events resolved to busy blocks (SimpleEvent
   * shape, eventType external). They join the fixed-event fabric so slots are
   * carved around them, and are filtered back out of the persisted output at
   * final assembly — never memoized, never synced.
   */
  externalBusyEvents?: SimpleEvent[];
  /**
   * Logged occurrence completions. Each row marks one period of a recurring
   * task (or one leaf-period of a recurring goal) as done:
   * expandRecurringItems skips that period (never re-schedules it) and
   * buildOccurrenceCompletedEvents freezes it at its logged window. Plan
   * check-off rows ride the same log but never touch scheduling. Derived
   * fresh per run from the occurrenceCompletions Redux slice, outside the OCC
   * diff sync.
   */
  occurrenceCompletions?: OccurrenceCompletionInput[];
}

/**
 * One logged completion of an occurrence, keyed by (plannerId, occurrenceKey)
 * — the composite that also forms its event id `${plannerId}|${occurrenceKey}`.
 * start/end are the window it was done in.
 */
export interface OccurrenceCompletionInput {
  plannerId: string;
  occurrenceKey: string;
  start: string;
  end: string;
}

export interface StrategyConfig {
  travelTimeMatrix?: Map<string, TravelTimeEntry>;
  strategyWeights?: {
    earliestSlot?: number;
    locationGrouping?: number;
    fitTightness?: number;
  };
  locationGroupingScores?: LocationGroupingScoresConfig;
  locationGroupingPenalties?: LocationGroupingPenaltiesConfig;
}

export interface FindValidSlotsResult {
  validSlots: PlaceableSlot[];
  fittingSlots: PlaceableSlot[];
  taskLocationId: string | null | undefined;
  constraintForTask: Category | undefined;
  /**
   * The lower placement bound the candidates were clipped to:
   * max(afterTime, inherited earliestStartDate, currentDate). Threaded into
   * selectBestSlot so absorb/reclaim back-extension can be validated against
   * the same bound instead of being skipped wholesale.
   */
  effectiveAfter: Date;
  /**
   * True when the search window this call scanned already reached past the
   * last built slot (or was uncapped) — a wider tier of the search ladder
   * would return a byte-identical candidate set, so the caller must stop
   * escalating instead of re-scanning the same fabric.
   */
  windowCoversFabric: boolean;
}

/**
 * Dynamic chunk sizing for split-task placement. When present, the pipeline
 * fit-tests slots at minMinutes and lets `grant` decide the actual reserved
 * duration from the selected slot's headroom — so chunk sizes derive from the
 * calendar's real geometry instead of a fixed block size.
 */
export interface ChunkSizing {
  /** Smallest chunk this placement may reserve; slots are fit-tested at this size. */
  minMinutes: number;
  /**
   * Decides the reserved minutes for a slot that fit. Receives the largest
   * task-minutes the slot can host (capacity minus travel and buffers) and
   * the remaining day-cap budget for the slot's day (Infinity when uncapped).
   * Returning 0 rejects the slot and selection moves to the next candidate.
   */
  grant: (headroomMinutes: number, dayBudgetMinutes: number) => number;
  /**
   * Remaining day-cap minutes for the local day a slot starts on. Slots whose
   * day budget is below minMinutes are skipped outright.
   */
  dayBudget?: (slotStart: Date) => number;
}

export interface SlotSelectionResult {
  selectedSlot: PlaceableSlot;
  travelBefore: number;
  travelAfter: number;
  reusableTravelStart: Date | null;
  taskLocationId: string | null | undefined;
  /**
   * The full span of the outbound travel from a prior unit that this
   * placement will absorb (remove and back-extend into). Null when no
   * absorb applies. Carries the travelId so downstream removal is by
   * identity, not by heuristic time search.
   */
  absorbableTravel: TravelShardSpan | null;
  reclaimPrecedingGapTravel: TravelShardSpan | null;
  /**
   * An inbound travel to this task's own location sitting immediately after
   * the slot — the travel-before of a following same-location placement whose
   * origin (the slot's phantom nextLocationId) is only there because that leg
   * exists. The task delivers the user to the shared location, so the leg is
   * redundant: no travel-after is emitted and this span is removed at
   * reservation, collapsing an otherwise pointless L -> X -> L round trip.
   */
  removableFollowingInbound: TravelShardSpan | null;
  /**
   * An outbound travel departing FROM the slot's boundary location toward a
   * third location, sitting flush after the slot (a static-pass leg toward
   * the next fixed obligation). A task at a different location placed in the
   * slot makes the leg's origin stale: instead of returning to the boundary
   * to catch it, travel-after goes DIRECT to the leg's destination. The old
   * span is removed at reservation and the slot's tail extends over it.
   */
  reroutableFollowingOutbound: TravelShardSpan | null;
  /**
   * Whether the placement back-extends into the freed travel span (the
   * historical absorb/reclaim behavior). False when a constraint boundary
   * (allowed times / earliest start / chain bound) sits inside the freed
   * region: the redundant travel is still removed, but the task keeps the
   * candidate slot's clipped start and the freed span stays free time.
   */
  slideIntoFreedTravel: boolean;
  /**
   * Minutes the reservation will actually occupy. Equals task.duration for
   * plain placements; for chunked placements it is what ChunkSizing.grant
   * returned for the selected slot.
   */
  grantedDurationMinutes: number;
}

export interface ReservationResult {
  taskStartDate: Date;
  taskEndDate: Date;
}

/**
 * Expanded result with diagnostics
 */
export interface DetailedSchedulingResult extends SchedulingResult {
  /** Warnings that don't prevent scheduling but should be noted */
  warnings: string[];
  /** Debug information (only in development) */
  debug?: {
    slotCounts: Record<string, number>;
    strategyDecisions: Array<{
      taskId: string;
      chosenSlot: Date;
      scores: Record<string, number>;
    }>;
  };
}
