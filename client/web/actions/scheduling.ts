"use server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type {
  TaskTypeEnum,
  PriorityLevel,
  EnergyLevel,
  TransportMode,
} from "@/generated/client";
import type { Prisma } from "@/generated/client";
import type { SerializedTravelTime } from "@/redux/slices/schedulingSettingsSlice";

// User Scheduling Preferences
export async function fetchUserSchedulingPreferences() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const prefs = await db.userSchedulingPreferences.findUnique({
    where: { userId: session.user.id },
  });

  return prefs ?? null;
}

/**
 * Fetch all user scheduling data at once (preferences + travel times + locations)
 * Called once at login to populate Redux store
 */
export async function fetchAllSchedulingData(): Promise<{
  preferences: {
    bufferTimeMinutes: number;
    defaultTransportMode: TransportMode;
    weekStartDay: number;
  };
  // Full TravelTime rows, every transport mode — the single source of truth for
  // both the Locations UI and the engine (which derives its single-mode matrix
  // from these client-side via deriveTravelTimeMatrix).
  allTravelTimes: SerializedTravelTime[];
  locations: Array<{
    id: string;
    name: string;
    address: string;
    placeId: string;
  }>;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Fetch user preferences
  const prefs = await db.userSchedulingPreferences.findUnique({
    where: { userId: session.user.id },
  });

  const defaultTransportMode = prefs?.defaultTransportMode ?? "DRIVING";

  // Fetch locations and all-mode travel times in parallel
  const [locations, travelTimes] = await Promise.all([
    db.location.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, address: true, placeId: true },
    }),
    db.travelTime.findMany({
      where: { userId: session.user.id },
    }),
  ]);

  const allTravelTimes: SerializedTravelTime[] = travelTimes.map((tt) => ({
    id: tt.id,
    fromLocationId: tt.fromLocationId,
    toLocationId: tt.toLocationId,
    transportMode: tt.transportMode,
    googleRushHourMinutes: tt.googleRushHourMinutes,
    googleRegularMinutes: tt.googleRegularMinutes,
    googleNightMinutes: tt.googleNightMinutes,
    customRushHourMinutes: tt.customRushHourMinutes,
    customRegularMinutes: tt.customRegularMinutes,
    customNightMinutes: tt.customNightMinutes,
    unroutable: tt.unroutableAt !== null,
  }));

  return {
    preferences: {
      bufferTimeMinutes: prefs?.bufferTimeMinutes ?? 5,
      defaultTransportMode,
      weekStartDay: prefs?.weekStartDay ?? 1,
    },
    allTravelTimes,
    locations,
  };
}

export async function updateUserSchedulingPreferences(data: {
  bufferTimeMinutes: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const prefs = await db.userSchedulingPreferences.upsert({
    where: { userId: session.user.id },
    update: {
      bufferTimeMinutes: data.bufferTimeMinutes,
    },
    create: {
      userId: session.user.id,
      bufferTimeMinutes: data.bufferTimeMinutes,
    },
  });

  return prefs;
}

export async function updateWeekStartDay(weekStartDay: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
    throw new Error("weekStartDay must be an integer 0-6");
  }

  const prefs = await db.userSchedulingPreferences.upsert({
    where: { userId: session.user.id },
    update: { weekStartDay },
    create: { userId: session.user.id, weekStartDay },
  });

  return prefs;
}

export async function fetchTaskPreferences(plannerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const planner = await db.planner.findFirst({
    where: { id: plannerId, userId: session.user.id },
  });

  if (!planner) throw new Error("Not Found");

  const prefs = await db.taskPreferences.findUnique({ where: { plannerId } });
  return prefs ?? null;
}

export async function upsertTaskPreferences(
  plannerId: string,
  prefs: {
    taskType?: TaskTypeEnum | null;
    preferredDays?: number[] | null;
    avoidDays?: number[] | null;
    preferredStartTime?: string | null;
    preferredEndTime?: string | null;
    priority?: PriorityLevel | null;
    energyLevel?: EnergyLevel | null;
    allowFlexibility?: boolean | null;
  },
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const planner = await db.planner.findFirst({
    where: { id: plannerId, userId: session.user.id },
  });

  if (!planner) throw new Error("Not Found");

  const updatePayload: Prisma.TaskPreferencesUpdateInput = {
    taskType: prefs.taskType ?? undefined,
    preferredDays: prefs.preferredDays ?? undefined,
    avoidDays: prefs.avoidDays ?? undefined,
    preferredStartTime: prefs.preferredStartTime ?? undefined,
    preferredEndTime: prefs.preferredEndTime ?? undefined,
    priority: prefs.priority ?? undefined,
    energyLevel: prefs.energyLevel ?? undefined,
    allowFlexibility: prefs.allowFlexibility ?? undefined,
  };

  const createPayload: Prisma.TaskPreferencesUncheckedCreateInput = {
    plannerId,
    taskType: prefs.taskType ?? undefined,
    preferredDays: prefs.preferredDays ?? [],
    avoidDays: prefs.avoidDays ?? [],
    preferredStartTime: prefs.preferredStartTime ?? undefined,
    preferredEndTime: prefs.preferredEndTime ?? undefined,
    priority: prefs.priority ?? undefined,
    energyLevel: prefs.energyLevel ?? undefined,
    allowFlexibility: prefs.allowFlexibility ?? true,
  };

  const preferences = await db.taskPreferences.upsert({
    where: { plannerId },
    update: updatePayload,
    create: createPayload,
  });

  return preferences;
}
