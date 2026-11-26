import { v4 as uuidv4 } from "uuid";
import {
  SimpleEvent,
  Planner,
  EventTemplate,
  PlannerType,
  Category,
  Queue,
  PlannerDependency,
  WeekDayIntegers,
} from "../contracts";
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
} from "../domain/planRecurrence";
import { historyMessages } from "../domain/historyMessages";
import { setCompletedWindow } from "../domain/goal-handlers/subtaskCompletion";
import { dateTimeService } from "./dateTimeService";
import { timeFromDate } from "./timeWindow";

export type UpdateOptions = { engineMode?: "inline" | "worker"; label?: string };

export type UpdatePlannerArrayFn = (
  planner: Planner[] | ((prev: Planner[]) => Planner[]),
  label: string,
  options?: UpdateOptions,
) => void;

export type UpdateAllFn = (
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

export type UpdateTemplateArrayFn = (
  template: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
  label: string,
  options?: UpdateOptions,
) => void;

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

// Calendar drag/resize run the engine inline: FullCalendar has already moved
// the tile internally, so an async regen would paint it overlapping stale
// placements for a frame ("half-width popping"). Inline commits source +
// engine output before the next paint — same atomicity the synchronous
// engine had.

// Shared commit for drag-resize and the popover time fields. Occurrence
// events resolve to their plan row; resizing one occurrence resizes the
// series (duration lives on the planner).
//
// A non-recurring plan's tile is rebuilt from `starts` + duration by the
// inline regen, so a start-edge resize must move `starts` too; writing
// duration alone re-anchors the new length at the old start. Occurrences keep
// the series anchor: their start is a rule position, not the row's `starts`.
// Tasks and goals are engine-placed, so only their duration is user-owned.
export const applyEventResize = (
  updateAll: UpdateAllFn,
  eventId: string,
  start: Date,
  end: Date,
  title?: string | null,
) => {
  const plannerId = plannerIdFromEventId(eventId);
  const duration = dateTimeService.getDuration(start, end);

  updateAll(
    (prevPlanner) =>
      prevPlanner.map((p) => {
        if (p.id !== plannerId) return p;
        // Compared as instants so an end-edge resize never rewrites a starts
        // string stored in a different ISO format (a spurious sync diff).
        const startMoved =
          p.plannerType === PlannerType.plan &&
          eventId === p.id &&
          p.starts !== null &&
          new Date(p.starts).getTime() !== start.getTime();
        return startMoved
          ? { ...p, starts: start.toISOString(), duration }
          : { ...p, duration };
      }),
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

// Dragging/resizing a COMPLETED dynamic item re-times its completion window
// rather than editing starts/duration (which don't drive a completed tile) —
// the tile renders from completedStartTime/End, so those are what move.
export const applyCompletedWindowEdit = (
  updatePlannerArray: UpdatePlannerArrayFn,
  plannerId: string,
  start: Date,
  end: Date,
  title?: string | null,
) => {
  updatePlannerArray(
    (prev) =>
      setCompletedWindow(prev, plannerId, start.toISOString(), end.toISOString()),
    historyMessages.calendarSurface.moveEvent(title),
    { engineMode: "inline" },
  );
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
              startTime: timeFromDate(newStart),
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
