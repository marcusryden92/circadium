// The web's row-type hub. Since the Prisma cutover (plan 2.6) these are the
// hand-declared @circadium/shared contracts — the same declarations mobile and
// the Java contract mirror consume — re-exported under the import path the app
// has always used. The name "prisma" is historical: the generated client is
// gone, and the Java API owns the schema (Flyway).
export type {
  EventExtendedProps,
  SimpleEvent,
  Planner,
  PlannerWithLocation,
  EventTemplate,
  Location,
  TravelTime,
  TravelTimeWithLocations,
  CategoryTimeWindow,
  Category,
  CategoryWithChildren,
  PlannerWithCategory,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  DraftConversation,
  QueueMember,
  Queue,
  PlannerDependency,
  ExternalCalendarSource,
  ExternalEvent,
  OccurrenceCompletion,
  HabitBucket,
  Habit,
  HabitItem,
  FeedbackReport,
  Suggestion,
  SuggestionVote,
} from "@circadium/shared/contracts";

export {
  PlannerType,
  EventType,
  UserRole,
  AiMode,
  ExternalCalendarKind,
  ExternalCalendarMode,
  TransportMode,
} from "@circadium/shared/contracts";
