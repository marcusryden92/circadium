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
  occurrenceKeyFromEventId,
  plannerIdFromEventId,
  planIsRecurring,
  hasMovedException,
} from "@/utils/planRecurrence";
import {
  isChunkEventId,
  isCompletedSegmentEventId,
} from "@/utils/taskSplitting";
import { RecurrenceScopeModal } from "../RecurrenceScopeModal";
import { PlannerType } from "@/types/prisma";
import { hoverActions, actionGroup, iconButton } from "./EventContent.css";

interface EventContentProps {
  event: EventImpl;
}

const EventContent: React.FC<EventContentProps> = ({ event }) => {
  const { planner, updateAll, updatePlannerArray, calendar } =
    useCalendarProvider();
  const isMobile = useIsMobile();
  const { plannerType, completedStartTime, completedEndTime } =
    event.extendedProps;
  const elementRef = useRef<HTMLDivElement>(null);
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

  // Completion is derived from the event data; the override only bridges the
  // gap between the optimistic click and the regen/sync confirming it. State
  // seeded once from props would go stale when the event updates in place.
  // FullCalendar recycles these components across regens, so the override must
  // also reset when the instance starts rendering a DIFFERENT event — without
  // the event.id dep, completing a chunk marked whatever event inherited the
  // recycled instance (usually the neighbor) as completed too.
  const propsCompleted = !!(completedStartTime && completedEndTime);
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
    !isCompleted && floorMinutes(currentTime) > floorMinutes(startTime);

  const occurrenceKey = occurrenceKeyFromEventId(event.id);
  const occurrencePlanId =
    occurrenceKey !== null ? plannerIdFromEventId(event.id) : null;
  const occurrencePlan = occurrencePlanId
    ? planner.find((p) => p.id === occurrencePlanId)
    : undefined;
  const isRecurringOccurrence =
    !!occurrencePlan && planIsRecurring(occurrencePlan);
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
      applyOccurrenceDelete(updateAll, occurrencePlanId, occurrenceKey, event.id);
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
    applyEventResize(updateAll, event.id, new Date(event.start), newEnd);
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
    applyEventStartEdit(updatePlannerArray, event.id, newStart);
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
        elementHeight > 40 &&
        elementWidth > 70 &&
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
                event.extendedProps.plannerType === PlannerType.task) && (
                <>
                  <button
                    onClick={onComplete}
                    className={iconButton}
                    aria-label="Complete"
                  >
                    <Check size={14} strokeWidth={2.2} />
                  </button>
                  <button
                    disabled={!displayPostponeButton}
                    onClick={onPostpone}
                    className={iconButton}
                    aria-label="Postpone"
                  >
                    <ArrowRight size={14} strokeWidth={2} />
                  </button>
                </>
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
          onEditStartTime={canEditStart ? onEditStartTime : undefined}
          onEditEndTime={canEditEnd ? onEditEndTime : undefined}
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
              );
            }
            setShowDeleteScope(false);
          }}
          onAllOccurrences={() => {
            if (occurrencePlanId) {
              applySeriesDelete(updateAll, occurrencePlanId);
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
