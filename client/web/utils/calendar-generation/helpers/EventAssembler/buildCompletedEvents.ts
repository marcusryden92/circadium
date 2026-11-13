import { Planner, SimpleEvent } from "@/types/prisma";
import { v4 as uuidv4 } from "uuid";
import { taskIsCompleted } from "../../../taskHelpers";
import { EventType } from "@/generated/client";
import { calendarColors } from "@/data/calendarColors";
import { stabilizeEvent } from "./stabilizeEvent";
import {
  taskIsSplittable,
  parseCompletedSegments,
  completedSegmentEventId,
} from "../../../taskSplitting";

// taskIsCompleted is type-aware: plans never count as completed, so stale
// completion times on a retyped plan row never move it off its `starts` anchor.
//
// Split tasks are segment-driven: every completed chunk renders at its own
// window (whether or not the task as a whole is done), deterministic id per
// segment, re-derived from the row each regen — never memoized. The classic
// whole-task completion event is emitted only when the row has timestamps and
// no segments (explicitly completed before any chunk was).
export function buildCompletedEvents(
  userId: string,
  planners: Planner[],
  memoizedEventIds: Set<string>,
  previousById: Map<string, SimpleEvent>,
): SimpleEvent[] {
  const now = new Date();
  const events: SimpleEvent[] = [];

  const buildEvent = (
    item: Planner,
    eventId: string,
    start: string,
    end: string,
  ): SimpleEvent => {
    const candidate: SimpleEvent = {
      userId,
      title: item.title,
      id: eventId,
      start,
      end,
      // Planner.color is nullable but the SimpleEvent column is NOT NULL —
      // an uncolored completed item must fall back like buildTaskEvent does,
      // or the sync's bulk UPDATE hits a 23502 on the write.
      backgroundColor: item.color || calendarColors[0],
      borderColor: "",
      duration: null,
      rrule: null,
      extendedProps: {
        id: uuidv4(),
        eventId,
        plannerType: item.plannerType,
        eventType: EventType.planner,
        completedStartTime: start,
        completedEndTime: end,
        parentId: item.parentId ?? null,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    return stabilizeEvent(candidate, previousById.get(eventId));
  };

  for (const item of planners) {
    if (taskIsSplittable(item)) {
      const segments = parseCompletedSegments(item.completedSegments);
      for (const segment of segments) {
        events.push(
          buildEvent(
            item,
            completedSegmentEventId(item.id, segment),
            segment.start,
            segment.end,
          ),
        );
      }
      if (segments.length > 0) continue;
    }

    if (!taskIsCompleted(item) || memoizedEventIds.has(item.id)) continue;
    if (item.completedStartTime && item.completedEndTime) {
      events.push(
        buildEvent(
          item,
          item.id,
          item.completedStartTime,
          item.completedEndTime,
        ),
      );
    }
  }

  return events;
}
