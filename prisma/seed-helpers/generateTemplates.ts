import { EventTemplate } from "../../generated/client";
import { WeekDayType } from "../../types/calendarTypes";
import { v4 as uuidv4 } from "uuid";
import { LOCATION_IDS } from "./generateLocations";

const days = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const WEEKDAYS = days.slice(1, 6); // Monday - Friday

interface TemplateSeed {
  title: string;
  days: readonly (typeof days)[number][];
  startTime: string;
  duration: number;
  color: string;
  locationId: string | null;
}

// A calm, regular week structure: sleep (one overnight block per day),
// a morning routine, lunch on workdays, and family dinner every evening.
const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    title: "Sleep",
    days,
    startTime: "23:00",
    duration: 480,
    color: "#1E3A8A",
    locationId: LOCATION_IDS.HOME,
  },
  {
    title: "Morning routine",
    days,
    startTime: "07:00",
    duration: 60,
    color: "#64748B",
    locationId: LOCATION_IDS.HOME,
  },
  {
    title: "Lunch",
    days: WEEKDAYS,
    startTime: "12:00",
    duration: 45,
    color: "#F59E0B",
    locationId: null,
  },
  {
    title: "Family dinner",
    days,
    startTime: "18:00",
    duration: 60,
    color: "#FB7185",
    locationId: LOCATION_IDS.HOME,
  },
];

/**
 * Generates event templates for seeding the database.
 */
export const generateTemplates = (userId: string): EventTemplate[] => {
  const timestamp = new Date().toISOString();

  return TEMPLATE_SEEDS.flatMap((seed) =>
    seed.days.map((day) => ({
      id: uuidv4(),
      userId,
      title: seed.title,
      startDay: day as WeekDayType,
      startTime: seed.startTime,
      duration: seed.duration,
      color: seed.color,
      locationId: seed.locationId,
      recurrenceExceptions: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
};
