// EventContent.tsx
import { Check, ArrowRight, Trash2 } from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";

import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ConfirmModal } from "@/components/ui";
import { floorMinutes } from "@/utils/calendarUtils";
import EventPopover from "../EventPopover";
import EventWrapper from "../EventWrapper";
import { EventImpl } from "@fullcalendar/core/internal";
import {
  handleClickCompleteTask,
  handleClickDelete,
  handlePostponeTask,
  applyOccurrenceDelete,
  applySeriesDelete,
  applyOccurrenceMove,
  applySeriesMove,
  applyEventResize,
  applyEventStartEdit,
} from "@/utils/calendarEventHandlers";
import {
  occurrenceKey as makeOccurrenceKey,
  occurrenceKeyFromEventId,
  plannerIdFromEventId,
  planIsRecurring,
  hasMovedException,
  isRecurrenceOccurrenceId,
} from "@/utils/planRecurrence";
import {
  isChunkEventId,
  isCompletedSegmentEventId,
} from "@/utils/taskSplitting";
import { RecurrenceScopeModal } from "../RecurrenceScopeModal";
import { PlannerType } from "@/types/prisma";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  logOccurrenceCompletion,
  unlogOccurrenceCompletion,
} from "@/actions/occurrenceCompletions";
import {
  upsertOccurrenceCompletion,
  removeOccurrenceCompletion,
} from "@/redux/slices/occurrenceCompletionsSlice";
import { hoverActions, actionGroup, iconButton } from "./EventContent.css";

interface EventContentProps {
  event: EventImpl;
}

const EventContent: React.FC<EventContentProps> = ({ event }) => {
  const { planner, updateAll, updatePlannerArray, calendar } =
    useCalendarProvider();
  const dispatch = useDispatch<AppDispatch>();
  const isMobile = useIsMobile();
  const { plannerType, completedStartTime, completedEndTime } =
    event.extendedProps;
  const elementRef = useRef<HTMLDivElement>(null);
  // Serializes occurrence complete/uncomplete writes so a rapid double-click
  // can't leave the DB reflecting the earlier click via out-of-order writes.
  const occurrenceWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const completionRows = useSelector(
    (s: RootState) => s.occurrenceCompletions.rows,
  );
  const [elementHeight, setElementHeight] = useState<number>(0);
  const [elementWidth, setElementWidth] = useState<number>(0);
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [eventRect, setEventRect] = useState<DOMRect | null>(null);
  const [onHover, setOnHover] = useState<boolean>(false);
  const [showDeleteScope, setShowDeleteScope] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [pendingMoveScope, setPendingMoveScope] = useState<{
    newStart: Date;
    deltaMs: number;
  } | null>(null);

  const occurrenceKey = occurrenceKeyFromEventId(event.id);
  const occurrencePlanId =
    occurrenceKey !== null ? plannerIdFromEventId(event.id) : null;
  const occurrencePlan = occurrencePlanId
    ? planner.find((p) => p.id === occurrencePlanId)
    : undefined;
  const isRecurringOccurrence =
    !!occurrencePlan && planIsRecurring(occurrencePlan);
  // A per-period occurrence of a flexibly recurring task/goal: completes to
  // the out-of-band occurrence log, never to row-level completion columns.
  const isFlexibleOccurrence =
    isRecurrenceOccurrenceId(event.id) &&
    !!occurrencePlan &&
    occurrencePlan.plannerType !== PlannerType.plan;
  // Plans check off to the same log ("did this actually happen?"), keyed by
  // the occurrence key for recurring plans and by the anchor instant for
  // one-offs. Purely a record — the engine never reads plan completions.
  const isPlanTile =
    plannerType === PlannerType.plan && !event.extendedProps.isTemplateItem;
  const planRow = isPlanTile
    ? planner.find((p) => p.id === plannerIdFromEventId(event.id))
    : undefined;
  const planCheckKey = isPlanTile
    ? (occurrenceKey ??
      (planRow?.starts ? makeOccurrenceKey(new Date(planRow.starts)) : null))
    : null;
  const planCheckPlannerId = planRow?.id ?? null;
  const planCheckedOff =
    isPlanTile &&
    planCheckKey !== null &&
    completionRows.some(
      (r) =>
        r.plannerId === planCheckPlannerId && r.occurrenceKey === planCheckKey,
    );

  // Completion is derived from the event data; the override only bridges the
  // gap between the optimistic click and the regen/sync confirming it. State
  // seeded once from props would go stale when the event updates in place.
  // FullCalendar recycles these components across regens, so the override must
  // also reset when the instance starts rendering a DIFFERENT event — without
  // the event.id dep, completing a chunk marked whatever event inherited the
  // recycled instance (usually the neighbor) as completed too.
  const propsCompleted = isPlanTile
    ? planCheckedOff
    : !!(completedStartTime && completedEndTime);
  const [optimisticCompleted, setOptimisticCompleted] = useState<
    boolean | null
  >(null);
  const isCompleted = optimisticCompleted ?? propsCompleted;

  useEffect(() => {
    setOptimisticCompleted(null);
  }, [event.id, propsCompleted]);

  if (!event.start || !event.end) return null;

  const currentTime = new Date();
  const startTime = new Date(event.start);
  const endTime = new Date(event.end);

  const displayPostponeButton =
    !isCompleted &&
    !isPlanTile &&
    floorMinutes(currentTime) > floorMinutes(startTime);
  // A moved one-off always means "just this one", so it skips the scope prompt
  // and goes straight to the plain delete confirm.
  const isMovedOneOff =
    isRecurringOccurrence &&
    occurrencePlanId !== null &&
    occurrenceKey !== null &&
    hasMovedException(occurrencePlan?.recurrenceExceptions, occurrenceKey);

  const onDelete = () => {
    setShowPopover(false);
    // A not-yet-customized recurring occurrence asks scope (this vs every);
    // everything else confirms first.
    if (isRecurringOccurrence && !isMovedOneOff) {
      setShowDeleteScope(true);
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    if (isMovedOneOff && occurrencePlanId && occurrenceKey !== null) {
      applyOccurrenceDelete(
        updateAll,
        occurrencePlanId,
        occurrenceKey,
        event.id,
        event.title,
      );
      return;
    }
    handleClickDelete(
      event,
      calendar,
      updateAll,
      plannerType as string,
      setShowPopover,
    );
  };

  const onComplete = () => {
    // Recurrence occurrences complete to the out-of-band occurrence log, not
    // to Planner.completedStartTime — the row is a template for its periods,
    // not a single task. Plan tiles write the same log as a pure check-off
    // record (no regen: the engine never reads plan completions, and the tile
    // re-renders off the slice).
    if (isFlexibleOccurrence || isPlanTile) {
      const plannerId = isPlanTile
        ? planCheckPlannerId
        : plannerIdFromEventId(event.id);
      const logKey = isPlanTile ? planCheckKey : occurrenceKey;
      if (!plannerId || !logKey) return;
      const nextCompleted = !isCompleted;

      // A future plan can't be checked off — "did this actually happen?" is
      // only meaningful once it has.
      if (nextCompleted && isPlanTile && startTime > currentTime) return;

      // Recurring occurrences are scheduled forward, so a per-period slot is
      // almost always ahead of now; they MUST be completable ahead of time or a
      // repeating task could never be checked off (the occurrence tile is its
      // only completion surface). Completing one early DISPLAYS it at now — when
      // you actually did it — mirroring a regular task completed ahead of its
      // slot. The occurrenceKey still pins the completion to its original
      // period, and the habit's streak/rate grade by period (not by this
      // window), so doing today's and tomorrow's both today keeps BOTH periods
      // credited. The engine skips a logged period, so there is no double-book.
      let logStart = startTime;
      let logEnd = endTime;
      if (nextCompleted && isFlexibleOccurrence && startTime > currentTime) {
        logEnd = currentTime;
        logStart = new Date(
          currentTime.getTime() - (endTime.getTime() - startTime.getTime()),
        );
      }

      setOptimisticCompleted(nextCompleted);
      const regenAfterWrite = isFlexibleOccurrence;
      occurrenceWriteChainRef.current = occurrenceWriteChainRef.current
        .catch(() => {})
        .then(() =>
          nextCompleted
            ? logOccurrenceCompletion({
                plannerId,
                occurrenceKey: logKey,
                start: logStart.toISOString(),
                end: logEnd.toISOString(),
              }).then((row) => {
                dispatch(upsertOccurrenceCompletion(row));
                if (regenAfterWrite) updateAll();
              })
            : unlogOccurrenceCompletion({
                plannerId,
                occurrenceKey: logKey,
              }).then(() => {
                dispatch(
                  removeOccurrenceCompletion({
                    plannerId,
                    occurrenceKey: logKey,
                  }),
                );
                if (regenAfterWrite) updateAll();
              }),
        )
        .catch(() => setOptimisticCompleted(null));
      return;
    }

    handleClickCompleteTask(
      event,
      isCompleted,
      (value) =>
        setOptimisticCompleted(
          typeof value === "function" ? value(isCompleted) : value,
        ),
      planner,
      calendar,
      updateAll,
    );
  };

  const onPostpone = () => handlePostponeTask(event, calendar, updateAll);

  // Engine-materialized slices of a split task: a form "end" edit would write
  // the chunk's length into the task's total duration.
  const isDerivedSlice =
    isChunkEventId(event.id) || isCompletedSegmentEventId(event.id);

  // Chunk/segment tiles resolve to their owning row, so the confirm counts the
  // subtasks that a Delete would actually cascade through (goal roots only).
  const deleteRowId = isDerivedSlice ? plannerIdFromEventId(event.id) : event.id;
  const deletedSubtaskCount = useMemo(() => {
    let count = 0;
    const stack = [deleteRowId];
    while (stack.length > 0) {
      const parentId = stack.pop();
      for (const p of planner) {
        if (p.parentId === parentId) {
          count += 1;
          stack.push(p.id);
        }
      }
    }
    return count;
  }, [planner, deleteRowId]);
  const canEditEnd =
    !isCompleted && !isDerivedSlice && !event.extendedProps.isTemplateItem;
  // Task/goal starts are engine-placed; only plans anchor their own start.
  const canEditStart = canEditEnd && plannerType === PlannerType.plan;

  // Duration change for tasks/goals triggers an inline engine regen, so the
  // tile may legitimately re-place to a new slot after the edit.
  const onEditEndTime = (newEnd: Date) => {
    if (!event.start) return;
    applyEventResize(
      updateAll,
      event.id,
      new Date(event.start),
      newEnd,
      event.title,
    );
  };

  const onEditStartTime = (newStart: Date) => {
    if (!event.start) return;
    if (isRecurringOccurrence && occurrencePlanId && occurrenceKey !== null) {
      // An already-customized occurrence skips the prompt — moving a moved
      // one-off always means "just this one".
      if (
        hasMovedException(occurrencePlan.recurrenceExceptions, occurrenceKey)
      ) {
        applyOccurrenceMove(
          updatePlannerArray,
          occurrencePlanId,
          occurrenceKey,
          newStart,
          event.title,
        );
        return;
      }
      setShowPopover(false);
      setPendingMoveScope({
        newStart,
        deltaMs: newStart.getTime() - new Date(event.start).getTime(),
      });
      return;
    }
    applyEventStartEdit(updatePlannerArray, event.id, newStart, event.title);
  };

  // A completed recurring occurrence stores its window in the occurrence log,
  // not on the planner row, so "when I did it" is editable right here by
  // re-logging under the same period key — the frozen tile re-derives from the
  // log on the next regen (occurrence-completed tiles are never memoized).
  const isCompletedFlexibleOccurrence = isFlexibleOccurrence && isCompleted;
  const relogOccurrenceWindow = (newStart: Date, newEnd: Date) => {
    const plannerId = plannerIdFromEventId(event.id);
    if (!plannerId || occurrenceKey === null || newEnd <= newStart) return;
    occurrenceWriteChainRef.current = occurrenceWriteChainRef.current
      .catch(() => {})
      .then(() =>
        logOccurrenceCompletion({
          plannerId,
          occurrenceKey,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
        }).then((row) => {
          dispatch(upsertOccurrenceCompletion(row));
          updateAll();
        }),
      )
      .catch(() => {});
  };

  return (
    <EventWrapper
      event={event}
      elementRef={elementRef}
      elementHeight={elementHeight}
      elementWidth={elementWidth}
      setElementHeight={setElementHeight}
      setElementWidth={setElementWidth}
      setOnHover={setOnHover}
      setEventRect={setEventRect}
      isCompleted={isCompleted}
      showPopover={showPopover}
      setShowPopover={setShowPopover}
    >
      {/* Touch taps fire an emulated mouseenter, so without the gate these
          would appear on tap and linger — mobile gets the bottom sheet. */}
      {!isMobile &&
        onHover &&
        elementHeight > 34 &&
        elementWidth > 90 &&
        !event.extendedProps.isTemplateItem && (
          <div className={hoverActions}>
            <button
              onClick={onDelete}
              className={iconButton}
              aria-label="Delete"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
            <div className={actionGroup}>
              {(event.extendedProps.plannerType === PlannerType.goal ||
                event.extendedProps.plannerType === PlannerType.task ||
                isPlanTile) && (
                <button
                  onClick={onComplete}
                  className={iconButton}
                  aria-label={isPlanTile ? "Mark done" : "Complete"}
                >
                  <Check size={14} strokeWidth={2.2} />
                </button>
              )}
              {(event.extendedProps.plannerType === PlannerType.goal ||
                event.extendedProps.plannerType === PlannerType.task) && (
                <button
                  disabled={!displayPostponeButton}
                  onClick={onPostpone}
                  className={iconButton}
                  aria-label="Postpone"
                >
                  <ArrowRight size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        )}

      {showPopover && eventRect && (
        <EventPopover
          event={event}
          eventRect={eventRect}
          startTime={startTime}
          endTime={endTime}
          isCompleted={isCompleted}
          displayPostponeButton={displayPostponeButton}
          onClose={() => setShowPopover(false)}
          onDelete={onDelete}
          onComplete={onComplete}
          onPostpone={onPostpone}
          onEditStartTime={
            canEditStart
              ? onEditStartTime
              : isCompletedFlexibleOccurrence
                ? (newStart) => relogOccurrenceWindow(newStart, endTime)
                : undefined
          }
          onEditEndTime={
            canEditEnd
              ? onEditEndTime
              : isCompletedFlexibleOccurrence
                ? (newEnd) => relogOccurrenceWindow(startTime, newEnd)
                : undefined
          }
          setShowPopover={setShowPopover}
        />
      )}

      {isRecurringOccurrence && (
        <RecurrenceScopeModal
          open={showDeleteScope}
          mode="delete"
          planTitle={occurrencePlan.title}
          onThisOccurrence={() => {
            if (occurrencePlanId && occurrenceKey !== null) {
              applyOccurrenceDelete(
                updateAll,
                occurrencePlanId,
                occurrenceKey,
                event.id,
                event.title,
              );
            }
            setShowDeleteScope(false);
          }}
          onAllOccurrences={() => {
            if (occurrencePlanId) {
              applySeriesDelete(updateAll, occurrencePlanId, event.title);
            }
            setShowDeleteScope(false);
          }}
          onCancel={() => setShowDeleteScope(false)}
        />
      )}

      {isRecurringOccurrence && (
        <RecurrenceScopeModal
          open={pendingMoveScope !== null}
          mode="move"
          planTitle={occurrencePlan.title}
          onThisOccurrence={() => {
            if (
              pendingMoveScope &&
              occurrencePlanId &&
              occurrenceKey !== null
            ) {
              applyOccurrenceMove(
                updatePlannerArray,
                occurrencePlanId,
                occurrenceKey,
                pendingMoveScope.newStart,
                event.title,
              );
            }
            setPendingMoveScope(null);
          }}
          onAllOccurrences={() => {
            if (pendingMoveScope && occurrencePlanId) {
              applySeriesMove(
                updatePlannerArray,
                occurrencePlanId,
                pendingMoveScope.deltaMs,
                event.title,
              );
            }
            setPendingMoveScope(null);
          }}
          onCancel={() => setPendingMoveScope(null)}
        />
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete item"
        body={
          <>
            Are you sure you want to delete{" "}
            <strong>{event.title || "this item"}</strong>?
            {deletedSubtaskCount > 0 && (
              <>
                {" "}
                This will also delete {deletedSubtaskCount} subtask
                {deletedSubtaskCount !== 1 ? "s" : ""}.
              </>
            )}
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
      />
    </EventWrapper>
  );
};

export default EventContent;
