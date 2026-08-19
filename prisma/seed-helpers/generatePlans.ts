import { Planner } from "../../generated/client";
import { v4 as uuidv4 } from "uuid";
import { LOCATION_IDS } from "./generateLocations";

/**
 * Simplified plan data structure.
 * Plans are fixed-time anchors positioned relative to the current week.
 */
export interface SimplePlanData {
  title: string;
  color: string;
  duration: number;
  // Day offset from Monday (0 = Monday, 1 = Tuesday, etc.)
  dayOffset: number;
  // Start time in HH:MM format
  startTime: string;
  locationId?: string | null;
  // Weekly repeats anchor on the seeded start (fixed-anchor plan recurrence).
  weekly?: boolean;
}

// The fixed fabric of the personas' week: standing work meetings, the school
// run, and a couple of one-offs that punch holes in the routine.
export const planSeedData: SimplePlanData[] = [
  {
    title: "Team sync",
    color: "#0D9488",
    duration: 60,
    dayOffset: 1, // Tuesday
    startTime: "13:00",
    locationId: LOCATION_IDS.WORK,
    weekly: true,
  },
  {
    title: "1:1 with Sara",
    color: "#0D9488",
    duration: 30,
    dayOffset: 3, // Thursday
    startTime: "14:30",
    locationId: LOCATION_IDS.WORK,
    weekly: true,
  },
  ...[0, 1, 2, 3, 4].map((dayOffset) => ({
    title: "School pickup",
    color: "#991B1B",
    duration: 30,
    dayOffset,
    startTime: "15:30",
    locationId: LOCATION_IDS.SCHOOL,
    weekly: true,
  })),
  {
    title: "Dentist (Sven)",
    color: "#15803D",
    duration: 60,
    dayOffset: 3, // Thursday
    startTime: "10:00",
    locationId: null,
  },
  {
    title: "Dinner with Elin",
    color: "#EC4899",
    duration: 120,
    dayOffset: 4, // Friday
    startTime: "19:00",
    locationId: null,
  },
];

/**
 * Get the Monday of the current week.
 * This is a copy of the function from calendarUtils to avoid import issues in the seed context.
 */
function getDateOfThisWeeksMonday(todaysDate: Date): Date {
  const dayOfWeek = todaysDate.getDay();
  const daysToMonday = (dayOfWeek + 6) % 7;
  const result = new Date(todaysDate);
  result.setDate(result.getDate() - daysToMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Calculate the start datetime for a plan based on the current week's Monday.
 */
function calculatePlanStartTime(
  mondayDate: Date,
  dayOffset: number,
  startTime: string,
): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const planDate = new Date(mondayDate);
  planDate.setDate(planDate.getDate() + dayOffset);
  planDate.setHours(hours, minutes, 0, 0);
  return planDate.toISOString();
}

/**
 * Generates full Planner objects of type 'plan' from simplified seed data.
 * Plans are dynamically positioned based on the current week's Monday,
 * so they always appear at the same relative times within the week.
 */
export const generatePlans = (userId: string): Planner[] => {
  const timestamp = new Date().toISOString();
  const mondayDate = getDateOfThisWeeksMonday(new Date());

  return planSeedData.map((data) => {
    const starts = calculatePlanStartTime(
      mondayDate,
      data.dayOffset,
      data.startTime,
    );

    return {
      id: uuidv4(),
      title: data.title,
      parentId: null,
      plannerType: "plan" as const,
      isReady: true,
      isTriaged: true,
      duration: data.duration,
      deadline: null,
      starts,
      recurrence: data.weekly
        ? JSON.stringify({ freq: "weekly", interval: 1, until: null })
        : null,
      recurrenceExceptions: null,
      splitting: null,
      completedSegments: null,
      maxMinutesPerDay: null,
      earliestStartDate: null,
      allowedTimes: null,
      linkedItemId: null,
      notes: null,
      sortOrder: 0,
      completedStartTime: null,
      completedEndTime: null,
      priority: 5,
      userId,
      color: data.color,
      locationId: data.locationId ?? null,
      useParentLocation: false,
      categoryId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
};
