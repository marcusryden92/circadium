import { Location, TravelTime } from "../../generated/client";

// Fixed IDs so we can reference them in other seed files
export const LOCATION_IDS = {
  HOME: "seed-location-home",
  WORK: "seed-location-work",
  GYM: "seed-location-gym",
  SCHOOL: "seed-location-school",
} as const;

/**
 * Generates location data for seeding — a believable everyday radius: home,
 * an office ~25 minutes away, a gym, and the kids' school around the corner.
 */
export const generateLocations = (
  userId: string,
): Omit<Location, "createdAt" | "updatedAt">[] => {
  return [
    {
      id: LOCATION_IDS.HOME,
      userId,
      name: "Home",
      address: "Gillevägen 3, 131 33 Nacka, Sweden",
      placeId: "ChIJPUGkuDx5X0YRwDXn1hCYtSA",
      lat: 59.3107,
      lng: 18.1234,
    },
    {
      id: LOCATION_IDS.WORK,
      userId,
      name: "Office",
      address: "Munkbrohamnen, 111 28 Stockholm, Sweden",
      placeId: "ChIJqyKCOwB3X0YRXKldXP9fc5w",
      lat: 59.3233,
      lng: 18.0689,
    },
    {
      id: LOCATION_IDS.GYM,
      userId,
      name: "Gym",
      address: "Smedjegatan 14, 131 54 Nacka, Sweden",
      placeId: "ChIJ4ZnQW214X0YRGZckLga3iIw",
      lat: 59.3067,
      lng: 18.1567,
    },
    {
      id: LOCATION_IDS.SCHOOL,
      userId,
      name: "School",
      address: "Griffelvägen 11, 131 40 Nacka, Sweden",
      placeId: "ChIJq3rNvGx4X0YR4bGGYEqrxRs",
      lat: 59.3085,
      lng: 18.1402,
    },
  ];
};

interface TravelSeed {
  from: string;
  to: string;
  rush: number;
  regular: number;
  night: number;
}

// Directional pairs across all four locations (driving).
const TRAVEL_SEEDS: TravelSeed[] = [
  {
    from: LOCATION_IDS.HOME,
    to: LOCATION_IDS.WORK,
    rush: 29,
    regular: 24,
    night: 19,
  },
  {
    from: LOCATION_IDS.WORK,
    to: LOCATION_IDS.HOME,
    rush: 31,
    regular: 25,
    night: 20,
  },
  {
    from: LOCATION_IDS.HOME,
    to: LOCATION_IDS.GYM,
    rush: 14,
    regular: 12,
    night: 11,
  },
  {
    from: LOCATION_IDS.GYM,
    to: LOCATION_IDS.HOME,
    rush: 13,
    regular: 12,
    night: 11,
  },
  {
    from: LOCATION_IDS.HOME,
    to: LOCATION_IDS.SCHOOL,
    rush: 10,
    regular: 8,
    night: 8,
  },
  {
    from: LOCATION_IDS.SCHOOL,
    to: LOCATION_IDS.HOME,
    rush: 10,
    regular: 8,
    night: 8,
  },
  {
    from: LOCATION_IDS.WORK,
    to: LOCATION_IDS.GYM,
    rush: 24,
    regular: 20,
    night: 16,
  },
  {
    from: LOCATION_IDS.GYM,
    to: LOCATION_IDS.WORK,
    rush: 26,
    regular: 21,
    night: 17,
  },
  {
    from: LOCATION_IDS.WORK,
    to: LOCATION_IDS.SCHOOL,
    rush: 27,
    regular: 22,
    night: 18,
  },
  {
    from: LOCATION_IDS.SCHOOL,
    to: LOCATION_IDS.WORK,
    rush: 28,
    regular: 23,
    night: 18,
  },
  {
    from: LOCATION_IDS.GYM,
    to: LOCATION_IDS.SCHOOL,
    rush: 9,
    regular: 8,
    night: 7,
  },
  {
    from: LOCATION_IDS.SCHOOL,
    to: LOCATION_IDS.GYM,
    rush: 9,
    regular: 8,
    night: 7,
  },
];

/**
 * Generates travel time data for seeding
 */
export const generateTravelTimes = (
  userId: string,
): Omit<TravelTime, "id" | "createdAt" | "updatedAt" | "unroutableAt">[] => {
  return TRAVEL_SEEDS.map((seed) => ({
    fromLocationId: seed.from,
    toLocationId: seed.to,
    transportMode: "DRIVING" as const,
    googleRushHourMinutes: seed.rush,
    googleRegularMinutes: seed.regular,
    googleNightMinutes: seed.night,
    customRushHourMinutes: null,
    customRegularMinutes: null,
    customNightMinutes: null,
    userId,
  }));
};
