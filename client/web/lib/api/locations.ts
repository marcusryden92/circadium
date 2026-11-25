import type {
  SerializedLocation,
  SerializedTravelTime,
  TransportMode,
} from "@circadium/shared/contracts";
import { apiRequest } from "@/lib/api/client";

// The location surface's server-first calls: creation and place changes need a
// Google Places lookup and a server-minted id, travel-time fetches need the
// Routes API behind the account-global budget. Name edits, deletes and custom
// overrides stay pure Redux + the OCC diff sync. The travel mutations return
// the account's fresh rows, so no follow-up read is needed. Nothing here bumps
// dataVersion.

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface FetchMissingTravelTimesResult {
  fetched: number;
  skipped: number;
  failed: number;
  travelTimes: SerializedTravelTime[];
}

export interface RefreshAllTravelTimesResult {
  updated: number;
  failed: number;
  travelTimes: SerializedTravelTime[];
}

export function searchPlaces(
  query: string,
  sessionToken?: string,
): Promise<PlacePrediction[]> {
  return apiRequest<PlacePrediction[]>("/locations/search", {
    body: { query, sessionToken },
    authenticated: true,
  });
}

export function createLocation(data: {
  name: string;
  placeId: string;
  sessionToken?: string;
}): Promise<SerializedLocation> {
  return apiRequest<SerializedLocation>("/locations", {
    body: data,
    authenticated: true,
  });
}

export function updateLocation(
  locationId: string,
  data: { name?: string; placeId?: string; sessionToken?: string },
): Promise<SerializedLocation> {
  return apiRequest<SerializedLocation>(
    `/locations/${encodeURIComponent(locationId)}`,
    { method: "PATCH", body: data, authenticated: true },
  );
}

export function fetchMissingTravelTimes(
  transportMode: TransportMode,
): Promise<FetchMissingTravelTimesResult> {
  return apiRequest<FetchMissingTravelTimesResult>(
    "/travel-times/fetch-missing",
    { body: { transportMode }, authenticated: true },
  );
}

export function refreshAllTravelTimes(
  transportMode: TransportMode,
): Promise<RefreshAllTravelTimesResult> {
  return apiRequest<RefreshAllTravelTimesResult>("/travel-times/refresh-all", {
    body: { transportMode },
    authenticated: true,
  });
}
