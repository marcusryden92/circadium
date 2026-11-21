// Zod schemas for the contract — runtime validation at trust boundaries (the
// Java API responses, imported data). Each schema self-checks against its
// hand-declared contract type via z.infer, so the two can never silently
// drift. More schemas are added here as the Java endpoints need them; the
// pattern is established by the enums, the serialized wire rows, and the
// central Planner model.

import { z } from "zod";
import type { Equal, Expect } from "./assert";
import type {
  PlannerType,
  EventType,
  UserRole,
  ExternalCalendarKind,
  ExternalCalendarMode,
  TransportMode,
} from "./enums";
import type { Planner } from "./models";
import type { SerializedLocation, SerializedTravelTime } from "./wire";

export const plannerTypeSchema = z.enum(["task", "plan", "goal"]);
export const eventTypeSchema = z.enum([
  "planner",
  "template",
  "travel",
  "category",
  "external",
]);
export const userRoleSchema = z.enum(["ADMIN", "USER"]);
export const externalCalendarKindSchema = z.enum(["ICS", "GOOGLE", "MICROSOFT"]);
export const externalCalendarModeSchema = z.enum(["BUSY", "VISUAL"]);
export const transportModeSchema = z.enum([
  "DRIVING",
  "TRANSIT",
  "BICYCLING",
  "WALKING",
]);

export const serializedLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  placeId: z.string(),
});

export const serializedTravelTimeSchema = z.object({
  id: z.string(),
  fromLocationId: z.string(),
  toLocationId: z.string(),
  transportMode: transportModeSchema,
  googleRushHourMinutes: z.number(),
  googleRegularMinutes: z.number(),
  googleNightMinutes: z.number(),
  customRushHourMinutes: z.number().nullable(),
  customRegularMinutes: z.number().nullable(),
  customNightMinutes: z.number().nullable(),
  unroutable: z.boolean(),
});

export const plannerSchema = z.object({
  id: z.string(),
  title: z.string(),
  parentId: z.string().nullable(),
  plannerType: plannerTypeSchema,
  isReady: z.boolean().nullable(),
  isTriaged: z.boolean(),
  duration: z.number(),
  deadline: z.string().nullable(),
  starts: z.string().nullable(),
  recurrence: z.string().nullable(),
  recurrenceExceptions: z.string().nullable(),
  splitting: z.string().nullable(),
  completedSegments: z.string().nullable(),
  maxMinutesPerDay: z.number().nullable(),
  earliestStartDate: z.string().nullable(),
  allowedTimes: z.string().nullable(),
  linkedItemId: z.string().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number(),
  completedStartTime: z.string().nullable(),
  completedEndTime: z.string().nullable(),
  priority: z.number(),
  userId: z.string(),
  color: z.string().nullable(),
  locationId: z.string().nullable(),
  useParentLocation: z.boolean(),
  categoryId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Self-conformance: each schema's inferred type must equal the contract type.
type _PlannerType = Expect<Equal<z.infer<typeof plannerTypeSchema>, PlannerType>>;
type _EventType = Expect<Equal<z.infer<typeof eventTypeSchema>, EventType>>;
type _UserRole = Expect<Equal<z.infer<typeof userRoleSchema>, UserRole>>;
type _ExtKind = Expect<
  Equal<z.infer<typeof externalCalendarKindSchema>, ExternalCalendarKind>
>;
type _ExtMode = Expect<
  Equal<z.infer<typeof externalCalendarModeSchema>, ExternalCalendarMode>
>;
type _Transport = Expect<
  Equal<z.infer<typeof transportModeSchema>, TransportMode>
>;
type _SerLocation = Expect<
  Equal<z.infer<typeof serializedLocationSchema>, SerializedLocation>
>;
type _SerTravel = Expect<
  Equal<z.infer<typeof serializedTravelTimeSchema>, SerializedTravelTime>
>;
type _Planner = Expect<Equal<z.infer<typeof plannerSchema>, Planner>>;
