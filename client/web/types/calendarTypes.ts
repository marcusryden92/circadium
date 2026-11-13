export type WeekDayIntegers = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WeekDayType =
  | "sunday" // index 0
  | "monday" // index 1
  | "tuesday" // index 2
  | "wednesday" // index 3
  | "thursday" // index 4
  | "friday" // index 5
  | "saturday"; // index 6

/**
 * Extended props for travel events (runtime-only, not persisted to database)
 */
export interface TravelExtendedProps {
  id: string;
  eventId: string;
  plannerType: "travel";
  parentId: null;
  completedEndTime: null;
  completedStartTime: null;
  fromLocationId: string | null;
  toLocationId: string | null;
  travelMinutes: number;
  insufficientTravel: boolean;
  requiredTravelMinutes: number | null;
}

/**
 * Extended props with trespassing indicators (added at runtime for display)
 */
export interface TrespassingExtendedProps {
  trespassingStart?: boolean;
  trespassingEnd?: boolean;
}
