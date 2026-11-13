import { Category, CategoryEvent } from "@/types/prisma";
import { expandCategoryWindowPeriods } from "../TimeSlotManager/expandCategoryWindowPeriods";
import { dateTimeService } from "../../utils/dateTimeService";

// Id pairs windowId with the LOCAL calendar date of the occurrence. Local
// keying tracks user intent — a "Monday 8 AM work" window stays at 8 AM
// through DST and keeps the same id week-to-week. A user who changes
// machine timezone WILL get fresh ids on their next regen, since the
// window's wall-clock identity moves with them.
// The date component is the ORIGINAL rule-derived occurrence (originalStart),
// so an occurrence moved by exception keeps its identity — same rule as plan
// and template occurrences keeping their original key.
// createdAt/updatedAt are empty: DB owns those fields, diff strips them.
export function buildCategoryEvents(
  userId: string,
  constraints: Category[],
  startDate: Date,
  endDate: Date,
): CategoryEvent[] {
  const periods = expandCategoryWindowPeriods(constraints, startDate, endDate);

  return periods.map((period) => {
    const dayKey = dateTimeService.getDayKey(period.originalStart);
    return {
      id: `${period.categoryTimeWindowId}|${dayKey}`,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      trespassingStart: false,
      trespassingEnd: false,
      categoryTimeWindowId: period.categoryTimeWindowId,
      categoryId: period.categoryId,
      userId,
      createdAt: "",
      updatedAt: "",
    };
  });
}
