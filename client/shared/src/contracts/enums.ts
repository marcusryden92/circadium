// Prisma enums re-declared without importing Prisma. Each is a const object
// plus a literal-union type of the same name (the shape Prisma itself
// generates), so the shared package, mobile, and the Java contract check all
// speak the same values. The web package asserts these stay equal to the
// generated Prisma enums (types/contractConformance.ts), so a renamed member
// fails type-check until it is reconciled here.

export const PlannerType = {
  task: "task",
  plan: "plan",
  goal: "goal",
} as const;
export type PlannerType = (typeof PlannerType)[keyof typeof PlannerType];

export const EventType = {
  planner: "planner",
  template: "template",
  travel: "travel",
  category: "category",
  external: "external",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const UserRole = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ExternalCalendarKind = {
  ICS: "ICS",
  GOOGLE: "GOOGLE",
  MICROSOFT: "MICROSOFT",
} as const;
export type ExternalCalendarKind =
  (typeof ExternalCalendarKind)[keyof typeof ExternalCalendarKind];

export const ExternalCalendarMode = {
  BUSY: "BUSY",
  VISUAL: "VISUAL",
} as const;
export type ExternalCalendarMode =
  (typeof ExternalCalendarMode)[keyof typeof ExternalCalendarMode];

export const TransportMode = {
  DRIVING: "DRIVING",
  TRANSIT: "TRANSIT",
  BICYCLING: "BICYCLING",
  WALKING: "WALKING",
} as const;
export type TransportMode =
  (typeof TransportMode)[keyof typeof TransportMode];

// Narrowed at the DB boundary from the WeekDayType enum (sunday..saturday) to
// the integer the app code uses everywhere (0=Sunday .. 6=Saturday).
export type WeekDayIntegers = 0 | 1 | 2 | 3 | 4 | 5 | 6;
