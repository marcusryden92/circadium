/**
 * Calendar Generation - Public API
 *
 * Main exports for the calendar generation system
 */

// Main generation function (backward compatible)
export { generateCalendar } from "./calendarGeneration";

// Core classes (for advanced usage)
export { CalendarGenerator } from "./core/CalendarGenerator";
export { TimeSlotManager } from "./core/TimeSlotManager";
export { Scheduler } from "./core/Scheduler";

// Strategies
export { CompositeStrategy } from "./strategies/SchedulingStrategy";
export type { SchedulingStrategy } from "./strategies/SchedulingStrategy";
export { LocationGroupingStrategy } from "./strategies/LocationGroupingStrategy";
export { EarliestSlotStrategy } from "./strategies/EarliestSlotStrategy";

// Models and types
export type {
  SchedulingResult,
  SchedulingFailure,
  SchedulingMetrics,
  SchedulingContext,
  ScoredSlot,
  CalendarGenerationConfig,
  CalendarGenerationInput,
  DetailedSchedulingResult,
} from "./models/SchedulingModels";
export type { TimeSlot, AvailableSlot, OccupiedSlot, TravelSlot, TimeSlotBlock } from "./models/TimeSlot";
export {
  getDurationMinutes,
  canFitDuration,
  doSlotsOverlap,
  splitSlot,
  occupySlot,
  createTravelSlot,
  isTravelSlot,
  reclaimTravelSlot,
  createTravelShards,
  shardSourceFromAvailable,
  shardSourceFromCategory,
  collectShardSources,
  findTravelShardSpan,
  unplanTravel,
} from "./utils/timeSlotUtils";
export type { ShardSource, TravelShardSpan } from "./utils/timeSlotUtils";

// Utilities
export { dateTimeService, DateTimeService } from "./utils/dateTimeService";
export {
  validatePlanner,
  validateTemplate,
  validatePlanners,
  validateTemplates,
  validateGenerationInput,
} from "./helpers/CalendarValidator";
export type {
  ValidationResult,
  ValidationError,
} from "./helpers/CalendarValidator";
export * from "./utils/intervalUtils";

// Constants
export * from "./constants";
