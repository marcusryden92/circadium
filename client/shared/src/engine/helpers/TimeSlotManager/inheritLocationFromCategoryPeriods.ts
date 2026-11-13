import { OccupiedInterval } from "../../utils/intervalUtils";
import type { CategoryWindowPeriod } from "./expandCategoryWindowPeriods";

export function inheritLocationFromCategoryPeriods(
  windowPeriods: CategoryWindowPeriod[],
  intervals: OccupiedInterval[],
): OccupiedInterval[] {
  const locationPeriods = windowPeriods.filter((p) => p.locationId != null);
  if (locationPeriods.length === 0) return intervals;

  return intervals.map((interval) => {
    if (interval.startLocationId != null || interval.endLocationId != null)
      return interval;

    const intervalStartMs = interval.start.getTime();
    const intervalEndMs = interval.end.getTime();

    for (const period of locationPeriods) {
      if (
        intervalStartMs >= period.start.getTime() &&
        intervalEndMs <= period.end.getTime()
      ) {
        return {
          ...interval,
          startLocationId: period.locationId!,
          endLocationId: period.locationId!,
        };
      }
    }

    return interval;
  });
}
