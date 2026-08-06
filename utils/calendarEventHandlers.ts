import {
  SimpleEvent,
  Planner,
  EventTemplate,
  PlannerType,
  Category,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import { EventDropArg } from "@fullcalendar/core/index.js";
import { EventResizeStartArg } from "@fullcalendar/interaction/index.js";
import { EventImpl } from "@fullcalendar/core/internal";
import { v4 as uuidv4 } from "uuid";
import React from "react";
import { getDuration } from "./calendarUtils";
import { getPlannerAndCalendarForCompletedTask } from "@/utils/taskHelpers";
import { deleteGoal } from "@/utils/goalPageHandlers";
import { assert } from "./assert/assert";
import { getTimeFromDate } from "./templateBuilderUtils";
import { WeekDayIntegers } from "@/types/calendarTypes";
import {
  occurrenceKey,
  occurrenceKeyFromEventId,
  parseRecurrenceExceptions,
  serializeRecurrenceExceptions,
  shiftRecurrenceExceptions,
  upsertDeletedException,
  upsertMovedException,
  clearMovedDuration,
  removeException,
  plannerIdFromEventId,
} from "./planRecurrence";
import {
  isChunkEventId,
  isCompletedSegmentEventId,
  isSplitEventId,
  parseCompletedSegments,
  segmentStartFromEventId,
  serializeCompletedSegments,
} from "./taskSplitting";
import { historyMessages } from "./historyMessages";

export const createPlanFromSelection = (
  userId: string | undefined,
  updatePlannerArray: UpdatePlannerArrayFn,
  start: Date,
  end: Date,
  title: string,
) => {
  if (!userId || !title) return;
  const now = new Date();
  const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

  const newEvent: Planner = {
    id: uuidv4(),
    title,
    parentId: null,
    plannerType: PlannerType.plan,
    isReady: true,
    isTriaged: true,
    duration,
    deadline: null,
    starts: start.toISOString(),
    recurrence: null,
    recurrenceExceptions: null,
    splitting: null,
    completedSegments: null,
    maxMinutesPerDay: null,
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    priority: 5,
    completedStartTime: null,
    completedEndTime: null,
    userId,
    color: "black",
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  updatePlannerArray(
    (prevEvents) => [...prevEvents, newEvent],
    historyMessages.calendarSurface.createPlan(title),
  );
};

type UpdateOptions = { engineMode?: "inline" | "worker"; label?: string };

type UpdatePlannerArrayFn = (
  planner: Planner[] | ((prev: Planner[]) => Planner[]),
  label: string,
  options?: UpdateOptions,
) => void;

type UpdateAllFn = (
  planner?: Planner[] | ((prev: Planner[]) => Planner[]),
  calendar?: SimpleEvent[] | ((prev: SimpleEvent[]) => SimpleEvent[]),
  template?: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
  categories?: Category[] | ((prev: Category[]) => Category[]),
  queues?: Queue[] | ((prev: Queue[]) => Queue[]),
  dependencies?:
    | PlannerDependency[]
    | ((prev: PlannerDependency[]) => PlannerDependency[]),
  options?: UpdateOptions,
) => void;

// Calendar drag/resize run the engine inline: FullCalendar has already moved
// the tile internally, so an async regen would paint it overlapping stale
// placements for a frame ("half-width popping"). Inline commits source +
// engine output before the next paint — same atomicity the synchronous
// engine had.

// Shared commit for drag-resize and the popover time fields. Occurrence
// events resolve to their plan row; resizing one occurrence resizes the
// series (duration lives on the planner).
export const applyEventResize = (
  updateAll: UpdateAllFn,
  eventId: string,
  start: Date,
  end: Date,
  title?: string | null,
) => {
  const plannerId = plannerIdFromEventId(eventId);

  updateAll(
    (prevPlanner) =>
      prevPlanner.map((p) =>
        p.id === plannerId ? { ...p, duration: getDuration(start, end) } : p,
      ),
    (prevEvents) =>
      prevEvents.map((ev) =>
        ev.id === eventId
          ? {
              ...ev,
              start: start.toISOString(),
              end: end.toISOString(),
            }
          : ev,
      ),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      engineMode: "inline",
      label: historyMessages.calendarSurface.resizeEvent(title),
    },
  );
};

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

// Shared commit for drag-move and the popover start field (plan `starts`).
export const applyEventStartEdit = (
  updatePlannerArray: UpdatePlannerArrayFn,
  eventId: string,
  newStart: Date,
  title?: string | null,
) => {
  updatePlannerArray(
    (prevPlanner) => {
      if (!prevPlanner.some((p) => p.id === eventId)) {
        console.warn(
          "[calendar] starts update matched no planner row",
          eventId,
        );
        return prevPlanner;
      }
      return prevPlanner.map((ev) =>
        ev.id === eventId
          ? {
              ...ev,
              starts: newStart.toISOString(),
            }
          : ev,
      );
    },
    historyMessages.calendarSurface.moveEvent(title),
    { engineMode: "inline" },
  );
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

// "Move just this occurrence": a moved exception keyed by the occurrence's
// original rule position. Re-moving the same occurrence updates the entry.
export const applyOccurrenceMove = (
  updatePlannerArray: UpdatePlannerArrayFn,
  planId: string,
  occurrenceKey: string,
  newStart: Date,
  title?: string | null,
) => {
  updatePlannerArray(
    (prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
              ...p,
              recurrenceExceptions: serializeRecurrenceExceptions(
                upsertMovedException(
                  parseRecurrenceExceptions(p.recurrenceExceptions),
                  occurrenceKey,
                  newStart.toISOString(),
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : p,
      ),
    historyMessages.calendarSurface.moveOccurrence(title),
    { engineMode: "inline" },
  );
};

// "Move every occurrence": shift the series anchor by the drag delta.
// Exception keys derive from the anchor, so they shift by the same delta.
export const applySeriesMove = (
  updatePlannerArray: UpdatePlannerArrayFn,
  planId: string,
  deltaMs: number,
  title?: string | null,
) => {
  updatePlannerArray(
    (prev) =>
      prev.map((p) =>
        p.id === planId && p.starts
          ? {
              ...p,
              starts: new Date(
                new Date(p.starts).getTime() + deltaMs,
              ).toISOString(),
              recurrenceExceptions: serializeRecurrenceExceptions(
                shiftRecurrenceExceptions(
                  parseRecurrenceExceptions(p.recurrenceExceptions),
                  deltaMs,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : p,
      ),
    historyMessages.calendarSurface.moveEvent(title),
    { engineMode: "inline" },
  );
};

// "Delete just this occurrence": a deleted exception; the calendar row is
// filtered optimistically so the tile disappears before the regen confirms.
export const applyOccurrenceDelete = (
  updateAll: UpdateAllFn,
  planId: string,
  occurrenceKey: string,
  occurrenceEventId: string,
  title?: string | null,
) => {
  updateAll(
    (prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
              ...p,
              recurrenceExceptions: serializeRecurrenceExceptions(
                upsertDeletedException(
                  parseRecurrenceExceptions(p.recurrenceExceptions),
                  occurrenceKey,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : p,
      ),
    (prev) => prev.filter((e) => e.id !== occurrenceEventId),
    undefined,
    undefined,
    undefined,
    undefined,
    { label: historyMessages.calendarSurface.deleteOccurrence(title) },
  );
};

// "Delete every occurrence": remove the plan row and all of its occurrence
// events (their ids share the plan-id prefix).
export const applySeriesDelete = (
  updateAll: UpdateAllFn,
  planId: string,
  title?: string | null,
) => {
  updateAll(
    (prev) => prev.filter((p) => p.id !== planId),
    (prev) => prev.filter((e) => plannerIdFromEventId(e.id) !== planId),
    undefined,
    undefined,
    undefined,
    undefined,
    { label: historyMessages.item.delete(title) },
  );
};

type UpdateTemplateArrayFn = (
  template: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
  label: string,
  options?: UpdateOptions,
) => void;

// Templates recur weekly on a fixed startDay/startTime, so an occurrence is
// keyed by its local weekly start (occurrenceKey) exactly like a plan's. These
// mirror applyOccurrenceMove / applySeriesMove / applyOccurrenceDelete above,
// operating on the template row's recurrenceExceptions.

// Resolves a template tile back to its row + occurrence key. A regular
// occurrence has no key in its id — derive it from the tile's position; a
// moved occurrence's key rides in its composite `templateId|key` id and must
// win over the position so a re-move/re-delete updates the same exception.
export const resolveTemplateOccurrence = (
  eventId: string,
  templates: EventTemplate[],
  startForKey: Date | null,
): {
  templateId: string;
  templateTitle: string;
  occurrenceKey: string;
} | null => {
  const templateId = plannerIdFromEventId(eventId);
  const template = templates.find((t) => t.id === templateId);
  const key =
    occurrenceKeyFromEventId(eventId) ??
    (startForKey ? occurrenceKey(startForKey) : null);
  if (!template || !key) return null;
  return { templateId, templateTitle: template.title, occurrenceKey: key };
};

// "Move just this occurrence": a moved exception on the template.
export const applyTemplateOccurrenceMove = (
  updateTemplateArray: UpdateTemplateArrayFn,
  templateId: string,
  key: string,
  newStart: Date,
  title?: string | null,
) => {
  updateTemplateArray(
    (prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              recurrenceExceptions: serializeRecurrenceExceptions(
                upsertMovedException(
                  parseRecurrenceExceptions(t.recurrenceExceptions),
                  key,
                  newStart.toISOString(),
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    historyMessages.template.move(title),
    { engineMode: "inline" },
  );
};

// "Move every occurrence": rewrite the template's weekly slot to the dragged
// position. Prior exceptions were keyed to the old pattern, so they're cleared.
export const applyTemplateSeriesMove = (
  updateTemplateArray: UpdateTemplateArrayFn,
  templateId: string,
  newStart: Date,
  title?: string | null,
) => {
  updateTemplateArray(
    (prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              startDay: newStart.getDay() as WeekDayIntegers,
              startTime: getTimeFromDate(newStart),
              recurrenceExceptions: null,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    historyMessages.template.move(title),
    { engineMode: "inline" },
  );
};

// "Resize just this occurrence": a moved exception carrying a per-occurrence
// duration. The start is the occurrence's current position (unchanged for a
// bottom-edge resize; the new start for a top-edge one), so a resize of a
// never-moved occurrence pins it in place with only its length overridden.
export const applyTemplateOccurrenceResize = (
  updateTemplateArray: UpdateTemplateArrayFn,
  templateId: string,
  key: string,
  newStart: Date,
  durationMinutes: number,
  title?: string | null,
) => {
  updateTemplateArray(
    (prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              recurrenceExceptions: serializeRecurrenceExceptions(
                upsertMovedException(
                  parseRecurrenceExceptions(t.recurrenceExceptions),
                  key,
                  newStart.toISOString(),
                  durationMinutes,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    historyMessages.template.resize(title),
    { engineMode: "inline" },
  );
};

// "Resize every occurrence": edit the series duration. The start stays anchored
// to the template's startDay/startTime — deriving day/time from a moved
// one-off's tile would re-anchor the whole series. If the resized occurrence
// carried a per-occurrence duration override (it had been resized before), that
// override is dropped so it inherits the new series length instead of snapping
// back to its stale one; any position override it has is preserved.
export const applyTemplateSeriesResize = (
  updateTemplateArray: UpdateTemplateArrayFn,
  templateId: string,
  occurrenceKey: string,
  durationMinutes: number,
  title?: string | null,
) => {
  updateTemplateArray(
    (prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              duration: durationMinutes,
              recurrenceExceptions: serializeRecurrenceExceptions(
                clearMovedDuration(
                  parseRecurrenceExceptions(t.recurrenceExceptions),
                  occurrenceKey,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    historyMessages.template.resize(title),
    { engineMode: "inline" },
  );
};

// Restore a customized occurrence: drop its exception so it returns to the
// regular series slot (original day/time/duration). The moved one-off tile
// disappears and the plain series occurrence reappears in its place.
export const applyTemplateOccurrenceRestore = (
  updateTemplateArray: UpdateTemplateArrayFn,
  templateId: string,
  key: string,
  title?: string | null,
) => {
  updateTemplateArray(
    (prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              recurrenceExceptions: serializeRecurrenceExceptions(
                removeException(
                  parseRecurrenceExceptions(t.recurrenceExceptions),
                  key,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    historyMessages.template.restoreOccurrence(title),
    { engineMode: "inline" },
  );
};

// "Delete just this occurrence": a deleted exception; the exdate re-render
// drops the tile once the template state updates.
export const applyTemplateOccurrenceDelete = (
  updateTemplateArray: UpdateTemplateArrayFn,
  templateId: string,
  key: string,
  title?: string | null,
) => {
  updateTemplateArray(
    (prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              recurrenceExceptions: serializeRecurrenceExceptions(
                upsertDeletedException(
                  parseRecurrenceExceptions(t.recurrenceExceptions),
                  key,
                ),
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    historyMessages.calendarSurface.deleteOccurrence(title),
    { engineMode: "inline" },
  );
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
  elementRef: React.RefObject<HTMLDivElement>,
  setEventRect: React.Dispatch<React.SetStateAction<DOMRect | null>>,
  setShowPopover: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  e.stopPropagation();

  if (elementRef.current) {
    setEventRect(elementRef.current.getBoundingClientRect());
    setShowPopover(true);
  }
};
