import { Car, Train, Bike, Footprints } from "lucide-react";
import type { TransportMode } from "@/generated/client";

export const SUCCESS_MESSAGE_MS = 3000;

export { MAX_LOCATIONS } from "@/utils/locations/travelRefreshPolicy";

export const TRANSPORT_MODE_OPTIONS = [
  {
    key: "DRIVING" as TransportMode,
    label: (
      <>
        <Car size={11} strokeWidth={2.4} />
        Driving
      </>
    ),
  },
  {
    key: "TRANSIT" as TransportMode,
    label: (
      <>
        <Train size={11} strokeWidth={2.4} />
        Transit
      </>
    ),
  },
  {
    key: "BICYCLING" as TransportMode,
    label: (
      <>
        <Bike size={11} strokeWidth={2.4} />
        Bike
      </>
    ),
  },
  {
    key: "WALKING" as TransportMode,
    label: (
      <>
        <Footprints size={11} strokeWidth={2.4} />
        Walk
      </>
    ),
  },
] as const;
