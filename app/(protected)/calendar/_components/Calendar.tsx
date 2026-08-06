"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import RRulePlugin from "@fullcalendar/rrule";
import luxonPlugin from "@fullcalendar/luxon3";

import EventContent from "@/components/events/EventContent";
import TemplateEventContent from "@/components/events/TemplateEventContent";
import TravelEventContent from "@/components/events/TravelEventContent";
import ExternalEventContent from "@/components/events/ExternalEventContent";
import { CategoryWrapperEvent } from "@/components/events/CategoryWrapperEvent";

import type { EventDropArg, EventInput } from "@fullcalendar/core/index.js";
import type { EventResizeDoneArg } from "@fullcalendar/interaction/index.js";
import type { RootState } from "@/redux/store";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  transformEventsForFullCalendar,
  getDuration,
  CALENDAR_LONG_PRESS_DELAY_MS,
} from "@/utils/calendarUtils";
import {
  templatesToEventInput,
  categoryEventsToEventInput,
  travelEventsToEventInput,
  externalEventsToEventInput,
} from "@/utils/calendar-rendering";

import {
  createPlanFromSelection,
  handleEventResize,
  handleEventDrop,
  applyOccurrenceMove,
  applySeriesMove,
  applyTemplateOccurrenceMove,
  applyTemplateSeriesMove,
  applyTemplateOccurrenceDelete,
  applyTemplateOccurrenceResize,
  applyTemplateSeriesResize,
  resolveTemplateOccurrence,
} from "@/utils/calendarEventHandlers";
import {
  occurrenceKeyFromEventId,
  plannerIdFromEventId,
  planIsRecurring,
  hasMovedException,
} from "@/utils/planRecurrence";
import { NewPlanModal } from "@/components/events/NewPlanModal";
import { RecurrenceScopeModal } from "@/components/events/RecurrenceScopeModal";
import type FullCalendarComponent from "@fullcalendar/react";

import {
  handleTemplateEventCopy,
  handleTemplateEventDelete,
  handleTemplateEventEdit,
} from "@/utils/template-handlers/templateEventHandlers";
import { EventImpl } from "@fullcalendar/core/internal";
import { RuntimeEventExtendedProps } from "@/types/ui";
import { EventType } from "@/types/prisma";

const EVENT_INTERACTION_ENABLED = true;

// Identity-stable FullCalendar option values (see the note on Calendar below).
const PLUGINS = [
  dayGridPlugin,
  timeGridPlugin,
  interactionPlugin,
  RRulePlugin,
  luxonPlugin,
];
const TIME_FORMAT = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
} as const;
// Mobile swaps the 7-day week for a 3-day window — seven ~45px columns on a
// phone are unreadable and untappable. The page header drives navigation in
// matching 3-day steps.
const VIEWS = {
  timeGridThreeDay: {
    type: "timeGrid",
    duration: { days: 3 },
  },
} as const;

interface CalendarProps {
  initialDate: Date;
  dayHeaderContent?: React.ComponentProps<
    typeof FullCalendar
  >["dayHeaderContent"];
}

// Memoized, and every function handed to FullCalendar below is
// identity-stable across re-renders. The React connector shallow-diffs its
// props, so a fresh inline arrow counts as a changed option and triggers an
// internal option reset — if one lands while a drag is in flight (hover-label
// updates re-render the page continuously during drags), the interaction dies
// without firing eventDrop: the tile stays painted at the drop position while
// nothing was dispatched.
function Calendar({ initialDate, dayHeaderContent }: CalendarProps) {
  const {
    userId,
    weekStartDay,
    calendar,
    template,
    categories,
    categoryEvents,
    travelEvents,
    externalSources,
    externalEvents,
    planner,
    updateTemplateArray,
    updatePlannerArray,
    updateAll,
  } = useCalendarProvider();

  // Read through a ref inside FullCalendar callbacks so their identity stays
  // stable across planner updates (see the option-stability note below).
  const plannerRef = useRef(planner);
  useEffect(() => {
    plannerRef.current = planner;
  }, [planner]);
  const templateRef = useRef(template);
  useEffect(() => {
    templateRef.current = template;
  }, [template]);

  const locations = useSelector(
    (state: RootState) => state.schedulingSettings.locations,
  );

  const calendarRef = useRef<FullCalendarComponent>(null);
  const [pendingPlan, setPendingPlan] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [pendingOccurrenceMove, setPendingOccurrenceMove] = useState<{
    planId: string;
    planTitle: string;
    occurrenceKey: string;
    newStart: Date;
    deltaMs: number;
    revert: () => void;
  } | null>(null);
  const [pendingTemplateScope, setPendingTemplateScope] = useState<
    | {
        mode: "move";
        templateId: string;
        templateTitle: string;
        occurrenceKey: string;
        newStart: Date;
        revert: () => void;
      }
    | {
        mode: "resize";
        templateId: string;
        templateTitle: string;
        occurrenceKey: string;
        newStart: Date;
        newDurationMinutes: number;
        revert: () => void;
      }
    | {
        mode: "delete";
        templateId: string;
        templateTitle: string;
        occurrenceKey: string;
      }
    | null
  >(null);

  // Navigate the existing instance when the requested date changes. The
  // previous `key={initialDate.getTime()}` approach tore down and rebuilt the
  // whole FullCalendar DOM (plugins, every event tile) on each prev/next/today
  // click; gotoDate is the API for this.
  //
  // Skipped on mount (the initialDate prop already positioned the calendar)
  // and deferred to a timeout: FullCalendar's React connector flushSyncs on
  // API mutations, and React warns if that happens inside an effect's commit
  // phase.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const timeout = setTimeout(() => {
      calendarRef.current?.getApi().gotoDate(initialDate);
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialDate]);

  // View follows the breakpoint via the API rather than the initialView
  // option — the connector treats a changed option as a full option reset,
  // and initialView is only honored at mount anyway. Same timeout deferral
  // as gotoDate above (flushSync inside effect commit).
  const isMobile = useIsMobile();
  useEffect(() => {
    const timeout = setTimeout(() => {
      const api = calendarRef.current?.getApi();
      if (!api) return;
      const view = isMobile ? "timeGridThreeDay" : "timeGridWeek";
      if (api.view.type !== view) api.changeView(view);
    }, 0);
    return () => clearTimeout(timeout);
  }, [isMobile]);

  // Five render streams merged into the single FullCalendar event array:
  //   1. persisted SimpleEvents (plans + scheduled tasks)
  //   2. templates expanded from EventTemplate config at render time (RRule)
  //   3. category occurrences from the persisted CategoryEvent table (with
  //      trespass info)
  //   4. travel blocks from the persisted TravelEvent table
  //   5. imported external-calendar events (read-only overlay/busy blocks)
  // Only #1 lives in `calendar` — the other streams each live in their own
  // source of truth and survive reloads without a Regenerate.
  const fullCalendarEvents: EventInput[] = useMemo(() => {
    const persisted = calendar ? transformEventsForFullCalendar(calendar) : [];
    const templates = templatesToEventInput(template ?? []);
    const categoryWindows = categoryEventsToEventInput(
      categoryEvents ?? [],
      categories ?? [],
    );
    const travel = travelEventsToEventInput(travelEvents ?? [], locations);
    const external = externalEventsToEventInput(
      externalEvents ?? [],
      externalSources ?? [],
    );
    return [
      ...persisted,
      ...templates,
      ...categoryWindows,
      ...travel,
      ...external,
    ];
  }, [
    calendar,
    template,
    categories,
    categoryEvents,
    travelEvents,
    locations,
    externalEvents,
    externalSources,
  ]);

  const onSelect = useCallback(
    (selectInfo: { start: Date; end: Date }) =>
      setPendingPlan({ start: selectInfo.start, end: selectInfo.end }),
    [],
  );
  // Resizing a template occurrence defers to a scope prompt (this occurrence's
  // own length vs. the whole series). The tile stays at its resized size while
  // the modal is open; revert() restores it on cancel.
  const onEventResize = useCallback(
    (resizeInfo: EventResizeDoneArg) => {
      const { event, oldEvent, revert } = resizeInfo;
      const eventType = (
        event.extendedProps as RuntimeEventExtendedProps | undefined
      )?.eventType;
      if (eventType === EventType.template) {
        // Key from the PRE-resize start — a top-edge resize moves event.start,
        // so it can't stand in for the occurrence's rule position.
        const occurrence = resolveTemplateOccurrence(
          event.id,
          templateRef.current,
          oldEvent.start,
        );
        if (!occurrence || !event.start || !event.end) {
          revert();
          return;
        }
        const template = templateRef.current.find(
          (t) => t.id === occurrence.templateId,
        );
        // An already-customized occurrence skips the prompt — re-resizing a
        // one-off always means "just this one".
        if (
          template &&
          hasMovedException(
            template.recurrenceExceptions,
            occurrence.occurrenceKey,
          )
        ) {
          applyTemplateOccurrenceResize(
            updateTemplateArray,
            occurrence.templateId,
            occurrence.occurrenceKey,
            event.start,
            getDuration(event.start, event.end),
          );
          return;
        }
        setPendingTemplateScope({
          mode: "resize",
          ...occurrence,
          newStart: event.start,
          newDurationMinutes: getDuration(event.start, event.end),
          revert,
        });
        return;
      }
      handleEventResize(updateAll, resizeInfo);
    },
    [updateAll, updateTemplateArray],
  );
  // Dropping a recurring-plan occurrence defers to a scope prompt (this
  // occurrence vs the whole series); the tile stays at the drop position while
  // the modal is open, and revert() snaps it back on cancel.
  const onEventDrop = useCallback(
    (dropInfo: EventDropArg) => {
      const { event, oldEvent, revert } = dropInfo;

      // Templates first: a moved template occurrence carries a composite
      // `templateId|key` id, which would otherwise be misread as a plan
      // occurrence below.
      const eventType = (
        event.extendedProps as RuntimeEventExtendedProps | undefined
      )?.eventType;
      if (eventType === EventType.template) {
        // Key from the PRE-drag position — the post-drag one is the override.
        const occurrence = resolveTemplateOccurrence(
          event.id,
          templateRef.current,
          oldEvent.start,
        );
        if (!occurrence || !event.start) {
          revert();
          return;
        }
        const template = templateRef.current.find(
          (t) => t.id === occurrence.templateId,
        );
        // An already-customized occurrence skips the prompt — re-dragging a
        // one-off always means "just this one".
        if (
          template &&
          hasMovedException(
            template.recurrenceExceptions,
            occurrence.occurrenceKey,
          )
        ) {
          applyTemplateOccurrenceMove(
            updateTemplateArray,
            occurrence.templateId,
            occurrence.occurrenceKey,
            event.start,
          );
          return;
        }
        setPendingTemplateScope({
          mode: "move",
          ...occurrence,
          newStart: event.start,
          revert,
        });
        return;
      }

      const occurrenceKeyValue = occurrenceKeyFromEventId(event.id);
      if (occurrenceKeyValue !== null) {
        const planId = plannerIdFromEventId(event.id);
        const plan = plannerRef.current.find((p) => p.id === planId);
        if (
          !plan ||
          !planIsRecurring(plan) ||
          !event.start ||
          !oldEvent.start
        ) {
          revert();
          return;
        }
        // An already-customized plan occurrence skips the prompt too.
        if (hasMovedException(plan.recurrenceExceptions, occurrenceKeyValue)) {
          applyOccurrenceMove(
            updatePlannerArray,
            planId,
            occurrenceKeyValue,
            event.start,
            plan.title,
          );
          return;
        }
        setPendingOccurrenceMove({
          planId,
          planTitle: plan.title,
          occurrenceKey: occurrenceKeyValue,
          newStart: event.start,
          deltaMs: event.start.getTime() - oldEvent.start.getTime(),
          revert,
        });
        return;
      }
      handleEventDrop(updatePlannerArray, dropInfo);
    },
    [updatePlannerArray, updateTemplateArray],
  );
  const renderEventContent = useCallback(
    ({ event }: { event: EventImpl }) => {
      const eventType = (
        event.extendedProps as RuntimeEventExtendedProps | undefined
      )?.eventType;

      if (eventType === EventType.category) {
        const ext = event.extendedProps as
          | (RuntimeEventExtendedProps & {
              categoryName?: string;
              categoryColor?: string | null;
            })
          | undefined;
        const categoryId = ext?.categoryId || "";
        const isStrict = !!ext?.isStrict;
        const wrapperId = ext?.wrapperId || "";
        const trespassingStart = !!ext?.trespassingStart;
        const trespassingEnd = !!ext?.trespassingEnd;
        // Clean name from extendedProps ("Work"), not event.title
        // ("Work Time Slot") — so the header hover chip matches what
        // items inside the category show.
        const cleanCategoryName = ext?.categoryName ?? event.title;
        const rawCategoryColor = ext?.categoryColor ?? null;
        return (
          <CategoryWrapperEvent
            categoryId={categoryId}
            categoryName={cleanCategoryName}
            categoryColor={rawCategoryColor}
            isStrict={isStrict}
            start={event.start || new Date()}
            end={event.end || new Date()}
            wrapperId={wrapperId}
            trespassingStart={trespassingStart}
            trespassingEnd={trespassingEnd}
          />
        );
      }

      if (eventType === EventType.template) {
        return (
          <TemplateEventContent
            event={event}
            onEditTitle={handleTemplateEventEdit}
            onCopy={() =>
              handleTemplateEventCopy(updateTemplateArray, event, userId)
            }
            onDelete={() => {
              const occurrence = resolveTemplateOccurrence(
                event.id,
                templateRef.current,
                event.start,
              );
              if (!occurrence) return;
              const template = templateRef.current.find(
                (t) => t.id === occurrence.templateId,
              );
              // An already-customized occurrence skips the prompt — deleting a
              // one-off always means "just this one".
              if (
                template &&
                hasMovedException(
                  template.recurrenceExceptions,
                  occurrence.occurrenceKey,
                )
              ) {
                applyTemplateOccurrenceDelete(
                  updateTemplateArray,
                  occurrence.templateId,
                  occurrence.occurrenceKey,
                );
                return;
              }
              setPendingTemplateScope({ mode: "delete", ...occurrence });
            }}
            hideHoverButtons
            scopedDelete
            onEditTimes={(newStart, newEnd) => {
              // Keyed from the CURRENT rendered start — unlike drag-resize the
              // form hasn't moved the tile, so no oldEvent is needed.
              const occurrence = resolveTemplateOccurrence(
                event.id,
                templateRef.current,
                event.start,
              );
              if (!occurrence) return;
              const newDurationMinutes = getDuration(newStart, newEnd);
              const template = templateRef.current.find(
                (t) => t.id === occurrence.templateId,
              );
              // An already-customized occurrence skips the prompt — re-editing
              // a one-off always means "just this one".
              if (
                template &&
                hasMovedException(
                  template.recurrenceExceptions,
                  occurrence.occurrenceKey,
                )
              ) {
                applyTemplateOccurrenceResize(
                  updateTemplateArray,
                  occurrence.templateId,
                  occurrence.occurrenceKey,
                  newStart,
                  newDurationMinutes,
                );
                return;
              }
              setPendingTemplateScope({
                mode: "resize",
                ...occurrence,
                newStart,
                newDurationMinutes,
                // Nothing moved visually — a form edit never touches the tile.
                revert: () => {},
              });
            }}
          />
        );
      }

      if (eventType === EventType.travel) {
        return <TravelEventContent event={event} />;
      }

      if (eventType === EventType.external) {
        return <ExternalEventContent event={event} />;
      }

      return <EventContent event={event} />;
    },
    [updateTemplateArray, userId],
  );

  return (
    <>
      <FullCalendar
        ref={calendarRef}
        plugins={PLUGINS}
        initialDate={initialDate}
        timeZone={"local"}
        events={fullCalendarEvents}
        initialView="timeGridWeek"
        views={VIEWS}
        scrollTime={"05:00:00"}
        allDaySlot={false}
        snapDuration={"00:05:00"}
        longPressDelay={CALENDAR_LONG_PRESS_DELAY_MS}
        firstDay={weekStartDay}
        nowIndicator={true}
        height={"100%"}
        slotLabelFormat={TIME_FORMAT}
        eventTimeFormat={TIME_FORMAT}
        eventOrder={"-duration,start"}
        dayHeaderContent={dayHeaderContent}
        editable={EVENT_INTERACTION_ENABLED}
        eventResizableFromStart={EVENT_INTERACTION_ENABLED}
        selectable={EVENT_INTERACTION_ENABLED}
        select={onSelect}
        headerToolbar={false}
        eventResize={onEventResize}
        eventDrop={onEventDrop}
        eventContent={renderEventContent}
      />
      <RecurrenceScopeModal
        open={pendingOccurrenceMove !== null}
        mode="move"
        planTitle={pendingOccurrenceMove?.planTitle ?? ""}
        onThisOccurrence={() => {
          if (pendingOccurrenceMove) {
            applyOccurrenceMove(
              updatePlannerArray,
              pendingOccurrenceMove.planId,
              pendingOccurrenceMove.occurrenceKey,
              pendingOccurrenceMove.newStart,
              pendingOccurrenceMove.planTitle,
            );
          }
          setPendingOccurrenceMove(null);
        }}
        onAllOccurrences={() => {
          if (pendingOccurrenceMove) {
            applySeriesMove(
              updatePlannerArray,
              pendingOccurrenceMove.planId,
              pendingOccurrenceMove.deltaMs,
              pendingOccurrenceMove.planTitle,
            );
          }
          setPendingOccurrenceMove(null);
        }}
        onCancel={() => {
          pendingOccurrenceMove?.revert();
          setPendingOccurrenceMove(null);
        }}
      />
      <RecurrenceScopeModal
        open={pendingTemplateScope !== null}
        mode={pendingTemplateScope?.mode ?? "move"}
        entityLabel="template"
        planTitle={pendingTemplateScope?.templateTitle ?? ""}
        onThisOccurrence={() => {
          if (pendingTemplateScope?.mode === "move") {
            applyTemplateOccurrenceMove(
              updateTemplateArray,
              pendingTemplateScope.templateId,
              pendingTemplateScope.occurrenceKey,
              pendingTemplateScope.newStart,
              pendingTemplateScope.templateTitle,
            );
          } else if (pendingTemplateScope?.mode === "resize") {
            applyTemplateOccurrenceResize(
              updateTemplateArray,
              pendingTemplateScope.templateId,
              pendingTemplateScope.occurrenceKey,
              pendingTemplateScope.newStart,
              pendingTemplateScope.newDurationMinutes,
              pendingTemplateScope.templateTitle,
            );
          } else if (pendingTemplateScope?.mode === "delete") {
            applyTemplateOccurrenceDelete(
              updateTemplateArray,
              pendingTemplateScope.templateId,
              pendingTemplateScope.occurrenceKey,
              pendingTemplateScope.templateTitle,
            );
          }
          setPendingTemplateScope(null);
        }}
        onAllOccurrences={() => {
          if (pendingTemplateScope?.mode === "move") {
            applyTemplateSeriesMove(
              updateTemplateArray,
              pendingTemplateScope.templateId,
              pendingTemplateScope.newStart,
              pendingTemplateScope.templateTitle,
            );
          } else if (pendingTemplateScope?.mode === "resize") {
            applyTemplateSeriesResize(
              updateTemplateArray,
              pendingTemplateScope.templateId,
              pendingTemplateScope.occurrenceKey,
              pendingTemplateScope.newDurationMinutes,
              pendingTemplateScope.templateTitle,
            );
          } else if (pendingTemplateScope?.mode === "delete") {
            handleTemplateEventDelete(
              updateTemplateArray,
              pendingTemplateScope.templateId,
              pendingTemplateScope.templateTitle,
            );
          }
          setPendingTemplateScope(null);
        }}
        onCancel={() => {
          // Move and resize left the tile at its dropped/resized geometry;
          // restore it. Delete never moved anything.
          if (
            pendingTemplateScope?.mode === "move" ||
            pendingTemplateScope?.mode === "resize"
          ) {
            pendingTemplateScope.revert();
          }
          setPendingTemplateScope(null);
        }}
      />
      <NewPlanModal
        open={pendingPlan !== null}
        start={pendingPlan?.start ?? null}
        end={pendingPlan?.end ?? null}
        onCancel={() => {
          setPendingPlan(null);
          calendarRef.current?.getApi().unselect();
        }}
        onCreate={(title) => {
          if (pendingPlan) {
            createPlanFromSelection(
              userId,
              updatePlannerArray,
              pendingPlan.start,
              pendingPlan.end,
              title,
            );
          }
          setPendingPlan(null);
          calendarRef.current?.getApi().unselect();
        }}
      />
    </>
  );
}

export default memo(Calendar);
