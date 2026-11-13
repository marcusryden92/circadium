import type { TransportMode } from "@/generated/client";
import type { TravelTime } from "@/types/prisma";
import type { SerializedTravelTime } from "@/redux/slices/schedulingSettingsSlice";

type AnyTravelTime = TravelTime | SerializedTravelTime;

export type TravelPeriod = "rush" | "regular" | "night";

export function getEffectiveTravelTime(
  travelTime: AnyTravelTime,
  period: TravelPeriod,
): number {
  switch (period) {
    case "rush":
      return (
        travelTime.customRushHourMinutes ?? travelTime.googleRushHourMinutes
      );
    case "regular":
      return travelTime.customRegularMinutes ?? travelTime.googleRegularMinutes;
    case "night":
      return travelTime.customNightMinutes ?? travelTime.googleNightMinutes;
  }
}

export function hasCustomOverride(travelTime: AnyTravelTime): boolean {
  return (
    travelTime.customRushHourMinutes !== null ||
    travelTime.customRegularMinutes !== null ||
    travelTime.customNightMinutes !== null
  );
}

export const TIME_VARYING_MODES = new Set<TransportMode>([
  "DRIVING",
  "TRANSIT",
]);

export function isTimeVarying(mode: TransportMode): boolean {
  return TIME_VARYING_MODES.has(mode);
}
