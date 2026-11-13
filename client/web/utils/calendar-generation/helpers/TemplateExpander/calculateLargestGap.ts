import { EventTemplate } from "@/types/prisma";
import { TIME_CONSTANTS } from "../../constants";
import { dateTimeService } from "../../utils/dateTimeService";
import { gapIntervalsForDay } from "./gapIntervalsForDay";
import { getPerTemplateMasks } from "./getPerTemplateMasks";

export function calculateLargestGap(templates: EventTemplate[]): number {
  if (templates.length === 0) {
    return TIME_CONSTANTS.MINUTES_PER_WEEK;
  }

  const weekStart = dateTimeService.startOfDay(new Date());
  const masks = getPerTemplateMasks(templates);

  let largestGap = 0;
  for (let d = 0; d < 7; d++) {
    const dayStart = dateTimeService.shiftDays(weekStart, d);
    const gaps = gapIntervalsForDay(masks, dayStart);
    for (const gap of gaps) {
      const len = (gap.end.getTime() - gap.start.getTime()) / 60000;
      if (len > largestGap) largestGap = len;
    }
  }

  return largestGap;
}
