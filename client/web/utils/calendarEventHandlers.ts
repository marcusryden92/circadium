import { SimpleEvent, Planner, PlannerType } from "@/types/prisma";
import { EventDropArg } from "@fullcalendar/core/index.js";
import { EventResizeStartArg } from "@fullcalendar/interaction/index.js";
import { EventImpl } from "@fullcalendar/core/internal";
import { v4 as uuidv4 } from "uuid";
import React from "react";
import { getPlannerAndCalendarForCompletedTask } from "@/utils/taskHelpers";
import { deleteGoal } from "@/utils/goalPageHandlers";
import { assert } from "./assert/assert";
import { plannerIdFromEventId } from "./planRecurrence";
import {
  isChunkEventId,
  isCompletedSegmentEventId,
  isSplitEventId,
  parseCompletedSegments,
  segmentStartFromEventId,
  serializeCompletedSegments,
} from "./taskSplitting";
import { historyMessages } from "./historyMessages";
import {
  applyEventResize,
  applyEventStartEdit,
  type UpdateAllFn,
  type UpdatePlannerArrayFn,
} from "@circadium/shared/calendar-core/eventHandlers";

// The pure state transforms (apply*, createPlanFromSelection,
// resolveTemplateOccurrence) live in @circadium/shared/calendar-core; the
// FullCalendar/React-typed adapters below stay here beside the calendar surface.
export * from "@circadium/shared/calendar-core/eventHandlers";

export const handleEventResize = (
  updateAll: UpdateAllFn,
  resizeInfo: EventResizeStartArg,
) => {
  const { event } = resizeInfo;

  assert(event, "Event undefined in handleEventResize");
  assert(event.start, "Event.start undefined in handleEventResize");
  assert(event.end, "Event.end undefined in handleEventResize");

  applyEventResize(updateAll, event.id, event.start, event.end, event.title);
};

export const handleEventDrop = (
  updatePlannerArray: UpdatePlannerArrayFn,
  dropInfo: EventDropArg,
) => {
  const { event } = dropInfo;
  console.debug("[calendar] eventDrop", event.id, event.start?.toISOString());
  if (!event.start) return;

  applyEventStartEdit(updatePlannerArray, event.id, event.start, event.title);
};

export const handleEventCopy = (event: EventImpl, updateAll: UpdateAllFn) => {
  assert(event, "Event undefined in handleEventCopy");
  assert(event.start, "Event.start undefined in handleEventCopy");
  assert(event.end, "Event.end undefined in handleEventCopy");

  if (event.extendedProps.PlannerType === "goal")
    throw new Error("Can't copy goal in handleEventCopy");

  const now = new Date().toISOString();

  updateAll(
    (prevPlanner) => {
      const item = prevPlanner.find(
        (p) => p.id === plannerIdFromEventId(event.id),
      );

      return item
        ? [
            ...prevPlanner,
            {
              ...item,
              id: uuidv4(),
              completedStartTime: null,
              completedEndTime: null,
              createdAt: now,
              updatedAt: now,
            },
          ]
        : prevPlanner;
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { label: historyMessages.item.duplicate(event.title) },
  );
};

export const handleUpdateTitle = (
  title: string,
  setTitle: React.Dispatch<React.SetStateAction<string>>,
  taskId: string,
  calendar: SimpleEvent[],
  updateAll: UpdateAllFn,
) => {
  const plannerId = plannerIdFromEventId(taskId);
  const updatedEvents = calendar?.map((calEvent) => {
    if (plannerIdFromEventId(calEvent.id) === plannerId) {
      return { ...calEvent, title: title };
    }
    return calEvent;
  });

  if (updatedEvents) updateAll((prev) => prev, updatedEvents);

  updateAll(
    (prev) =>
      prev.map((item) => {
        if (item.id === plannerId) {
          return { ...item, title };
        }
        return item;
      }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { label: historyMessages.item.rename(title) },
  );

  setTitle(title);
};

// Completion feedback is React-state-driven (the optimistic override tints the
// tile) — never write colors onto the DOM node here: FullCalendar recycles
// tile elements across regens, and an imperative backgroundColor sticks to
// whatever event inherits the node.
export const handleClickCompleteTask = (
  event: EventImpl,
  isCompleted: boolean,
  setIsCompleted: React.Dispatch<React.SetStateAction<boolean>>,
  planner: Planner[],
  calendar: SimpleEvent[],
  updateAll: UpdateAllFn,
) => {
  if (!event) return;
  const restOptions = (label: string) =>
    [undefined, undefined, undefined, undefined, { label }] as const;

  // Split-task chunks complete per-chunk: the chunk's window is appended to
  // the row's completedSegments (completed minutes are derived by summing),
  // and un-completing a frozen segment removes that entry so its minutes
  // reschedule. The row itself auto-completes when the segments cover its
  // duration — no timestamps are stamped here.
  if (isChunkEventId(event.id) || isCompletedSegmentEventId(event.id)) {
    const plannerId = plannerIdFromEventId(event.id);
    const start = event.start;
    const end = event.end;
    if (!start || !end) return;

    if (isCompletedSegmentEventId(event.id)) {
      const segmentStart = segmentStartFromEventId(event.id);
      setIsCompleted(false);
      updateAll(
        (prev) =>
          prev.map((item) =>
            item.id === plannerId
              ? {
                  ...item,
                  completedSegments: serializeCompletedSegments(
                    parseCompletedSegments(item.completedSegments).filter(
                      (s) => s.start !== segmentStart,
                    ),
                  ),
                }
              : item,
          ),
        (prev) => prev.filter((e) => e.id !== event.id),
        ...restOptions(historyMessages.item.uncomplete(event.title)),
      );
    } else {
      // A chunk that hasn't started yet completes at now, its length preserved
      // (end = now, start = now - chunk length) — same "move it to now" rule a
      // regular dynamic task follows when completed ahead of its scheduled
      // slot. A chunk in progress credits only the elapsed time (floored to
      // five minutes) so the unspent remainder reschedules; a past chunk keeps
      // its actual window.
      const now = new Date();
      let segmentStart = start;
      let segmentEnd = end;
      if (now < start) {
        segmentEnd = now;
        segmentStart = new Date(
          now.getTime() - (end.getTime() - start.getTime()),
        );
      } else if (now <= end) {
        const minEnd = new Date(start.getTime() + 5 * 60 * 1000);
        segmentEnd = now > minEnd ? now : minEnd;
      }
      setIsCompleted(true);
      updateAll(
        (prev) =>
          prev.map((item) =>
            item.id === plannerId
              ? {
                  ...item,
                  completedSegments: serializeCompletedSegments([
                    ...parseCompletedSegments(item.completedSegments),
                    {
                      start: segmentStart.toISOString(),
                      end: segmentEnd.toISOString(),
                    },
                  ]),
                }
              : item,
          ),
        (prev) => prev.filter((e) => e.id !== event.id),
        ...restOptions(historyMessages.item.complete(event.title)),
      );
    }
    return;
  }

  if (isCompleted) {
    setIsCompleted(false);

    // Remove the event from the calendar and clear completed times
    // This allows it to be rescheduled by the calendar generator
    updateAll(
      (prev) =>
        prev.map((item) =>
          item.id === event.id
            ? { ...item, completedStartTime: null, completedEndTime: null }
            : item,
        ),
      (prev) => prev.filter((e) => e.id !== event.id),
      ...restOptions(historyMessages.item.uncomplete(event.title)),
    );
  } else {
    setIsCompleted(true);
    setTimeout(() => {
      const result = getPlannerAndCalendarForCompletedTask(
        planner,
        calendar,
        event,
      );
      if (result) {
        const { manuallyUpdatedTaskArray, manuallyUpdatedCalendar } = result;
        updateAll(
          (prev) => manuallyUpdatedTaskArray || prev,
          manuallyUpdatedCalendar,
          ...restOptions(historyMessages.item.complete(event.title)),
        );
      }
    }, 500);
  }
};

export const handlePostponeTask = (
  event: EventImpl,
  calendar: SimpleEvent[],
  updateAll: UpdateAllFn,
) => {
  const updatedCalendar = calendar?.filter((e) => e.id !== event.id);
  if (updatedCalendar) updateAll((prev) => prev, updatedCalendar);
};

export const handleClickDelete = (
  event: EventImpl,
  calendar: SimpleEvent[],
  updateAll: UpdateAllFn,
  plannerType: string,
  setShowPopover?: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  // No imperative styling here — FullCalendar recycles tile elements, and a
  // red backgroundColor written onto the node outlives this event and paints
  // whatever event inherits the node after the regen.
  const updatedCalendar = calendar?.filter((e) => e.id !== event?.id);

  // Chunk/segment tiles of a split task carry composite ids that match no
  // planner row — Delete means "delete the item", so resolve to the owning
  // row (deleting a single chunk would be a no-op: the regen re-derives it).
  const rowId = isSplitEventId(event.id)
    ? plannerIdFromEventId(event.id)
    : event.id;

  setTimeout(() => {
    if (plannerType === PlannerType.goal) {
      deleteGoal({
        updateAll,
        taskId: rowId,
        manuallyUpdatedCalendar: updatedCalendar,
      });
    } else {
      updateAll(
        (prev) => prev.filter((t) => t.id !== rowId),
        (prev) => prev.filter((t) => t.id !== event.id),
        undefined,
        undefined,
        undefined,
        undefined,
        { label: historyMessages.item.delete(event.title) },
      );
    }
  }, 500);

  if (setShowPopover) setShowPopover(false);
};

export const handleDoubleClick = (
  e: React.MouseEvent,
  elementRef: React.RefObject<HTMLDivElement | null>,
  setEventRect: React.Dispatch<React.SetStateAction<DOMRect | null>>,
  setShowPopover: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  e.stopPropagation();

  if (elementRef.current) {
    setEventRect(elementRef.current.getBoundingClientRect());
    setShowPopover(true);
  }
};
