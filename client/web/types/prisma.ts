import { Prisma } from "@/generated/client";
import type { WeekDayIntegers } from "./calendarTypes";
export {
  PlannerType,
  EventType,
  UserRole,
  ExternalCalendarKind,
  ExternalCalendarMode,
} from "@/generated/client";

// The 10 calendar tables migrated their createdAt/updatedAt from TEXT ISO
// strings to timestamp(3) at the DB (plan 1.13b), so Prisma now types those
// fields as Date. The app speaks ISO strings end-to-end — the Java wire
// contract, the sync diff, the engine, Redux — so re-declare them as string
// everywhere. The direct-Prisma seams convert at the edge: reads serialize
// Date -> ISO at the action boundary (categories.ts), writes pass a Date.
type WithIsoTimestamps<T> = Omit<T, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

// Trespass flags are persisted columns but runtime-optional: event builders
// never set them — stabilizeEvent carries them forward from the previous emit
// and markTrespassingEvents owns the truth each regen (absent reads as false).
type EventExtendedPropsRow = Prisma.EventExtendedPropsGetPayload<undefined>;
export type EventExtendedProps = Omit<
  EventExtendedPropsRow,
  "trespassingStart" | "trespassingEnd"
> & {
  trespassingStart?: boolean;
  trespassingEnd?: boolean;
};

// SimpleEvent with runtime fields added to extendedProps
export type SimpleEvent = WithIsoTimestamps<
  Omit<
    Prisma.SimpleEventGetPayload<{
      include: { extendedProps: true };
    }>,
    "extendedProps"
  >
> & {
  extendedProps:
    | (EventExtendedProps & {
        categoryWrapperId?: string | null;
        wrapperId?: string | null;
        fromLocationId?: string | null;
        toLocationId?: string | null;
        travelMinutes?: number | null;
        insufficientTravel?: boolean;
        requiredTravelMinutes?: number | null;
        // Resolved location for an imported external busy block (source default
        // or per-event override). Only external busy events carry it; the slot
        // builder reads it so travel is injected around located commitments.
        locationId?: string | null;
      })
    | null;
};

export type Planner = WithIsoTimestamps<Prisma.PlannerGetPayload<undefined>>;

export type PlannerWithLocation = WithIsoTimestamps<
  Prisma.PlannerGetPayload<{
    include: { location: true };
  }>
>;

type RawEventTemplate = Prisma.EventTemplateGetPayload<undefined>;
export type EventTemplate = WithIsoTimestamps<
  Omit<RawEventTemplate, "startDay">
> & {
  startDay: WeekDayIntegers;
};

export type Location = Prisma.LocationGetPayload<undefined>;

export type TravelTime = Prisma.TravelTimeGetPayload<undefined>;

export type TravelTimeWithLocations = Prisma.TravelTimeGetPayload<{
  include: { fromLocation: true; toLocation: true };
}>;

type RawCategoryTimeWindow = Prisma.CategoryTimeWindowGetPayload<undefined>;
export type CategoryTimeWindow = Omit<RawCategoryTimeWindow, "day"> & {
  day: WeekDayIntegers;
};

type RawCategory = Prisma.CategoryGetPayload<{ include: { timeSlots: true } }>;
export type Category = WithIsoTimestamps<Omit<RawCategory, "timeSlots">> & {
  timeSlots: CategoryTimeWindow[];
};

type RawCategoryWithChildren = Prisma.CategoryGetPayload<{
  include: { children: true; timeSlots: true };
}>;
export type CategoryWithChildren = WithIsoTimestamps<
  Omit<RawCategoryWithChildren, "timeSlots" | "children">
> & {
  timeSlots: CategoryTimeWindow[];
  children: Category[];
};

type RawPlannerWithCategory = Prisma.PlannerGetPayload<{
  include: { category: true };
}>;
export type PlannerWithCategory = WithIsoTimestamps<
  Omit<RawPlannerWithCategory, "category">
> & {
  category: WithIsoTimestamps<
    NonNullable<RawPlannerWithCategory["category"]>
  > | null;
};

export type CategoryEvent = WithIsoTimestamps<
  Prisma.CategoryEventGetPayload<undefined>
>;

export type TravelEvent = WithIsoTimestamps<
  Prisma.TravelEventGetPayload<undefined>
>;

export type EngineMessage = WithIsoTimestamps<
  Prisma.EngineMessageGetPayload<undefined>
>;

export type DraftConversation = WithIsoTimestamps<
  Prisma.DraftConversationGetPayload<undefined>
>;

export type QueueMember = WithIsoTimestamps<
  Prisma.QueueMemberGetPayload<undefined>
>;

// Nested-members is the app/Redux shape (Category.timeSlots precedent);
// the sync diff strips + flattens members into their own change group.
type RawQueue = Prisma.QueueGetPayload<{ include: { members: true } }>;
export type Queue = WithIsoTimestamps<Omit<RawQueue, "members">> & {
  members: QueueMember[];
};

export type PlannerDependency = WithIsoTimestamps<
  Prisma.PlannerDependencyGetPayload<undefined>
>;

// DateTime columns serialized to ISO strings at the action boundary
// (Location precedent) so the rows are Redux-serializable.
type RawExternalCalendarSource =
  Prisma.ExternalCalendarSourceGetPayload<undefined>;
export type ExternalCalendarSource = Omit<
  RawExternalCalendarSource,
  "createdAt" | "updatedAt" | "lastFetchedAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
};

export type ExternalEvent = Prisma.ExternalEventGetPayload<undefined>;

// createdAt migrated TEXT -> timestamp(3) when its writes moved to Java (plan
// 2.1); the app speaks the ISO string end-to-end, like the calendar tables.
export type OccurrenceCompletion = Omit<
  Prisma.OccurrenceCompletionGetPayload<undefined>,
  "createdAt"
> & { createdAt: string };

// The habit tables' timestamps migrated TEXT -> timestamp(3) when their writes
// moved to Java (plan 2.2); the app speaks ISO strings end-to-end.
export type HabitBucket = WithIsoTimestamps<Prisma.HabitBucketGetPayload<undefined>>;

export type Habit = WithIsoTimestamps<Prisma.HabitGetPayload<undefined>>;

export type HabitItem = Omit<Prisma.HabitItemGetPayload<undefined>, "createdAt"> & {
  createdAt: string;
};

export type FeedbackReport = Prisma.FeedbackReportGetPayload<undefined>;

export type Suggestion = Prisma.SuggestionGetPayload<undefined>;

export type SuggestionVote = Prisma.SuggestionVoteGetPayload<undefined>;
