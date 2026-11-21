import type { Planner, SimpleEvent, Category } from "@/types/prisma";
import { EventType, PlannerType } from "@/types/prisma";
import { startOfDay } from "@/utils/dateUtils";
import { getEffectiveCategoryId } from "@/utils/goalPageHandlers";
import type { UncompletedItem } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Scheduled calendar events whose end is in the past AND whose underlying
// planner isn't marked complete. Distinct from "overdue" (deadline-based) —
// these are events the engine placed on the calendar that the user never
// finished. Sorted most-recently-missed first.
export function buildUncompletedItems(args: {
  now: Date;
  planners: Planner[];
  categories: Category[];
  calendar: SimpleEvent[];
  queueCategoryByRootId?: Map<string, string>;
}): UncompletedItem[] {
  const { now, planners, categories, calendar, queueCategoryByRootId } = args;
  const nowMs = now.getTime();
  const dayStart = startOfDay(now);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const plannerById = new Map(planners.map((p) => [p.id, p]));

  const rows: UncompletedItem[] = [];
  for (const event of calendar) {
    if (event.extendedProps?.eventType !== EventType.planner) continue;
    const end = new Date(event.end);
    if (end.getTime() > nowMs) continue;

    const planner = plannerById.get(event.id);
    if (!planner) continue;
    if (planner.completedEndTime) continue;
    // Plans are excluded: they are fixed-time anchors, not completable items.
    if (
      planner.plannerType !== PlannerType.task &&
      planner.plannerType !== PlannerType.goal
    ) {
      continue;
    }

    const start = new Date(event.start);
    const daysAgo = Math.max(
      0,
      Math.floor((dayStart.getTime() - startOfDay(end).getTime()) / MS_PER_DAY),
    );

    const effectiveCategoryId = getEffectiveCategoryId(
      planners,
      planner.id,
      queueCategoryByRootId,
    );
    const category = effectiveCategoryId
      ? categoryById.get(effectiveCategoryId)
      : undefined;

    rows.push({
      id: `uncompleted-${event.id}`,
      plannerId: planner.id,
      eventId: event.id,
      title: planner.title,
      scheduledStart: start,
      scheduledEnd: end,
      daysAgo,
      kind: planner.plannerType,
      categoryName: category?.name,
      categoryColor: category?.color,
    });
  }

  rows.sort((a, b) => b.scheduledEnd.getTime() - a.scheduledEnd.getTime());
  return rows;
}
