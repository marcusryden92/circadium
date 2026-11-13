import { Planner, SimpleEvent, PlannerType, EventType } from "@/types/prisma";
import { v4 as uuidv4 } from "uuid";
import { stabilizeEvent } from "./stabilizeEvent";
import {
  expandPlanOccurrences,
  occurrenceEventId,
  parsePlanRecurrence,
  parseRecurrenceExceptions,
  PLAN_RECURRENCE_WINDOW_DAYS,
} from "../../../planRecurrence";

// Plans are always rebuilt from their planner row — never memoized (see
// buildMemoizedEvents). Completion doesn't apply to plans, so completion
// times are ignored here and the plan stays at its `starts` anchor.
// Recurring plans (non-null `recurrence`) expand into one concrete event per
// occurrence with deterministic ids `${plan.id}|${occurrenceKey}`, bounded to
// currentDate + PLAN_RECURRENCE_WINDOW_DAYS, exceptions applied.
export function buildPlanEvents(
  userId: string,
  planners: Planner[],
  memoizedEventIds: Set<string>,
  previousById: Map<string, SimpleEvent>,
  currentDate: Date,
): SimpleEvent[] {
  const planItems = planners.filter(
    (task) =>
      task.plannerType === PlannerType.plan && !memoizedEventIds.has(task.id),
  );

  const now = new Date();
  const windowEnd = new Date(
    currentDate.getTime() + PLAN_RECURRENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const events: SimpleEvent[] = [];

  const buildEvent = (
    plan: Planner,
    eventId: string,
    start: Date,
    end: Date,
  ): SimpleEvent => {
    const planColor = plan.color ?? "black";
    const candidate: SimpleEvent = {
      userId,
      title: plan.title,
      id: eventId,
      start: start.toISOString(),
      end: end.toISOString(),
      extendedProps: {
        id: uuidv4(),
        eventId,
        plannerType: PlannerType.plan,
        eventType: EventType.planner,
        parentId: null,
        completedEndTime: null,
        completedStartTime: null,
      },
      backgroundColor: planColor,
      borderColor: planColor,
      duration: null,
      rrule: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    return stabilizeEvent(candidate, previousById.get(eventId));
  };

  for (const plan of planItems) {
    if (!plan.starts || !plan.duration) continue;

    const rule = parsePlanRecurrence(plan.recurrence);
    if (!rule) {
      const start = new Date(plan.starts);
      const end = new Date(start.getTime() + plan.duration * 60000);
      events.push(buildEvent(plan, plan.id, start, end));
      continue;
    }

    const occurrences = expandPlanOccurrences({
      starts: plan.starts,
      durationMinutes: plan.duration,
      rule,
      exceptions: parseRecurrenceExceptions(plan.recurrenceExceptions),
      windowEnd,
    });
    for (const occurrence of occurrences) {
      events.push(
        buildEvent(
          plan,
          occurrenceEventId(plan.id, occurrence.key),
          occurrence.start,
          occurrence.end,
        ),
      );
    }
  }

  return events;
}
