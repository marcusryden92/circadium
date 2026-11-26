"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { addDays, startOfWeek } from "date-fns";

import EventContent from "@/components/events/EventContent";
import TemplateEventContent from "@/components/events/TemplateEventContent";
import TravelEventContent from "@/components/events/TravelEventContent";
import ExternalEventContent from "@/components/events/ExternalEventContent";
import { CategoryWrapperEvent } from "@/components/events/CategoryWrapperEvent";

import type {
  DatesSetArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core/index.js";
import type { EventResizeDoneArg } from "@fullcalendar/interaction/index.js";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  getDuration,
  CALENDAR_LONG_PRESS_DELAY_MS,
} from "@/utils/calendarUtils";
import { toFullCalendarInput } from "@/utils/calendar-rendering";
import {
  buildCalendarEvents,
  type CalendarRange,
} from "@circadium/shared/calendar-core/model";

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
  applyCompletedWindowEdit,
  resolveTemplateOccurrence,
} from "@/utils/calendarEventHandlers";
import {
  occurrenceKeyFromEventId,
  plannerIdFromEventId,
  planIsRecurring,
  hasMovedException,
} from "@/utils/planRecurrence";
import {
  decideEdit,
  type EditContext,
} from "@circadium/shared/calendar-core/edit";
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
import {
  EventType,
  EventTemplate,
  Planner,
  PlannerType,
} from "@/types/prisma";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";

const EVENT_INTERACTION_ENABLED = true;

function stubCalendarEvent(
  id: string,
  eventType: string | undefined,
  editable: boolean,
  start: Date,
  end: Date,
): CalendarEvent | null {
  if (eventType === EventType.template) {
    return {
      kind: EventType.template,
      id,
      title: "",
      start,
      end,
      editable,
      templateId: "",
      occurrenceKey: "",
      moved: false,
      color: "",
    };
  }
  if (eventType === EventType.planner || eventType === undefined) {
    return {
      kind: EventType.planner,
      id,
      title: "",
      start,
      end,
      editable,
      color: "",
      borderColor: "",
      props: null,
    };
  }
  return null;
}

function buildEditContext(
  templates: EventTemplate[],
  planner: Planner[],
): EditContext {
  return {
    hasMovedException,
    planIsRecurring,
    resolveTemplateOccurrence: (eventId, startForKey) => {
      const result = resolveTemplateOccurrence(eventId, templates, startForKey);
      if (!result) return null;
      const tmpl = templates.find((t) => t.id === result.templateId);
      return {
        ...result,
        recurrenceExceptions: tmpl?.recurrenceExceptions ?? null,
      };
    },
    resolvePlanOccurrence: (eventId) => {
      const key = occurrenceKeyFromEventId(eventId);
      if (key === null) return null;
      const planId = plannerIdFromEventId(eventId);
      const plan = planner.find((p) => p.id === planId);
      if (!plan) return null;
      return {
        planId,
        planTitle: plan.title,
        occurrenceKey: key,
        recurrenceExceptions: plan.recurrenceExceptions,
        recurrence: plan.recurrence,
      };
    },
  };
}

// A completed whole-item dynamic tile (task / goal leaf) renders from its
// completion window, so dragging or resizing it re-times completion rather than
// editing starts/duration. Split segments and recurrence occurrences carry
// composite ids (plannerId !== event.id) and are handled elsewhere; plans never
// complete to a window.
function completedLeafFromEvent(
  event: EventImpl,
  planner: Planner[],
): Planner | null {
  const plannerId = plannerIdFromEventId(event.id);
  if (plannerId !== event.id) return null;
  const ext = event.extendedProps as RuntimeEventExtendedProps | undefined;
  if (!ext?.completedEndTime) return null;
  const row = planner.find((p) => p.id === plannerId);
  if (!row || row.plannerType === PlannerType.plan) return null;
  if (planner.some((p) => p.parentId === plannerId)) return null;
  return row;
}

// Identity-stable FullCalendar option values (see the note on Calendar below).
const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
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
    locations,
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

  // The range FullCalendar is showing, reported through datesSet; templates
  // expand over it. Seeded with the week around initialDate so templates are
  // there on the first paint instead of after the first datesSet.
  const [visibleRange, setVisibleRange] = useState<CalendarRange>(() => {
    const start = startOfWeek(initialDate, { weekStartsOn: weekStartDay });
    return { start, end: addDays(start, 7) };
  });
  // Keeps the previous object for an unchanged range: a fresh one would
  // rebuild the event array, and FullCalendar re-parses every new array.
  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setVisibleRange((prev) =>
      prev.start.getTime() === arg.start.getTime() &&
      prev.end.getTime() === arg.end.getTime()
        ? prev
        : { start: arg.start, end: arg.end },
    );
  }, []);

  // Five render streams merged into the single event array (order and sources
  // in buildCalendarEvents): persisted SimpleEvents, templates expanded over
  // the visible range, category occurrences, travel blocks, and imported
  // external-calendar events. Only the first lives in `calendar`; the other
  // streams each live in their own source of truth and survive reloads
  // without a Regenerate.
  const calendarEvents = useMemo(
    () =>
      buildCalendarEvents({
        calendar,
        templates: template,
        categories,
        categoryEvents,
        travelEvents,
        locations,
        externalEvents,
        externalSources,
        range: visibleRange,
      }),
    [
      calendar,
      template,
      categories,
      categoryEvents,
      travelEvents,
      locations,
      externalEvents,
      externalSources,
      visibleRange,
    ],
  );
  const fullCalendarEvents: EventInput[] = useMemo(
    () => calendarEvents.map(toFullCalendarInput),
    [calendarEvents],
  );

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
      if (!event.start || !event.end) { revert(); return; }
      const eventType = (
        event.extendedProps as RuntimeEventExtendedProps | undefined
      )?.eventType;

      if (eventType === EventType.template) {
        const stub = stubCalendarEvent(event.id, eventType, true, event.start, event.end);
        if (!stub) { revert(); return; }
        const ctx = buildEditContext(templateRef.current, plannerRef.current);
        const decision = decideEdit(stub, "resize", ctx, oldEvent.start);
        if (decision.action === "reject") { revert(); return; }
        if (decision.action === "apply" && decision.scope === "single") {
          applyTemplateOccurrenceResize(
            updateTemplateArray,
            decision.entityId,
            decision.occurrenceKey,
            event.start,
            getDuration(event.start, event.end),
          );
          return;
        }
        if (decision.action === "askScope") {
          setPendingTemplateScope({
            mode: "resize",
            templateId: decision.entityId,
            templateTitle: decision.entityTitle,
            occurrenceKey: decision.occurrenceKey,
            newStart: event.start,
            newDurationMinutes: getDuration(event.start, event.end),
            revert,
          });
          return;
        }
      }

      const completedRow = completedLeafFromEvent(event, plannerRef.current);
      if (completedRow && event.start && event.end) {
        applyCompletedWindowEdit(
          updatePlannerArray,
          completedRow.id,
          event.start,
          event.end,
          completedRow.title,
        );
        return;
      }

      handleEventResize(updateAll, resizeInfo);
    },
    [updateAll, updatePlannerArray, updateTemplateArray],
  );
  // Dropping a recurring-plan occurrence defers to a scope prompt (this
  // occurrence vs the whole series); the tile stays at the drop position while
  // the modal is open, and revert() snaps it back on cancel.
  const onEventDrop = useCallback(
    (dropInfo: EventDropArg) => {
      const { event, oldEvent, revert } = dropInfo;
      if (!event.start) { revert(); return; }

      const eventType = (
        event.extendedProps as RuntimeEventExtendedProps | undefined
      )?.eventType;
      const stub = stubCalendarEvent(
        event.id,
        eventType,
        true,
        event.start,
        event.end ?? event.start,
      );
      if (stub) {
        const ctx = buildEditContext(templateRef.current, plannerRef.current);
        const decision = decideEdit(stub, "move", ctx, oldEvent.start);

        if (decision.action === "askScope" && decision.entityType === "template") {
          setPendingTemplateScope({
            mode: "move",
            templateId: decision.entityId,
            templateTitle: decision.entityTitle,
            occurrenceKey: decision.occurrenceKey,
            newStart: event.start,
            revert,
          });
          return;
        }
        if (decision.action === "apply" && decision.scope === "single" && decision.entityType === "template") {
          applyTemplateOccurrenceMove(
            updateTemplateArray,
            decision.entityId,
            decision.occurrenceKey,
            event.start,
          );
          return;
        }
        if (decision.action === "reject" && eventType === EventType.template) {
          revert();
          return;
        }

        if (decision.action === "askScope" && decision.entityType === "plan") {
          if (!oldEvent.start) { revert(); return; }
          setPendingOccurrenceMove({
            planId: decision.entityId,
            planTitle: decision.entityTitle,
            occurrenceKey: decision.occurrenceKey,
            newStart: event.start,
            deltaMs: event.start.getTime() - oldEvent.start.getTime(),
            revert,
          });
          return;
        }
        if (decision.action === "apply" && decision.scope === "single" && decision.entityType === "plan") {
          applyOccurrenceMove(
            updatePlannerArray,
            decision.entityId,
            decision.occurrenceKey,
            event.start,
            decision.entityTitle,
          );
          return;
        }
      }

      const completedRow = completedLeafFromEvent(event, plannerRef.current);
      if (completedRow && event.start && event.end) {
        applyCompletedWindowEdit(
          updatePlannerArray,
          completedRow.id,
          event.start,
          event.end,
          completedRow.title,
        );
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
              if (!event.start || !event.end) return;
              const stub = stubCalendarEvent(event.id, EventType.template, true, event.start, event.end);
              if (!stub) return;
              const ctx = buildEditContext(templateRef.current, plannerRef.current);
              const decision = decideEdit(stub, "delete", ctx, event.start);
              if (decision.action === "reject") return;
              if (decision.action === "apply" && decision.scope === "single") {
                applyTemplateOccurrenceDelete(
                  updateTemplateArray,
                  decision.entityId,
                  decision.occurrenceKey,
                );
                return;
              }
              if (decision.action === "askScope") {
                setPendingTemplateScope({
                  mode: "delete",
                  templateId: decision.entityId,
                  templateTitle: decision.entityTitle,
                  occurrenceKey: decision.occurrenceKey,
                });
              }
            }}
            hideHoverButtons
            scopedDelete
            onEditTimes={(newStart, newEnd) => {
              if (!event.start || !event.end) return;
              const stub = stubCalendarEvent(event.id, EventType.template, true, event.start, event.end);
              if (!stub) return;
              const ctx = buildEditContext(templateRef.current, plannerRef.current);
              const decision = decideEdit(stub, "resize", ctx, event.start);
              if (decision.action === "reject") return;
              const newDurationMinutes = getDuration(newStart, newEnd);
              if (decision.action === "apply" && decision.scope === "single") {
                applyTemplateOccurrenceResize(
                  updateTemplateArray,
                  decision.entityId,
                  decision.occurrenceKey,
                  newStart,
                  newDurationMinutes,
                );
                return;
              }
              if (decision.action === "askScope") {
                setPendingTemplateScope({
                  mode: "resize",
                  templateId: decision.entityId,
                  templateTitle: decision.entityTitle,
                  occurrenceKey: decision.occurrenceKey,
                  newStart,
                  newDurationMinutes,
                  revert: () => {},
                });
              }
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
        datesSet={onDatesSet}
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
