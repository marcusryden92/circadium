import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  TravelEvent,
} from "@/types/prisma";
import { EventType } from "@/types/prisma";
import type { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";
import { endOfDay, startOfDay } from "@/utils/dateUtils";
import { plannerCompletedEnd } from "@/utils/plannerCompletion";
import {
  isRecurrenceOccurrenceId,
  plannerIdFromEventId,
} from "@/utils/planRecurrence";
import {
  getEffectiveCategoryId,
  type InheritedLocationInfo,
} from "@/utils/goalPageHandlers";
import type { AgendaItem } from "./types";

function withinToday(date: Date, dayStart: Date, dayEnd: Date): boolean {
  return date >= dayStart && date <= dayEnd;
}

export function buildTodayAgenda(args: {
  now: Date;
  calendar: SimpleEvent[];
  travelEvents: TravelEvent[];
  templates: EventTemplate[];
  planners: Planner[];
  categories: Category[];
  locations: SerializedLocation[];
  inheritedLocationMap: Map<string, InheritedLocationInfo>;
  queueCategoryByRootId?: Map<string, string>;
}): AgendaItem[] {
  const {
    now,
    calendar,
    travelEvents,
    templates,
    planners,
    categories,
    locations,
    inheritedLocationMap,
    queueCategoryByRootId,
  } = args;

  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  // The engine emits planner-type SimpleEvents with `event.id === planner.id`
  // (see utils/calendar-generation/helpers/Scheduler/buildTaskEvent.ts), so a
  // direct id lookup matches both regular scheduled tasks and completed-item
  // events.
  const plannerById = new Map(planners.map((p) => [p.id, p]));

  const items: AgendaItem[] = [];

  for (const event of calendar) {
    if (event.extendedProps?.eventType !== EventType.planner) continue;
    const start = new Date(event.start);
    if (!withinToday(start, dayStart, dayEnd)) continue;
    const planner = plannerById.get(plannerIdFromEventId(event.id));
    if (!planner) continue;
    const end = new Date(event.end);
    const durationMinutes = Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 60000),
    );

    // Walk the planner parent chain so subtasks/sub-goals inherit their
    // ancestor's category (matches the EventPopover modal pattern).
    const effectiveCategoryId = getEffectiveCategoryId(
      planners,
      planner.id,
      queueCategoryByRootId,
    );
    const category = effectiveCategoryId
      ? categoryById.get(effectiveCategoryId)
      : undefined;
    // A recurring item is never wholesale-completed on its row
    // (plannerCompletedEnd is null for it); a completed occurrence carries its
    // completion on the frozen event tile, so resolve occurrence tiles from
    // the event, not the base row.
    const completed = isRecurrenceOccurrenceId(event.id)
      ? Boolean(event.extendedProps?.completedEndTime)
      : Boolean(plannerCompletedEnd(planner));

    const deadline = planner.deadline ? new Date(planner.deadline) : null;
    const pastDeadline =
      !!deadline && !completed && start.getTime() > deadline.getTime();
    const overdue =
      !!deadline && !completed && deadline.getTime() < dayStart.getTime();

    const isNow = start <= now && now < end;
    const warn = !isNow && !completed && end.getTime() <= now.getTime();

    const where =
      planner.locationId && !planner.useParentLocation
        ? locationById.get(planner.locationId)?.name
        : inheritedLocationMap.get(planner.id)?.locationName;

    items.push({
      id: event.id,
      plannerId: planner.id,
      start,
      end,
      durationMinutes,
      title: event.title,
      travel: false,
      now: isNow,
      next: false,
      warn,
      overdue,
      pastDeadline,
      kind: planner.plannerType,
      categoryId: effectiveCategoryId,
      categoryName: category?.name,
      categoryColor: category?.color,
      where,
    });
  }

  for (const travel of travelEvents) {
    const start = new Date(travel.start);
    if (!withinToday(start, dayStart, dayEnd)) continue;
    const end = new Date(travel.end);
    const fromName = travel.fromLocationId
      ? (locationById.get(travel.fromLocationId)?.name ?? "Unknown")
      : "Anywhere";
    const toName = travel.toLocationId
      ? (locationById.get(travel.toLocationId)?.name ?? "Unknown")
      : "Anywhere";

    items.push({
      id: travel.id,
      start,
      end,
      durationMinutes: travel.travelMinutes,
      title: `${fromName} → ${toName}`,
      travel: true,
      now: start <= now && now < end,
      next: false,
      warn: false,
      overdue: false,
      pastDeadline: false,
      kind: "travel",
    });
  }

  const todayWeekday = now.getDay();
  for (const template of templates) {
    if (template.startDay !== todayWeekday) continue;
    const [hours, minutes] = template.startTime.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) continue;
    const start = new Date(now);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start.getTime() + template.duration * 60000);

    items.push({
      id: template.id,
      start,
      end,
      durationMinutes: template.duration,
      title: template.title,
      travel: false,
      now: start <= now && now < end,
      next: false,
      warn: false,
      overdue: false,
      pastDeadline: false,
      kind: "template",
      where: template.locationId
        ? locationById.get(template.locationId)?.name
        : undefined,
    });
  }

  const sorted = items.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Only flag NEXT when nothing is currently in progress. Marks the first
  // upcoming row (earliest start > now) so the user always has a clear
  // anchor for "what to look at" — NOW when something's running, NEXT
  // otherwise.
  const anyNow = sorted.some((it) => it.now);
  if (!anyNow) {
    const upcoming = sorted.find((it) => it.start.getTime() > now.getTime());
    if (upcoming) {
      upcoming.next = true;
      upcoming.startsInMinutes = Math.ceil(
        (upcoming.start.getTime() - now.getTime()) / 60000,
      );
    }
  }

  return sorted;
}
