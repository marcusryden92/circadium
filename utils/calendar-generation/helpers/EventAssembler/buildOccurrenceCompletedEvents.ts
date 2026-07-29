import { Planner, SimpleEvent } from "@/types/prisma";
import { v4 as uuidv4 } from "uuid";
import { EventType } from "@/generated/client";
import { calendarColors } from "@/data/calendarColors";
import { stabilizeEvent } from "./stabilizeEvent";
import {
  occurrenceEventId,
  plannerHasFlexibleRecurrence,
} from "../../../planRecurrence";
import { OccurrenceCompletionInput } from "../../models/SchedulingModels";

// Frozen tiles for completed occurrences of flexibly recurring items — the
// recurrence analog of buildCompletedEvents' segment path. Each logged
// completion re-derives fresh from the planner row (title/color) + the
// completion window, keyed by the same `${plannerId}|${occurrenceKey}` id the
// placed occurrence used, so completing an occurrence is an id-stable
// transition (no diff churn via stabilizeEvent). They join the fixed-event
// fabric so they carve slots + render + persist; expandRecurringItems skips
// those periods so the engine never re-schedules a completed occurrence.
//
// Rows resolve through the planner's structural ROOT: a row on a recurring
// root task freezes the task occurrence, a row on a bottom-layer leaf under a
// recurring goal freezes that leaf's period tile. Plan check-off rows are
// deliberately skipped — the plan occurrence already renders its own anchored
// tile, and a frozen duplicate would double-book the fabric. Rows on nodes
// that are no longer bottom-layer (a completed leaf later given children) are
// stale history and emit nothing.
export function buildOccurrenceCompletedEvents(
  userId: string,
  planners: Planner[],
  completions: OccurrenceCompletionInput[],
  previousById: Map<string, SimpleEvent>,
): SimpleEvent[] {
  if (completions.length === 0) return [];
  const now = new Date();
  const plannerById = new Map(planners.map((p) => [p.id, p]));
  const hasChildren = new Set<string>();
  for (const p of planners) {
    if (p.parentId) hasChildren.add(p.parentId);
  }

  const rootOf = (row: Planner): Planner => {
    let current = row;
    const seen = new Set<string>([current.id]);
    while (current.parentId) {
      const parent = plannerById.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current;
  };

  const events: SimpleEvent[] = [];
  for (const completion of completions) {
    const planner = plannerById.get(completion.plannerId);
    // An orphaned completion (row deleted) is a no-op; the cascade delete
    // removes it on the next write, and it must not render meanwhile.
    if (!planner) continue;
    if (hasChildren.has(planner.id)) continue;

    const root = rootOf(planner);
    if (!plannerHasFlexibleRecurrence(root)) continue;

    const eventId = occurrenceEventId(
      completion.plannerId,
      completion.occurrenceKey,
    );
    const candidate: SimpleEvent = {
      userId,
      title: planner.title,
      id: eventId,
      start: completion.start,
      end: completion.end,
      // Planner.color is nullable but the SimpleEvent column is NOT NULL — an
      // uncolored leaf falls back to its root's color, then the palette.
      backgroundColor: planner.color || root.color || calendarColors[0],
      borderColor: "",
      duration: null,
      rrule: null,
      extendedProps: {
        id: uuidv4(),
        eventId,
        plannerType: planner.plannerType,
        eventType: EventType.planner,
        completedStartTime: completion.start,
        completedEndTime: completion.end,
        parentId: planner.parentId,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    events.push(stabilizeEvent(candidate, previousById.get(eventId)));
  }

  return events;
}
