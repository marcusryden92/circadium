import { Prisma } from "../../generated/client";
import { LOCATION_IDS } from "./generateLocations";

// Top-level categories are surfaced as "Roles"; nested ones are sub-categories.
export const CATEGORY_IDS = {
  PROFESSIONAL: "seed-category-professional",
  DEEP_WORK: "seed-category-deep-work",
  MEETINGS: "seed-category-meetings",
  FAMILY: "seed-category-family",
  HOME_PROJECTS: "seed-category-home-projects",
  HEALTH: "seed-category-health",
  FITNESS: "seed-category-fitness",
  LEARNING: "seed-category-learning",
  READING: "seed-category-reading",
} as const;

type CategorySeedInput = Prisma.CategoryCreateInput & { id: string };

// 0=Sunday, 1=Monday, ... 6=Saturday - matches JS Date.getDay() and what's
// stored in CategoryTimeWindow.day.
type SeedTimeWindow = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
};

const WEEKDAYS: SeedTimeWindow["day"][] = [1, 2, 3, 4, 5];

const withOwner = (
  userId: string,
  slots: SeedTimeWindow[],
): Prisma.CategoryTimeWindowCreateWithoutCategoryInput[] =>
  slots.map((slot) => ({
    ...slot,
    user: { connect: { id: userId } },
  }));

const weekdaily = (startTime: string, endTime: string): SeedTimeWindow[] =>
  WEEKDAYS.map((day) => ({ day, startTime, endTime }));

export const generateCategories = (userId: string): CategorySeedInput[] => {
  const timestamp = new Date().toISOString();

  const owner = { connect: { id: userId } };
  const base = {
    icon: null,
    user: owner,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as const;

  // Roles (parentId null) are created first so the sub-categories below can
  // connect to them in the create loop.
  return [
    {
      ...base,
      id: CATEGORY_IDS.PROFESSIONAL,
      name: "Professional",
      color: "#3B82F6",
      sortOrder: 0,
      useTimeWindows: false,
      isStrict: false,
    },
    {
      ...base,
      id: CATEGORY_IDS.FAMILY,
      name: "Family",
      color: "#F43F5E",
      sortOrder: 1,
      useTimeWindows: false,
      isStrict: false,
    },
    {
      ...base,
      id: CATEGORY_IDS.HEALTH,
      name: "Health",
      color: "#22C55E",
      sortOrder: 2,
      useTimeWindows: false,
      isStrict: false,
    },
    {
      ...base,
      id: CATEGORY_IDS.LEARNING,
      name: "Learning",
      color: "#8B5CF6",
      sortOrder: 3,
      useTimeWindows: false,
      isStrict: false,
    },

    // Sub-categories.
    {
      ...base,
      id: CATEGORY_IDS.DEEP_WORK,
      name: "Deep Work",
      color: "#6366F1",
      sortOrder: 0,
      parent: { connect: { id: CATEGORY_IDS.PROFESSIONAL } },
      location: { connect: { id: LOCATION_IDS.WORK } },
      useTimeWindows: true,
      isStrict: true,
      timeSlots: { create: withOwner(userId, weekdaily("09:00", "12:00")) },
    },
    {
      ...base,
      id: CATEGORY_IDS.MEETINGS,
      name: "Meetings",
      color: "#06B6D4",
      sortOrder: 1,
      parent: { connect: { id: CATEGORY_IDS.PROFESSIONAL } },
      location: { connect: { id: LOCATION_IDS.WORK } },
      useTimeWindows: true,
      isStrict: false,
      timeSlots: { create: withOwner(userId, weekdaily("13:00", "16:00")) },
    },
    {
      ...base,
      id: CATEGORY_IDS.HOME_PROJECTS,
      name: "Home Projects",
      color: "#F59E0B",
      sortOrder: 0,
      parent: { connect: { id: CATEGORY_IDS.FAMILY } },
      location: { connect: { id: LOCATION_IDS.HOME } },
      useTimeWindows: false,
      isStrict: false,
    },
    {
      ...base,
      id: CATEGORY_IDS.FITNESS,
      name: "Fitness",
      color: "#14B8A6",
      sortOrder: 0,
      parent: { connect: { id: CATEGORY_IDS.HEALTH } },
      location: { connect: { id: LOCATION_IDS.GYM } },
      useTimeWindows: true,
      isStrict: false,
      timeSlots: {
        create: withOwner(userId, [
          { day: 1, startTime: "17:00", endTime: "19:30" },
          { day: 3, startTime: "17:00", endTime: "19:30" },
          { day: 5, startTime: "17:00", endTime: "19:30" },
          { day: 6, startTime: "09:00", endTime: "11:00" },
        ]),
      },
    },
    {
      ...base,
      id: CATEGORY_IDS.READING,
      name: "Reading",
      color: "#A78BFA",
      sortOrder: 0,
      parent: { connect: { id: CATEGORY_IDS.LEARNING } },
      useTimeWindows: true,
      isStrict: false,
      timeSlots: {
        create: withOwner(userId, [
          { day: 0, startTime: "20:00", endTime: "22:00" },
          { day: 1, startTime: "20:00", endTime: "22:00" },
          { day: 2, startTime: "20:00", endTime: "22:00" },
          { day: 3, startTime: "20:00", endTime: "22:00" },
          { day: 4, startTime: "20:00", endTime: "22:00" },
          { day: 5, startTime: "20:00", endTime: "22:00" },
          { day: 6, startTime: "20:00", endTime: "22:00" },
        ]),
      },
    },
  ];
};
