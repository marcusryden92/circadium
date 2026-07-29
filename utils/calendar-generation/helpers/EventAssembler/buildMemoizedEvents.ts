import { SimpleEvent, EventType, PlannerType } from "@/types/prisma";
import {
  isRecurrenceOccurrenceId,
  plannerIdFromEventId,
} from "../../../planRecurrence";

// Plans are excluded from memoization: a plan is deterministic from its own
// planner row (starts + duration), so pinning the old emit here would make
// the engine ignore a starts change on any plan whose block already ended —
// the user drags it, planner.starts updates, and the calendar keeps rendering
// the stale copy. Memoization exists to freeze the engine's own past
// placements, not user-anchored rows.
//
// Split planners are excluded for the same reason: their frozen past is the
// completed-segment list on the row (re-emitted fresh by buildCompletedEvents),
// and an uncompleted past chunk must vanish so its minutes reschedule instead
// of freezing as if they happened.
//
// Recurring occurrences are excluded on the same principle: an occurrence is
// deterministic from (planner row + completion log), so a past UNCOMPLETED
// occurrence must vanish (a "missed" window), and a COMPLETED one re-derives
// fresh from the log via buildOccurrenceCompletedEvents — never frozen from
// the previous emit.
export function buildMemoizedEvents(
  previousCalendar: SimpleEvent[],
  currentDate: Date,
  splitPlannerIds: Set<string>,
): { events: SimpleEvent[]; eventIds: Set<string> } {
  const memoizedEventIds = new Set<string>();
  const events: SimpleEvent[] = [];

  if (previousCalendar.length > 0) {
    const pastEvents = previousCalendar.filter(
      (e) =>
        currentDate > new Date(e.end) &&
        e.extendedProps?.eventType !== EventType.template &&
        e.extendedProps?.eventType !== EventType.travel &&
        e.extendedProps?.eventType !== EventType.category &&
        e.extendedProps?.plannerType !== PlannerType.plan &&
        !isRecurrenceOccurrenceId(e.id) &&
        !splitPlannerIds.has(plannerIdFromEventId(e.id)),
    );
    pastEvents.forEach((e) => memoizedEventIds.add(e.id));
    events.push(...pastEvents);
  }

  return { events, eventIds: memoizedEventIds };
}
