/**
 * Google Maps API Integration
 *
 * Places API (New) for autocomplete + place details, and the Routes API
 * (computeRouteMatrix) for travel times. All functions are server-side only
 * to protect the API key.
 */

import { TransportMode } from "@/generated/client";

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

export interface TravelTimeResult {
  durationMinutes: number;
  distanceMeters: number;
  status: "OK" | "ZERO_RESULTS" | "NOT_FOUND" | "ERROR";
}

export interface TravelTimeBatchResult {
  fromLocationId: string;
  toLocationId: string;
  rushHour: TravelTimeResult;
  regular: TravelTimeResult;
  night: TravelTimeResult;
}

export interface TravelPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface TravelPair {
  from: TravelPoint;
  to: TravelPoint;
}

// Places API (New) response types
interface PlacesAutocompleteNewResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId: string;
      text: {
        text: string;
      };
      structuredFormat?: {
        mainText: {
          text: string;
        };
        secondaryText?: {
          text: string;
        };
      };
    };
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

interface PlaceDetailsNewResponse {
  id: string;
  formattedAddress: string;
  location: {
    latitude: number;
    longitude: number;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

interface RouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: {
    code?: number;
    message?: string;
  };
  condition?: "ROUTE_EXISTS" | "ROUTE_NOT_FOUND";
  distanceMeters?: number;
  duration?: string;
}

// Map our TransportMode enum to the Routes API travel modes
const TRANSPORT_MODE_MAP: Record<TransportMode, string> = {
  DRIVING: "DRIVE",
  TRANSIT: "TRANSIT",
  BICYCLING: "BICYCLE",
  WALKING: "WALK",
};

// Walking/cycling times don't vary with traffic, so a single fetch covers all
// three time-of-day conditions.
const TIME_VARYING_MODES: TransportMode[] = ["DRIVING", "TRANSIT"];

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string | URL,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if (
      response.ok ||
      attempt >= attempts - 1 ||
      !RETRYABLE_STATUS.has(response.status)
    ) {
      return response;
    }
    const delayMs = 500 * 2 ** attempt + Math.random() * 250;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/**
 * Get the Google Maps API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set");
  }
  return apiKey;
}

/**
 * Search for places using Google Places API (New) - Autocomplete
 *
 * @param query - Search query string
 * @param sessionToken - Optional session token for billing optimization
 * @returns Array of place predictions
 */
export async function searchPlaces(
  query: string,
  sessionToken?: string
): Promise<PlacePrediction[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const apiKey = getApiKey();

  const requestBody: Record<string, unknown> = {
    input: query,
    includedPrimaryTypes: ["street_address", "premise", "subpremise", "establishment"],
  };

  if (sessionToken) {
    requestBody.sessionToken = sessionToken;
  }

  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Places API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as PlacesAutocompleteNewResponse;

  if (data.error) {
    throw new Error(`Places API error: ${data.error.status} - ${data.error.message}`);
  }

  return (data.suggestions || [])
    .filter((s) => s.placePrediction)
    .map((suggestion) => {
      const pred = suggestion.placePrediction!;
      return {
        placeId: pred.placeId,
        description: pred.text.text,
        mainText: pred.structuredFormat?.mainText?.text || pred.text.text,
        secondaryText: pred.structuredFormat?.secondaryText?.text || "",
      };
    });
}

/**
 * Get place details (address + coordinates) using Places API (New).
 *
 * Passing the autocomplete session token here closes the session, so the
 * preceding autocomplete requests bill as one session instead of per keystroke.
 * The field mask stays Essentials-tier — displayName is a Pro-tier field.
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetails> {
  const apiKey = getApiKey();

  const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
  if (sessionToken) {
    url.searchParams.set("sessionToken", sessionToken);
  }

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,formattedAddress,location",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Place Details API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as PlaceDetailsNewResponse;

  if (data.error) {
    throw new Error(`Place Details API error: ${data.error.status} - ${data.error.message}`);
  }

  return {
    placeId: data.id,
    formattedAddress: data.formattedAddress,
    lat: data.location.latitude,
    lng: data.location.longitude,
  };
}

/**
 * Get representative departure times for different time periods
 */
function getDepartureTimes(): {
  rushHour: Date;
  regular: Date;
  night: Date;
} {
  const now = new Date();

  // Find next Monday for consistent results
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));

  // Rush hour: Monday 8:00 AM
  const rushHour = new Date(nextMonday);
  rushHour.setHours(8, 0, 0, 0);

  // Regular: Monday 2:00 PM
  const regular = new Date(nextMonday);
  regular.setHours(14, 0, 0, 0);

  // Night: Monday 11:00 PM
  const night = new Date(nextMonday);
  night.setHours(23, 0, 0, 0);

  return { rushHour, regular, night };
}

function parseMatrixElement(el: RouteMatrixElement | undefined): TravelTimeResult {
  if (!el || (el.status?.code !== undefined && el.status.code !== 0)) {
    return { durationMinutes: 0, distanceMeters: 0, status: "ERROR" };
  }
  if (el.condition !== "ROUTE_EXISTS") {
    return { durationMinutes: 0, distanceMeters: 0, status: "ZERO_RESULTS" };
  }
  const seconds = el.duration ? parseInt(el.duration, 10) : 0;
  return {
    durationMinutes: Math.ceil(seconds / 60),
    distanceMeters: el.distanceMeters ?? 0,
    status: "OK",
  };
}

function toWaypoint(point: TravelPoint) {
  return {
    waypoint: {
      location: {
        latLng: { latitude: point.lat, longitude: point.lng },
      },
    },
  };
}

/**
 * One computeRouteMatrix call: a single origin against a list of destinations.
 * Returns results ordered like the destinations array.
 */
async function computeMatrixRow(
  origin: TravelPoint,
  destinations: TravelPoint[],
  mode: TransportMode,
  departureTime?: Date
): Promise<TravelTimeResult[]> {
  const apiKey = getApiKey();
  const travelMode = TRANSPORT_MODE_MAP[mode];

  const requestBody: Record<string, unknown> = {
    origins: [toWaypoint(origin)],
    destinations: destinations.map(toWaypoint),
    travelMode,
  };
  // TRAFFIC_AWARE is only valid for DRIVE; TRANSIT takes departureTime alone.
  if (mode === "DRIVING") {
    requestBody.routingPreference = "TRAFFIC_AWARE";
  }
  if (departureTime && TIME_VARYING_MODES.includes(mode)) {
    requestBody.departureTime = departureTime.toISOString();
  }

  const response = await fetchWithRetry(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Routes API error: ${response.status} - ${errorText}`);
  }

  const elements = (await response.json()) as RouteMatrixElement[];

  const byDestination = new Map<number, RouteMatrixElement>();
  for (const el of elements) {
    byDestination.set(el.destinationIndex ?? 0, el);
  }

  return destinations.map((_, i) => parseMatrixElement(byDestination.get(i)));
}

/**
 * Compute travel times for an arbitrary set of directed pairs across the three
 * time-of-day conditions, using the Routes API computeRouteMatrix.
 *
 * Pairs are grouped by origin so each request bills exactly the needed
 * elements (never the diagonal). Non-traffic modes (walking, cycling) are
 * fetched once and reused for all three conditions.
 */
export async function computeTravelTimeMatrix(
  pairs: TravelPair[],
  mode: TransportMode
): Promise<TravelTimeBatchResult[]> {
  const byOrigin = new Map<string, { origin: TravelPoint; destinations: TravelPoint[] }>();
  for (const pair of pairs) {
    if (pair.from.id === pair.to.id) continue;
    const group = byOrigin.get(pair.from.id);
    if (group) {
      if (!group.destinations.some((d) => d.id === pair.to.id)) {
        group.destinations.push(pair.to);
      }
    } else {
      byOrigin.set(pair.from.id, { origin: pair.from, destinations: [pair.to] });
    }
  }

  const departureTimes = getDepartureTimes();
  const timeVarying = TIME_VARYING_MODES.includes(mode);

  const groups = Array.from(byOrigin.values());
  const groupResults = await Promise.all(
    groups.map(async ({ origin, destinations }) => {
      if (!timeVarying) {
        const single = await computeMatrixRow(origin, destinations, mode);
        return { origin, destinations, rushHour: single, regular: single, night: single };
      }
      const [rushHour, regular, night] = await Promise.all([
        computeMatrixRow(origin, destinations, mode, departureTimes.rushHour),
        computeMatrixRow(origin, destinations, mode, departureTimes.regular),
        computeMatrixRow(origin, destinations, mode, departureTimes.night),
      ]);
      return { origin, destinations, rushHour, regular, night };
    })
  );

  const results: TravelTimeBatchResult[] = [];
  for (const group of groupResults) {
    group.destinations.forEach((destination, i) => {
      results.push({
        fromLocationId: group.origin.id,
        toLocationId: destination.id,
        rushHour: group.rushHour[i],
        regular: group.regular[i],
        night: group.night[i],
      });
    });
  }
  return results;
}
