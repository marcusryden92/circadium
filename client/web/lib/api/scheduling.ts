import type { SchedulingPreferences } from "@circadium/shared/contracts";
import { apiRequest } from "@/lib/api/client";

// Scheduling-preference writes; reads ride the calendar bootstrap. Only the
// provided fields change — the first write creates the row with column
// defaults for the rest. Outside the OCC diff sync: a preference change never
// bumps dataVersion. defaultTransportMode is written through the locations
// surface, not here.

export function updateSchedulingPreferences(input: {
  bufferTimeMinutes?: number;
  weekStartDay?: number;
}): Promise<SchedulingPreferences> {
  return apiRequest<SchedulingPreferences>("/scheduling/preferences", {
    method: "PATCH",
    body: input,
    authenticated: true,
  });
}
