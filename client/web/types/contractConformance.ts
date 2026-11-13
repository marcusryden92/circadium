// Type-only conformance: proves the hand-declared @circadium/shared contracts
// stay faithful to the generated Prisma payloads (and the live action/diff
// signatures) while both systems coexist. Nothing here emits runtime code — it
// exists purely so `tsc --noEmit` fails the moment the two drift (e.g. renaming
// a Prisma enum member, or adding a column without updating the contract).
//
// Deleted at the Prisma cutover (plan item 2.6) along with prisma/ itself.

import type { Equal, Expect, Conforms } from "@circadium/shared/contracts/assert";
import type * as c from "@circadium/shared/contracts";

import type {
  PlannerType as PrismaPlannerType,
  EventType as PrismaEventType,
  UserRole as PrismaUserRole,
  ExternalCalendarKind as PrismaExternalCalendarKind,
  ExternalCalendarMode as PrismaExternalCalendarMode,
  TransportMode as PrismaTransportMode,
} from "@/generated/client";
import type * as web from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type { DatabaseChanges } from "@/utils/server-handlers/compareCalendarData";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import type { FreshState } from "@/actions/calendar-actions/fetchFreshState";
import type { SyncResponse } from "@/actions/calendar-actions/syncCalendarData";

// Enums — a renamed Prisma member changes its union and fails these.
type _PlannerType = Expect<Equal<c.PlannerType, PrismaPlannerType>>;
type _EventType = Expect<Equal<c.EventType, PrismaEventType>>;
type _UserRole = Expect<Equal<c.UserRole, PrismaUserRole>>;
type _ExtKind = Expect<Equal<c.ExternalCalendarKind, PrismaExternalCalendarKind>>;
type _ExtMode = Expect<Equal<c.ExternalCalendarMode, PrismaExternalCalendarMode>>;
type _Transport = Expect<Equal<c.TransportMode, PrismaTransportMode>>;
type _WeekDay = Expect<Equal<c.WeekDayIntegers, WeekDayIntegers>>;

// Models — each contract type conforms to the augmented Prisma payload web
// uses. Conforms (mutual assignability), not Equal, because web wraps many of
// these as `Omit<Raw, K> & { ... }` intersections that strict Equal reports as
// unequal despite identical resolved shapes; Conforms still fails on a real
// column add/remove/retype/re-nullable.
type _EventExtendedProps = Expect<
  Conforms<c.EventExtendedProps, web.EventExtendedProps>
>;
type _SimpleEvent = Expect<Conforms<c.SimpleEvent, web.SimpleEvent>>;
type _Planner = Expect<Conforms<c.Planner, web.Planner>>;
type _PlannerWithLocation = Expect<
  Conforms<c.PlannerWithLocation, web.PlannerWithLocation>
>;
type _EventTemplate = Expect<Conforms<c.EventTemplate, web.EventTemplate>>;
type _Location = Expect<Conforms<c.Location, web.Location>>;
type _TravelTime = Expect<Conforms<c.TravelTime, web.TravelTime>>;
type _TravelTimeWithLocations = Expect<
  Conforms<c.TravelTimeWithLocations, web.TravelTimeWithLocations>
>;
type _CategoryTimeWindow = Expect<
  Conforms<c.CategoryTimeWindow, web.CategoryTimeWindow>
>;
type _Category = Expect<Conforms<c.Category, web.Category>>;
type _CategoryWithChildren = Expect<
  Conforms<c.CategoryWithChildren, web.CategoryWithChildren>
>;
type _PlannerWithCategory = Expect<
  Conforms<c.PlannerWithCategory, web.PlannerWithCategory>
>;
type _CategoryEvent = Expect<Conforms<c.CategoryEvent, web.CategoryEvent>>;
type _TravelEvent = Expect<Conforms<c.TravelEvent, web.TravelEvent>>;
type _EngineMessage = Expect<Conforms<c.EngineMessage, web.EngineMessage>>;
type _DraftConversation = Expect<
  Conforms<c.DraftConversation, web.DraftConversation>
>;
type _Queue = Expect<Conforms<c.Queue, web.Queue>>;
type _QueueMember = Expect<Conforms<c.QueueMember, web.QueueMember>>;
type _PlannerDependency = Expect<
  Conforms<c.PlannerDependency, web.PlannerDependency>
>;
type _ExternalCalendarSource = Expect<
  Conforms<c.ExternalCalendarSource, web.ExternalCalendarSource>
>;
type _ExternalEvent = Expect<Conforms<c.ExternalEvent, web.ExternalEvent>>;
type _OccurrenceCompletion = Expect<
  Conforms<c.OccurrenceCompletion, web.OccurrenceCompletion>
>;
type _HabitBucket = Expect<Conforms<c.HabitBucket, web.HabitBucket>>;
type _Habit = Expect<Conforms<c.Habit, web.Habit>>;
type _HabitItem = Expect<Conforms<c.HabitItem, web.HabitItem>>;
type _FeedbackReport = Expect<Conforms<c.FeedbackReport, web.FeedbackReport>>;
type _Suggestion = Expect<Conforms<c.Suggestion, web.Suggestion>>;
type _SuggestionVote = Expect<Conforms<c.SuggestionVote, web.SuggestionVote>>;

// Wire types — conform against the live diff + action signatures.
type _SerializedLocation = Expect<
  Conforms<c.SerializedLocation, SerializedLocation>
>;
type _SerializedTravelTime = Expect<
  Conforms<c.SerializedTravelTime, SerializedTravelTime>
>;
type _DatabaseChanges = Expect<Conforms<c.DatabaseChanges, DatabaseChanges>>;
type _BootstrapPayload = Expect<Conforms<c.BootstrapPayload, FreshState>>;
type _SyncResponse = Expect<Conforms<c.SyncResponse, SyncResponse>>;
