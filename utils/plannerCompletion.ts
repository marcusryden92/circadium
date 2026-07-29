import { Planner, PlannerType } from "@/types/prisma";
import { parseCompletedSegments, splitIsExhausted } from "./taskSplitting";
import { plannerHasFlexibleRecurrence } from "./planRecurrence";

// Completion never applies to plans or flexibly recurring items. The
// item-detail type picker can retype a completed item to plan (and a repeat
// rule can be added to a completed task), leaving stale completion times on
// the row, so completion checks must gate on shape rather than the timestamps
// alone. (A recurring item is never wholesale-completed — completion lives
// per-occurrence in OccurrenceCompletion.) Split tasks auto-complete when
// their segments cover the duration.
function completionApplies(item: Planner): boolean {
  return (
    item.plannerType !== PlannerType.plan &&
    !plannerHasFlexibleRecurrence(item)
  );
}

export function plannerIsCompleted(item: Planner): boolean {
  if (!completionApplies(item)) return false;
  if (item.completedStartTime && item.completedEndTime) return true;
  return splitIsExhausted(item);
}

export function plannerCompletedEnd(item: Planner): string | null {
  if (!completionApplies(item)) return null;
  if (item.completedEndTime) return item.completedEndTime;
  if (!splitIsExhausted(item)) return null;
  const segments = parseCompletedSegments(item.completedSegments);
  if (!segments.length) return null;
  return segments.reduce(
    (latest, s) => (s.end > latest ? s.end : latest),
    segments[0].end,
  );
}
