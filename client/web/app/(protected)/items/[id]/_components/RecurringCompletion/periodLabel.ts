import { format } from "date-fns";
import type { RecurringInstance } from "@/utils/recurringInstances";

const DAY_MS = 86_400_000;

// "Mon, Jan 5" for single-day (daily) periods, "Jan 5 – Jan 11" for multi-day
// (weekly/monthly) ones. The period end is exclusive, so the range end is the
// day before.
export function formatPeriodLabel(instance: RecurringInstance): string {
  const spanDays = Math.round(
    (instance.end.getTime() - instance.start.getTime()) / DAY_MS,
  );
  if (spanDays <= 1) return format(instance.start, "EEE, MMM d");
  const lastDay = new Date(instance.end.getTime() - DAY_MS);
  return `${format(instance.start, "MMM d")} – ${format(lastDay, "MMM d")}`;
}
