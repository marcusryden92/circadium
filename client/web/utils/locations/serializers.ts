import type { Location, TravelTime } from "@/types/prisma";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";

export function serializeLocation(loc: Location): SerializedLocation {
  return {
    id: loc.id,
    name: loc.name,
    address: loc.address ?? "",
    placeId: loc.placeId,
  };
}

export function serializeTravelTime(tt: TravelTime): SerializedTravelTime {
  return {
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
  };
}
