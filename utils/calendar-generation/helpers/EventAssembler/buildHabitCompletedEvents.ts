import { Planner, SimpleEvent, PlannerType } from "@/types/prisma";
import { v4 as uuidv4 } from "uuid";
import { EventType } from "@/generated/client";
import { calendarColors } from "@/data/calendarColors";
import { stabilizeEvent } from "./stabilizeEvent";
import { occurrenceEventId } from "../../../planRecurrence";
import { HabitCompletionInput } from "../../models/SchedulingModels";

// Frozen tiles for completed habit occurrences — the habit analog of
// buildCompletedEvents' segment path. Each logged completion re-derives fresh
// from the habit row (title/color) + the completion window, keyed by the same
// `${plannerId}|${occurrenceKey}` id the placed occurrence used, so completing a
// habit is an id-stable transition (no diff churn via stabilizeEvent). They join
// the fixed-event fabric so they carve slots + render + persist; expandHabits
// skips these periods so the engine never re-schedules a completed occurrence.
export function buildHabitCompletedEvents(
  userId: string,
  planners: Planner[],
  completions: HabitCompletionInput[],
  previousById: Map<string, SimpleEvent>,
): SimpleEvent[] {
  if (completions.length === 0) return [];
  const now = new Date();
  const habitById = new Map(
    planners
      .filter((p) => p.plannerType === PlannerType.habit)
      .map((p) => [p.id, p]),
  );

  const events: SimpleEvent[] = [];
  for (const completion of completions) {
    const habit = habitById.get(completion.plannerId);
    // An orphaned completion (habit deleted) is a no-op; the cascade delete
    // removes the row on the next write, and it must not render meanwhile.
    if (!habit) continue;

    const eventId = occurrenceEventId(
      completion.plannerId,
      completion.occurrenceKey,
    );
    const candidate: SimpleEvent = {
      userId,
      title: habit.title,
      id: eventId,
      start: completion.start,
      end: completion.end,
      // Planner.color is nullable but the SimpleEvent column is NOT NULL — an
      // uncolored habit falls back like buildTaskEvent / buildCompletedEvents.
      backgroundColor: habit.color || calendarColors[0],
      borderColor: "",
      duration: null,
      rrule: null,
      extendedProps: {
        id: uuidv4(),
        eventId,
        plannerType: PlannerType.habit,
        eventType: EventType.planner,
        completedStartTime: completion.start,
        completedEndTime: completion.end,
        parentId: null,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    events.push(stabilizeEvent(candidate, previousById.get(eventId)));
  }

  return events;
}
