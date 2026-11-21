import { TravelTimeEntry } from "../../models/SchedulingModels";
import { LOCATION_CONFIG } from "../../constants";

// Single source of truth for the time-of-day bucket. The reservation path
// (getTravelTime) and the scoring path (LocationGroupingStrategy) previously
// hardcoded divergent windows (16-19 vs 17-19 evening rush, 22 vs 21 night
// start, no weekend exemption), so the strategy could score a slot assuming
// one travel duration while reservation carved a different one.
export function travelMinutesForTime(
  entry: TravelTimeEntry,
  atTime: Date,
): number {
  const hour = atTime.getHours();
  const dayOfWeek = atTime.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const isRushHour =
    !isWeekend &&
    ((hour >= LOCATION_CONFIG.RUSH_HOUR_MORNING_START &&
      hour < LOCATION_CONFIG.RUSH_HOUR_MORNING_END) ||
      (hour >= LOCATION_CONFIG.RUSH_HOUR_EVENING_START &&
        hour < LOCATION_CONFIG.RUSH_HOUR_EVENING_END));
  if (isRushHour) return entry.rushHourMinutes;

  const isNight =
    hour >= LOCATION_CONFIG.NIGHT_START || hour < LOCATION_CONFIG.NIGHT_END;
  if (isNight) return entry.nightMinutes;

  return entry.regularMinutes;
}

export function getTravelTime(
  travelTimeMatrix: Map<string, TravelTimeEntry> | null,
  fromLocationId: string | null,
  toLocationId: string | null,
  timeOfDay: Date,
): number {
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) {
    return 0;
  }

  if (!travelTimeMatrix) {
    return 0;
  }

  const travelKey = `${fromLocationId}->${toLocationId}`;
  const entry = travelTimeMatrix.get(travelKey);

  // Absent covers never-fetched AND negative-cached unroutable pairs (dropped
  // in deriveTravelTimeMatrix) — both schedule as instant travel. Known-
  // impossible is flagged in the Locations UI, not here; the override is the
  // escape hatch.
  if (!entry) {
    return 0;
  }

  return travelMinutesForTime(entry, timeOfDay);
}
