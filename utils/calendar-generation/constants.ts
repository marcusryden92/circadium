/**
 * Calendar Generation Constants
 *
 * Centralized constants for calendar generation algorithms.
 * Extracting these makes the code more maintainable and easier to tune.
 */

/**
 * Weekday definitions
 */
export const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

export const WEEKDAY_NAMES: readonly string[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * Time-based constants
 */
export const TIME_CONSTANTS = {
  /** Milliseconds in one second */
  MS_PER_SECOND: 1000,
  /** Milliseconds in one minute */
  MS_PER_MINUTE: 60 * 1000,
  /** Milliseconds in one hour */
  MS_PER_HOUR: 60 * 60 * 1000,
  /** Milliseconds in one day */
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  /** Milliseconds in one week */
  MS_PER_WEEK: 7 * 24 * 60 * 60 * 1000,
  /** Minutes in one hour */
  MINUTES_PER_HOUR: 60,
  /** Minutes in one day */
  MINUTES_PER_DAY: 24 * 60,
  /** Minutes in one week */
  MINUTES_PER_WEEK: 7 * 24 * 60,
  /** Seconds in one minute */
  SECONDS_PER_MINUTE: 60,
} as const;

// The slot fabric is built in fixed HORIZON_CHUNK_DAYS chunks: an initial chunk
// from today, then one more chunk per expansion. Expansion continues on demand
// until every placeable item is scheduled (see scheduleTasksAndGoals). The
// per-item slot finder scans the whole materialized fabric (bounded only by the
// placement cutoff), so it can never fail to see slots expansion has already
// built — that is the fix for items silently failing at a fixed look-ahead cap.
const HORIZON_CHUNK_DAYS = 28;

/**
 * Scheduling algorithm configuration
 */
export const SCHEDULING_CONFIG = {
  /** Maximum number of iterations to prevent infinite loops */
  MAX_ITERATIONS: 10000,
  /**
   * The maximum scheduling horizon, expressed as expansion iterations: the loop
   * expands on demand up to MAX_HORIZON_EXPANSIONS x HORIZON_CHUNK_DAYS (~2
   * years) before giving up. This is a real ceiling, not just a runaway guard —
   * scheduling something years out would march the horizon over many O(fabric)
   * passes AND materialize years of background/travel events, so an item that
   * can't be reached within it (e.g. an earliestStartDate far out) fails loudly
   * instead. Per-run worst case stays a few hundred ms in the worker.
   */
  MAX_HORIZON_EXPANSIONS: 30,
  /**
   * First rung of the slot-search window ladder (days from a task's effective
   * earliest start). scheduleTask escalates NEAR -> WIDE -> uncapped: a tier
   * whose candidates are geometrically absent OR all rejected at selection
   * (capacity + travel, day budgets) hands off to the next, so a nearer
   * usable slot is always preferred over a farther one — past ~two weeks the
   * earliest-slot score saturates and an uncapped scan would let
   * location-grouping alone pick a slot months beyond the nearest fit — while
   * escalation on selection failure prevents the starvation where a non-empty
   * near window is entirely unusable and horizon expansion can never change
   * its content. Escalation stops early when a tier's window already covered
   * the whole built fabric (a wider scan would be byte-identical). A soft
   * preference ladder, never a hard cap: no slot is ever hidden.
   */
  SLOT_SEARCH_NEAR_WINDOW_DAYS: 90,
  /** Second rung of the slot-search window ladder (see NEAR above). */
  SLOT_SEARCH_WIDE_WINDOW_DAYS: 360,
  /** Minimum slot size in minutes to consider */
  MIN_SLOT_SIZE: 5,
  /** Buffer time between events in minutes */
  BUFFER_TIME_MINUTES: 0,
  /** Time window (ms) for matching adjacent travel slots (3 hours) */
  TRAVEL_SEARCH_WINDOW_MS: 3 * 60 * 60 * 1000,
  /** Time window (ms) for adjacent travel search including tolerance (buffer + 10 min) */
  ADJACENT_TRAVEL_TOLERANCE_MS: 10 * 60 * 1000,
  /**
   * Fixed horizon for slot generation. The initial build covers this many
   * days from the current date; each subsequent expansion appends another
   * chunk of the same size from the isFinal pickup point. Plans further out
   * are deliberately ignored until expansion reaches them, so a single
   * Plan a year away doesn't balloon the initial slot array.
   */
  HORIZON_CHUNK_DAYS,
  /**
   * Available-slot count threshold for proactive expansion. When the slot
   * array drops below this many Available slots, scheduleTasksAndGoals
   * triggers expandSlots before attempting the next candidate, instead of
   * waiting for placement failures to fire the reactive backstop.
   */
  LOW_SLOT_WATERMARK: 100,
  /**
   * Tail buffer (days) at the trailing edge of the slot horizon where dynamic
   * placement is suppressed. The slot finder filters out slots starting past
   * (last placeable slot end - this many days). The buffer gives the next
   * expansion's static-pass resume room to re-decide travel placement at the
   * seam without colliding with already-placed dynamic events.
   */
  PLACEMENT_BUFFER_DAYS: 3,
  /**
   * How far ahead recurring-item occurrences are enumerated as scheduling
   * candidates. Kept at or below the initial slot horizon
   * (HORIZON_CHUNK_DAYS) so every occurrence's placement window is already
   * materialized on the first slot build — an occurrence that can't place in
   * an already-materialized window is a genuine "missed" window (a silent
   * skip), never a trigger for horizon expansion it can't benefit from.
   */
  RECURRENCE_HORIZON_DAYS: 14,
  /**
   * Earliest-deadline-first tier (see compareSchedulingOrder): items whose
   * own-or-inherited deadline falls within EDF_HORIZON_DAYS sort by slack
   * (time to deadline minus required placement block) ascending — above the
   * score tier, below the category-constrained tier — so a task due tomorrow
   * is never out-prioritized by deadline-free higher-priority work. Recurring
   * occurrences are excluded: their synthetic period deadline is a placement
   * window, not a commitment. EDF_TIER_ENABLED is the kill switch for A/B
   * comparison against a real calendar.
   */
  EDF_TIER_ENABLED: true,
  EDF_HORIZON_DAYS: HORIZON_CHUNK_DAYS,
  /**
   * Split-task chunk placement fit-tests at (min chunk x this) first and
   * falls back to the true minimum only when no slot hosts the preferred
   * size (clamped to the max-chunk bound and the remainder). Without it an
   * unlimited-max split takes the earliest minimum-size gap and fragments
   * work into many small chunks when fewer large ones would serve better.
   */
  SPLIT_PREFERRED_CHUNK_MULTIPLIER: 2,
  /**
   * Same-duration polish pass (see polishPass.ts; opt-in via the polishPass
   * generation option, default off): only events within this many days of
   * each other are considered for a swap, and at most MAX_TRIALS
   * snapshot-trial-restore attempts run per regen.
   */
  POLISH_PASS_PAIR_WINDOW_DAYS: 7,
  POLISH_PASS_MAX_TRIALS: 64,
} as const;

/**
 * Urgency calculation configuration
 * Used in priority-based scheduling
 */
export const URGENCY_CONFIG = {
  /** Controls how steeply urgency increases as deadline approaches (higher = steeper) */
  CURVE_STEEPNESS: 4,
  /** The point (0-1) at which urgency starts mattering significantly (0.7 = 70% of time remaining) */
  CRITICAL_THRESHOLD: 0.7,
  /** Minimum urgency multiplier for tasks without deadlines */
  MIN_URGENCY_MULTIPLIER: 0.3,
  /** Maximum urgency multiplier (applied at deadline) */
  MAX_URGENCY_MULTIPLIER: 1.0,
  /** Urgency score range scaling factor */
  URGENCY_SCALE_MIN: 0.3,
  /** Urgency score range scaling factor */
  URGENCY_SCALE_MAX: 1.0,
} as const;

// NOTE: Strategy weights and scoring configs have been moved to:
// utils/calendar-generation/strategies/defaultStrategy.ts
// This allows for future user customization of strategy parameters.

/**
 * Location and travel time configuration
 */
export const LOCATION_CONFIG = {
  /** Maximum number of locations a user can save */
  MAX_LOCATIONS: 10,
  /** Rush hour morning start (7 AM) */
  RUSH_HOUR_MORNING_START: 7,
  /** Rush hour morning end (9 AM) */
  RUSH_HOUR_MORNING_END: 9,
  /** Rush hour evening start (5 PM) */
  RUSH_HOUR_EVENING_START: 17,
  /** Rush hour evening end (7 PM) */
  RUSH_HOUR_EVENING_END: 19,
  /** Night time start (9 PM) */
  NIGHT_START: 21,
  /** Night time end (6 AM) */
  NIGHT_END: 6,
} as const;

/**
 * Scheduling failure reasons
 */
export enum SchedulingFailureReason {
  /** Task duration exceeds the largest available template gap */
  TOO_LARGE = "TOO_LARGE",
  /** No available time slots found within search window */
  NO_SLOTS = "NO_SLOTS",
  /** Allowed times and eligible category windows never coincide in any week */
  IMPOSSIBLE_CONSTRAINTS = "IMPOSSIBLE_CONSTRAINTS",
  /** Algorithm exceeded maximum iteration count */
  ITERATION_LIMIT = "ITERATION_LIMIT",
  /** Task dependencies prevent scheduling at this time */
  DEPENDENCY_CONFLICT = "DEPENDENCY_CONFLICT",
  /** Invalid task data (missing duration, etc.) */
  INVALID_TASK = "INVALID_TASK",
  /** Template generation failed */
  TEMPLATE_ERROR = "TEMPLATE_ERROR",
}

/**
 * Default colors for calendar events
 */
export const DEFAULT_COLORS = {
  TASK: "#3b82f6",
  GOAL: "#8b5cf6",
  PLAN: "#000000",
  TEMPLATE: "#6b7280",
  COMPLETED: "#00ab5bff",
  ERROR: "#ef4444",
} as const;
