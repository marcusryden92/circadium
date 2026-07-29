"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  searchPlaces as googleSearchPlaces,
  getPlaceDetails,
  computeTravelTimeMatrix,
  type TravelPair,
  type TravelTimeBatchResult,
} from "@/lib/google-maps-api";
import type { TransportMode } from "@/generated/client";
import type { Location, TravelTime } from "@/types/prisma";
import {
  needsRefetch,
  refreshAllGate,
  topUpAllowed,
  reserveElements,
  elementsForPairs,
  STALE_TOP_UP_MAX_PAIRS,
  MAX_LOCATIONS,
} from "@/utils/locations/travelRefreshPolicy";
import { isTimeVarying } from "@/utils/locations/travelTime";

// Per-user throttle on the Google-proxying search action. In-memory, so it is
// per server instance — the hard stop lives in Cloud Console quotas.
const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_MS = 60_000;
const searchWindows = new Map<string, { count: number; resetAt: number }>();

function assertSearchAllowed(userId: string): void {
  const now = Date.now();
  const window = searchWindows.get(userId);
  if (!window || now >= window.resetAt) {
    searchWindows.set(userId, { count: 1, resetAt: now + SEARCH_WINDOW_MS });
    return;
  }
  window.count += 1;
  if (window.count > SEARCH_LIMIT) {
    throw new Error("Too many address searches — wait a moment and try again.");
  }
}

function allConditionsRouted(result: TravelTimeBatchResult): boolean {
  return (
    result.rushHour.status === "OK" &&
    result.regular.status === "OK" &&
    result.night.status === "OK"
  );
}

// Reserve billed elements against the account-global monthly counter before a
// matrix call — the hard stop that keeps matrix spend inside the free tier.
// Runs in a transaction so concurrent fetches can't both slip under the cap;
// reservation precedes the Google call, so a failed call may overcount, never
// under.
async function reserveTravelElements(
  pairCount: number,
  transportMode: TransportMode,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const planned = elementsForPairs(pairCount, isTimeVarying(transportMode));
  return db.$transaction(async (tx) => {
    const row = await tx.travelApiBudget.findUnique({
      where: { id: "global" },
    });
    const reservation = reserveElements({
      now: Date.now(),
      planned,
      count: row?.elementsThisMonth ?? 0,
      periodStart: row?.periodStart ?? null,
    });
    if (!reservation.allowed) {
      return { ok: false as const, reason: reservation.reason };
    }
    await tx.travelApiBudget.upsert({
      where: { id: "global" },
      update: {
        elementsThisMonth: reservation.nextCount,
        periodStart: reservation.periodStart,
      },
      create: {
        id: "global",
        elementsThisMonth: reservation.nextCount,
        periodStart: reservation.periodStart,
      },
    });
    return { ok: true as const };
  });
}

// The one write path for matrix results. Routed pairs store real values and
// clear any unroutable mark; failed pairs are negative-cached (zeros + an
// unroutableAt stamp) so the missing-pairs diff stops re-buying the same
// failure — the engine and matrix UI read the stamp as no-route, never as
// zero-duration travel. Custom overrides are never touched.
async function writeTravelMatrixResults(
  userId: string,
  transportMode: TransportMode,
  results: TravelTimeBatchResult[],
): Promise<{ written: number; failed: number }> {
  const now = new Date();
  let written = 0;
  let failed = 0;

  for (const result of results) {
    const routed = allConditionsRouted(result);
    const where = {
      fromLocationId_toLocationId_transportMode: {
        fromLocationId: result.fromLocationId,
        toLocationId: result.toLocationId,
        transportMode,
      },
    };
    if (routed) {
      await db.travelTime.upsert({
        where,
        update: {
          googleRushHourMinutes: result.rushHour.durationMinutes,
          googleRegularMinutes: result.regular.durationMinutes,
          googleNightMinutes: result.night.durationMinutes,
          unroutableAt: null,
        },
        create: {
          fromLocationId: result.fromLocationId,
          toLocationId: result.toLocationId,
          transportMode,
          googleRushHourMinutes: result.rushHour.durationMinutes,
          googleRegularMinutes: result.regular.durationMinutes,
          googleNightMinutes: result.night.durationMinutes,
          userId,
        },
      });
      written++;
    } else {
      await db.travelTime.upsert({
        where,
        update: { unroutableAt: now },
        create: {
          fromLocationId: result.fromLocationId,
          toLocationId: result.toLocationId,
          transportMode,
          googleRushHourMinutes: 0,
          googleRegularMinutes: 0,
          googleNightMinutes: 0,
          unroutableAt: now,
          userId,
        },
      });
      failed++;
    }
  }

  return { written, failed };
}

// ============================================================================
// Location CRUD Operations
// ============================================================================

/**
 * Fetch all locations for the current user
 */
export async function fetchLocations(): Promise<Location[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const locations = await db.location.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return locations;
}

/**
 * Search for places using Google Places Autocomplete
 * Returns place predictions for the autocomplete dropdown
 */
export async function searchPlaces(query: string, sessionToken?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  assertSearchAllowed(session.user.id);
  return googleSearchPlaces(query, sessionToken);
}

/**
 * Create a new location
 * Does NOT automatically fetch travel times - user must click "Fetch Travel Times"
 */
export async function createLocation(data: {
  name: string;
  placeId: string;
  sessionToken?: string;
}): Promise<Location> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Check location limit
  const existingCount = await db.location.count({
    where: { userId: session.user.id },
  });

  if (existingCount >= MAX_LOCATIONS) {
    throw new Error(`Maximum of ${MAX_LOCATIONS} locations allowed`);
  }

  // Check if location already exists for this user
  const existing = await db.location.findUnique({
    where: {
      userId_placeId: {
        userId: session.user.id,
        placeId: data.placeId,
      },
    },
  });

  if (existing) {
    throw new Error("This location has already been added");
  }

  // Get place details from Google
  const placeDetails = await getPlaceDetails(data.placeId, data.sessionToken);

  // Create the location
  const location = await db.location.create({
    data: {
      name: data.name,
      address: placeDetails.formattedAddress,
      placeId: data.placeId,
      lat: placeDetails.lat,
      lng: placeDetails.lng,
      userId: session.user.id,
    },
  });

  return location;
}

/**
 * Update a location's name
 */
export async function updateLocationName(
  locationId: string,
  name: string,
): Promise<Location> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const location = await db.location.findFirst({
    where: { id: locationId, userId: session.user.id },
  });

  if (!location) {
    throw new Error("Location not found");
  }

  const updated = await db.location.update({
    where: { id: locationId },
    data: { name },
  });

  return updated;
}

/**
 * Update a location's name and/or place. If placeId changes, the row's
 * address, lat, and lng are refetched from Google and every travel time
 * touching this location is deleted so the matrix re-fetches them on demand.
 */
export async function updateLocation(
  locationId: string,
  data: { name?: string; placeId?: string; sessionToken?: string },
): Promise<Location> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const location = await db.location.findFirst({
    where: { id: locationId, userId: session.user.id },
  });

  if (!location) {
    throw new Error("Location not found");
  }

  const placeChanged = !!data.placeId && data.placeId !== location.placeId;

  const updates: {
    name?: string;
    address?: string;
    placeId?: string;
    lat?: number;
    lng?: number;
  } = {};
  if (data.name !== undefined) updates.name = data.name;

  if (placeChanged) {
    // Reject if this placeId is already used by another of the user's
    // locations — the unique index on (userId, placeId) would throw an
    // opaque error otherwise.
    const dupe = await db.location.findUnique({
      where: {
        userId_placeId: {
          userId: session.user.id,
          placeId: data.placeId!,
        },
      },
    });
    if (dupe && dupe.id !== locationId) {
      throw new Error("Another location already uses this place");
    }
    const details = await getPlaceDetails(data.placeId!, data.sessionToken);
    updates.address = details.formattedAddress;
    updates.placeId = data.placeId!;
    updates.lat = details.lat;
    updates.lng = details.lng;
  }

  const updated = await db.location.update({
    where: { id: locationId },
    data: updates,
  });

  if (placeChanged) {
    await db.travelTime.deleteMany({
      where: {
        userId: session.user.id,
        OR: [
          { fromLocationId: locationId },
          { toLocationId: locationId },
        ],
      },
    });
  }

  return updated;
}

/**
 * Delete a location and all associated travel times
 */
export async function deleteLocation(locationId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const location = await db.location.findFirst({
    where: { id: locationId, userId: session.user.id },
  });

  if (!location) {
    throw new Error("Location not found");
  }

  // Cascade delete will handle travel times due to onDelete: Cascade
  await db.location.delete({
    where: { id: locationId },
  });
}

// ============================================================================
// Travel Time Operations
// ============================================================================

/**
 * Fetch all travel times for the current user
 */
export async function fetchTravelTimes(): Promise<TravelTime[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const travelTimes = await db.travelTime.findMany({
    where: { userId: session.user.id },
    include: {
      fromLocation: true,
      toLocation: true,
    },
  });

  return travelTimes;
}

/**
 * Fetch travel times for a specific transport mode
 */
export async function fetchTravelTimesByMode(
  transportMode: TransportMode,
): Promise<TravelTime[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const travelTimes = await db.travelTime.findMany({
    where: {
      userId: session.user.id,
      transportMode,
    },
    include: {
      fromLocation: true,
      toLocation: true,
    },
  });

  return travelTimes;
}

/**
 * Fetch travel times from Google API for all location pairs that don't have times yet
 * Only fetches missing pairs - incremental update
 */
export async function fetchMissingTravelTimes(
  transportMode: TransportMode,
): Promise<{ fetched: number; skipped: number; failed: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const locations = await db.location.findMany({
    where: { userId: session.user.id },
  });

  if (locations.length < 2) {
    return { fetched: 0, skipped: 0, failed: 0 };
  }

  // Existing rows count as "have it" only while fresh: routable rows inside
  // the TTL, negative-cached unroutable rows inside their retry window. Stale
  // and aged-out rows fall back into the missing set and re-fetch.
  const existingTimes = await db.travelTime.findMany({
    where: {
      userId: session.user.id,
      transportMode,
    },
    select: {
      fromLocationId: true,
      toLocationId: true,
      updatedAt: true,
      unroutableAt: true,
    },
  });

  const now = Date.now();
  const freshPairs = new Set(
    existingTimes
      .filter((t) => !needsRefetch(t, now))
      .map((t) => `${t.fromLocationId}-${t.toLocationId}`),
  );

  const missingPairs: TravelPair[] = [];
  for (const from of locations) {
    for (const to of locations) {
      if (from.id === to.id) continue; // Skip self-referential
      if (!freshPairs.has(`${from.id}-${to.id}`)) {
        missingPairs.push({
          from: { id: from.id, lat: from.lat, lng: from.lng },
          to: { id: to.id, lat: to.lat, lng: to.lng },
        });
      }
    }
  }

  if (missingPairs.length === 0) {
    return { fetched: 0, skipped: freshPairs.size, failed: 0 };
  }

  const budget = await reserveTravelElements(missingPairs.length, transportMode);
  if (!budget.ok) {
    throw new Error(budget.reason);
  }

  const results = await computeTravelTimeMatrix(missingPairs, transportMode);
  const { written, failed } = await writeTravelMatrixResults(
    session.user.id,
    transportMode,
    results,
  );

  return { fetched: written, skipped: freshPairs.size, failed };
}

/**
 * Silent, capped background refresh of the stalest cached pairs (TTL-aged
 * routable rows and retry-eligible unroutable rows). Called once per app load;
 * the cap bounds what a returning user's session may spend, and the remainder
 * tops up incrementally across sessions.
 */
export async function topUpStaleTravelTimes(
  transportMode: TransportMode,
): Promise<{ refreshed: number; failed: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const now = Date.now();

  // Persisted daily allowance: the per-session cap alone wouldn't bound spend
  // (a refresh, a second tab, and a phone are each a fresh session).
  const prefs = await db.userSchedulingPreferences.findUnique({
    where: { userId: session.user.id },
    select: { lastTravelTopUpAt: true },
  });
  if (!topUpAllowed(now, prefs?.lastTravelTopUpAt ?? null)) {
    return { refreshed: 0, failed: 0 };
  }

  const rows = await db.travelTime.findMany({
    where: { userId: session.user.id, transportMode },
  });

  const stale = rows
    .filter((row) => needsRefetch(row, now))
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .slice(0, STALE_TOP_UP_MAX_PAIRS);

  if (stale.length === 0) {
    return { refreshed: 0, failed: 0 };
  }

  const locations = await db.location.findMany({
    where: { userId: session.user.id },
  });
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const pairs: TravelPair[] = [];
  for (const row of stale) {
    const from = locationById.get(row.fromLocationId);
    const to = locationById.get(row.toLocationId);
    if (!from || !to) continue;
    pairs.push({
      from: { id: from.id, lat: from.lat, lng: from.lng },
      to: { id: to.id, lat: to.lat, lng: to.lng },
    });
  }

  if (pairs.length === 0) {
    return { refreshed: 0, failed: 0 };
  }

  // Silent path: a budget refusal is a quiet no-op, not an error banner.
  const budget = await reserveTravelElements(pairs.length, transportMode);
  if (!budget.ok) {
    return { refreshed: 0, failed: 0 };
  }

  // Stamp only when elements are actually about to be spent — a no-op check
  // must not consume the day's allowance.
  await db.userSchedulingPreferences.upsert({
    where: { userId: session.user.id },
    update: { lastTravelTopUpAt: new Date() },
    create: { userId: session.user.id, lastTravelTopUpAt: new Date() },
  });

  const results = await computeTravelTimeMatrix(pairs, transportMode);
  const { written, failed } = await writeTravelMatrixResults(
    session.user.id,
    transportMode,
    results,
  );

  return { refreshed: written, failed };
}

/**
 * Refresh all travel times from Google API
 * Preserves custom overrides - only updates Google values
 */
export async function refreshAllTravelTimes(
  transportMode: TransportMode,
): Promise<{ updated: number; failed: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const locations = await db.location.findMany({
    where: { userId: session.user.id },
  });

  if (locations.length < 2) {
    return { updated: 0, failed: 0 };
  }

  // Two persisted guards (see travelRefreshPolicy): a mode-independent rate
  // limit on the action, and a staleness check keyed on the OLDEST row so one
  // freshly fetched pair can't mask a cache full of stale ones.
  const prefs = await db.userSchedulingPreferences.findUnique({
    where: { userId: session.user.id },
    select: { lastTravelRefreshAt: true },
  });
  const oldest = await db.travelTime.findFirst({
    where: { userId: session.user.id, transportMode },
    orderBy: { updatedAt: "asc" },
    select: { updatedAt: true },
  });
  const verdict = refreshAllGate({
    now: Date.now(),
    lastRefreshAt: prefs?.lastTravelRefreshAt ?? null,
    oldestUpdatedAt: oldest?.updatedAt ?? null,
  });
  if (!verdict.allowed) {
    throw new Error(verdict.reason);
  }

  const pairs: TravelPair[] = [];
  for (const from of locations) {
    for (const to of locations) {
      if (from.id === to.id) continue;
      pairs.push({
        from: { id: from.id, lat: from.lat, lng: from.lng },
        to: { id: to.id, lat: to.lat, lng: to.lng },
      });
    }
  }

  const budget = await reserveTravelElements(pairs.length, transportMode);
  if (!budget.ok) {
    throw new Error(budget.reason);
  }

  // Stamped only once the run is actually going to spend — a gate or budget
  // refusal must not consume the hourly cooldown.
  await db.userSchedulingPreferences.upsert({
    where: { userId: session.user.id },
    update: { lastTravelRefreshAt: new Date() },
    create: { userId: session.user.id, lastTravelRefreshAt: new Date() },
  });

  const results = await computeTravelTimeMatrix(pairs, transportMode);
  const { written, failed } = await writeTravelMatrixResults(
    session.user.id,
    transportMode,
    results,
  );

  return { updated: written, failed };
}

/**
 * Update custom travel time override
 * Set to null to revert to Google value
 */
export async function updateTravelTimeOverride(
  travelTimeId: string,
  overrides: {
    customRushHourMinutes?: number | null;
    customRegularMinutes?: number | null;
    customNightMinutes?: number | null;
  },
): Promise<TravelTime> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const travelTime = await db.travelTime.findFirst({
    where: { id: travelTimeId, userId: session.user.id },
  });

  if (!travelTime) {
    throw new Error("Travel time not found");
  }

  const updated = await db.travelTime.update({
    where: { id: travelTimeId },
    data: {
      customRushHourMinutes: overrides.customRushHourMinutes,
      customRegularMinutes: overrides.customRegularMinutes,
      customNightMinutes: overrides.customNightMinutes,
    },
  });

  return updated;
}

/**
 * Clear all custom overrides for a travel time (revert to Google values)
 */
export async function clearTravelTimeOverrides(
  travelTimeId: string,
): Promise<TravelTime> {
  return updateTravelTimeOverride(travelTimeId, {
    customRushHourMinutes: null,
    customRegularMinutes: null,
    customNightMinutes: null,
  });
}

// ============================================================================
// Planner Location Assignment
// ============================================================================

/**
 * Assign a location to a planner item
 * Set locationId to null for "Anywhere" (no specific location)
 */
export async function assignLocationToPlanner(
  plannerId: string,
  locationId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const planner = await db.planner.findFirst({
    where: { id: plannerId, userId: session.user.id },
  });

  if (!planner) {
    throw new Error("Planner item not found");
  }

  // If locationId is provided, verify it belongs to the user
  if (locationId) {
    const location = await db.location.findFirst({
      where: { id: locationId, userId: session.user.id },
    });

    if (!location) {
      throw new Error("Location not found");
    }
  }

  await db.planner.update({
    where: { id: plannerId },
    data: { locationId },
  });
}

/**
 * Set useParentLocation for a planner item.
 * When true, the category's location overrides the item's own locationId.
 * The item's locationId is preserved so it can be restored by toggling back off.
 */
export async function setUseParentLocation(
  plannerId: string,
  useParentLocation: boolean,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const result = await db.planner.updateMany({
    where: { id: plannerId, userId: session.user.id },
    data: { useParentLocation },
  });

  if (result.count === 0) {
    throw new Error("Planner item not found");
  }
}

/**
 * Set useParentLocation for multiple planner items at once
 */
export async function setUseParentLocationMultiple(
  plannerIds: string[],
  useParentLocation: boolean,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.planner.updateMany({
    where: {
      id: { in: plannerIds },
      userId: session.user.id,
    },
    data: { useParentLocation },
  });
}

/**
 * Assign a location to a template
 * Set locationId to null for "Anywhere" (no specific location)
 */
export async function assignLocationToTemplate(
  templateId: string,
  locationId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, userId: session.user.id },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  // If locationId is provided, verify it belongs to the user
  if (locationId) {
    const location = await db.location.findFirst({
      where: { id: locationId, userId: session.user.id },
    });

    if (!location) {
      throw new Error("Location not found");
    }
  }

  await db.eventTemplate.update({
    where: { id: templateId },
    data: { locationId },
  });
}

/**
 * Assign a location to multiple planner items at once
 * Useful for cascading location changes to child items
 */
export async function assignLocationToMultiplePlanners(
  plannerIds: string[],
  locationId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // If locationId is provided, verify it belongs to the user
  if (locationId) {
    const location = await db.location.findFirst({
      where: { id: locationId, userId: session.user.id },
    });

    if (!location) {
      throw new Error("Location not found");
    }
  }

  // Update all planners that belong to this user
  await db.planner.updateMany({
    where: {
      id: { in: plannerIds },
      userId: session.user.id,
    },
    data: { locationId },
  });
}

// ============================================================================
// User Preferences
// ============================================================================

/**
 * Get user's default transport mode
 */
export async function getDefaultTransportMode(): Promise<TransportMode> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const prefs = await db.userSchedulingPreferences.findUnique({
    where: { userId: session.user.id },
  });

  return prefs?.defaultTransportMode ?? "DRIVING";
}

/**
 * Update user's default transport mode
 */
export async function updateDefaultTransportMode(
  transportMode: TransportMode,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.userSchedulingPreferences.upsert({
    where: { userId: session.user.id },
    update: { defaultTransportMode: transportMode },
    create: {
      userId: session.user.id,
      defaultTransportMode: transportMode,
    },
  });
}

// NOTE: Utility functions getEffectiveTravelTime and hasCustomOverride
// have been moved to @/utils/locationHelpers.ts

// ============================================================================
// Calendar Generation Support
// ============================================================================

/**
 * Fetch travel times formatted for calendar generation
 * Returns an array that can be converted to a Map on the client
 */
export async function fetchTravelTimesForCalendar(
  transportMode?: TransportMode,
): Promise<{
  matrix: Array<{
    key: string;
    fromLocationId: string;
    toLocationId: string;
    rushHourMinutes: number;
    regularMinutes: number;
    nightMinutes: number;
  }>;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get user's default transport mode if not specified
  const mode =
    transportMode ??
    (
      await db.userSchedulingPreferences.findUnique({
        where: { userId: session.user.id },
      })
    )?.defaultTransportMode ??
    "DRIVING";

  const travelTimes = await db.travelTime.findMany({
    where: {
      userId: session.user.id,
      transportMode: mode,
    },
  });

  // Convert to array format that can be serialized
  const matrix = travelTimes.map((tt) => ({
    key: `${tt.fromLocationId}->${tt.toLocationId}`,
    fromLocationId: tt.fromLocationId,
    toLocationId: tt.toLocationId,
    rushHourMinutes: tt.customRushHourMinutes ?? tt.googleRushHourMinutes,
    regularMinutes: tt.customRegularMinutes ?? tt.googleRegularMinutes,
    nightMinutes: tt.customNightMinutes ?? tt.googleNightMinutes,
  }));

  return { matrix };
}
