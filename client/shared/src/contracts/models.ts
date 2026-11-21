// The ~25 domain row types, re-declared without importing Prisma and carrying
// the runtime augmentations the app relies on (narrowed weekday integers,
// optional trespass flags, travel fields on extendedProps, ISO-string dates on
// the external-calendar source). The web package proves these stay faithful to
// the generated Prisma payloads in types/contractConformance.ts.

import type {
  PlannerType,
  EventType,
  ExternalCalendarKind,
  ExternalCalendarMode,
  TransportMode,
  WeekDayIntegers,
} from "./enums";

// Mirrors Prisma's runtime JsonValue exactly (string | number | boolean |
// object | array | null), so the Json columns conform without importing it.
export type JsonObject = { [Key in string]?: JsonValue };
export interface JsonArray extends Array<JsonValue> {}
export type JsonValue = string | number | boolean | JsonObject | JsonArray | null;

export interface EventExtendedProps {
  id: string;
  plannerType: PlannerType | null;
  eventType: EventType;
  completedStartTime: string | null;
  completedEndTime: string | null;
  parentId: string | null;
  eventId: string;
  // Persisted columns but runtime-optional: builders never set them,
  // stabilizeEvent carries them forward, markTrespassingEvents owns the truth.
  trespassingStart?: boolean;
  trespassingEnd?: boolean;
}

// The travel/wrapper fields the engine stamps onto a scheduled event's
// extendedProps at runtime (not DB columns on EventExtendedProps).
export type SimpleEventExtendedProps = EventExtendedProps & {
  categoryWrapperId?: string | null;
  wrapperId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  travelMinutes?: number | null;
  insufficientTravel?: boolean;
  requiredTravelMinutes?: number | null;
  locationId?: string | null;
};

export interface SimpleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  duration: number | null;
  userId: string;
  rrule: string | null;
  backgroundColor: string;
  borderColor: string;
  createdAt: string;
  updatedAt: string;
  extendedProps: SimpleEventExtendedProps | null;
}

export interface Planner {
  id: string;
  title: string;
  parentId: string | null;
  plannerType: PlannerType;
  isReady: boolean | null;
  isTriaged: boolean;
  duration: number;
  deadline: string | null;
  starts: string | null;
  recurrence: string | null;
  recurrenceExceptions: string | null;
  splitting: string | null;
  completedSegments: string | null;
  maxMinutesPerDay: number | null;
  earliestStartDate: string | null;
  allowedTimes: string | null;
  linkedItemId: string | null;
  notes: string | null;
  sortOrder: number;
  completedStartTime: string | null;
  completedEndTime: string | null;
  priority: number;
  userId: string;
  color: string | null;
  locationId: string | null;
  useParentLocation: boolean;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventTemplate {
  id: string;
  title: string;
  startDay: WeekDayIntegers;
  startTime: string;
  userId: string;
  duration: number;
  color: string | null;
  locationId: string | null;
  recurrenceExceptions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PlannerWithLocation = Planner & {
  location: Location | null;
};

export interface TravelTime {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  transportMode: TransportMode;
  googleRushHourMinutes: number;
  googleRegularMinutes: number;
  googleNightMinutes: number;
  customRushHourMinutes: number | null;
  customRegularMinutes: number | null;
  customNightMinutes: number | null;
  unroutableAt: Date | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TravelTimeWithLocations = TravelTime & {
  fromLocation: Location;
  toLocation: Location;
};

export interface CategoryTimeWindow {
  id: string;
  day: WeekDayIntegers;
  startTime: string;
  endTime: string;
  recurrenceExceptions: string | null;
  categoryId: string | null;
  userId: string;
}

// Scalar fields of a Category row (no timeSlots relation) — the shape Prisma
// returns for an included category and the sync diff's category group.
export interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  useTimeWindows: boolean;
  isStrict: boolean;
  confineToOwnWindows: boolean;
  locationId: string | null;
  parentId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type Category = CategoryRow & {
  timeSlots: CategoryTimeWindow[];
};

export type CategoryWithChildren = Category & {
  children: Category[];
};

export type PlannerWithCategory = Planner & {
  category: CategoryRow | null;
};

export interface CategoryEvent {
  id: string;
  start: string;
  end: string;
  trespassingStart: boolean;
  trespassingEnd: boolean;
  categoryTimeWindowId: string;
  categoryId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelEvent {
  id: string;
  start: string;
  end: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  travelMinutes: number;
  requiredTravelMinutes: number | null;
  insufficientTravel: boolean;
  overconstrained: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineMessage {
  id: string;
  type: string;
  tone: string;
  payload: JsonValue;
  dismissed: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftConversation {
  id: string;
  title: string;
  messages: JsonValue;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueMember {
  id: string;
  sortOrder: number;
  queueId: string;
  plannerId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueRow {
  id: string;
  title: string;
  sortOrder: number;
  color: string | null;
  categoryId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type Queue = QueueRow & {
  members: QueueMember[];
};

export interface PlannerDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalCalendarSource {
  id: string;
  userId: string;
  kind: ExternalCalendarKind;
  url: string;
  name: string;
  color: string | null;
  enabled: boolean;
  mode: ExternalCalendarMode;
  modeExceptions: string | null;
  locationId: string | null;
  locationExceptions: string | null;
  lastError: string | null;
  // DateTime columns serialized to ISO strings at the action boundary so the
  // rows are Redux-serializable.
  lastFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalEvent {
  id: string;
  sourceId: string;
  userId: string;
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

export interface OccurrenceCompletion {
  id: string;
  plannerId: string;
  userId: string;
  occurrenceKey: string;
  start: string;
  end: string;
  createdAt: string;
}

export interface HabitBucket {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  bucketId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HabitItem {
  id: string;
  habitId: string;
  plannerId: string;
  userId: string;
  createdAt: string;
}

export interface FeedbackReport {
  id: string;
  message: string;
  dataSnapshot: JsonValue | null;
  userId: string;
  createdAt: string;
}

export interface Suggestion {
  id: string;
  title: string;
  body: string | null;
  userId: string;
  createdAt: string;
}

export interface SuggestionVote {
  id: string;
  value: number;
  suggestionId: string;
  userId: string;
  createdAt: string;
}
