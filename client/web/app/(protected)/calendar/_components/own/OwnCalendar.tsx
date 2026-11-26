"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isSameDay, startOfDay } from "date-fns";

import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  CALENDAR_LONG_PRESS_DELAY_MS,
  getDuration,
} from "@/utils/calendarUtils";
import {
  applyCompletedWindowEdit,
  applyEventResize,
  applyEventStartEdit,
  applyOccurrenceMove,
  applyTemplateOccurrenceMove,
  applyTemplateOccurrenceResize,
  createPlanFromSelection,
} from "@/utils/calendarEventHandlers";
import {
  tileEventFromCalendarEvent,
  type TileEvent,
} from "@/utils/calendar-rendering/tileEvent";
import { NewPlanModal } from "@/components/events/NewPlanModal";
import { EventType } from "@/types/prisma";
import {
  buildCalendarEvents,
  type CalendarEvent,
} from "@circadium/shared/calendar-core/model";
import {
  layoutEvents,
  minutesToPx,
  dateToMinutes,
  type TileGeometry,
} from "@circadium/shared/calendar-core/layout";
import type { CommittedState } from "@circadium/shared/calendar-core/interaction";
import {
  decideEdit,
  type AskScopeResult,
  type EditKind,
  type EditContext,
  type PendingEdit,
} from "@circadium/shared/calendar-core/edit";

import { buildEditContext, completedLeafRow } from "../editRouting";
import {
  ScopeModals,
  type PendingOccurrenceMove,
  type PendingTemplateScope,
} from "../ScopeModals";
import { TileContent } from "../TileContent";
import {
  EVENT_MIN_HEIGHT,
  SCROLL_TIME_MINUTES,
  compareSegments,
  commitIntent,
  dragIntent,
  hourHeightFor,
  hourLabels,
  nowLinePosition,
  rangeDays,
  selectViewType,
  sliceEdges,
  spanSegments,
  tileBox,
  viewDayCount,
  viewRange,
  type PreviewSegment,
  type TimeSpan,
} from "./ownCalendarGeometry";
import { TILE_ID_ATTR, useDragInteraction } from "./useDragInteraction";
import * as styles from "./OwnCalendar.css";

export interface DayHeaderArg {
  date: Date;
  isToday: boolean;
}

interface OwnCalendarProps {
  initialDate: Date;
  dayHeaderContent: (arg: DayHeaderArg) => ReactNode;
}

// A tile held at its drop position while the scope prompt is open. The core's
// PendingEdit carries the decision; start/end carry the dropped span, which
// may cross midnight where PendingEdit's day + minutes cannot.
interface HeldEdit {
  pending: PendingEdit;
  start: Date;
  end: Date;
}

const HOUR_LABELS = hourLabels();
const NOW_TICK_MS = 60_000;

interface OwnTileProps {
  tileEvent: TileEvent;
  box: { top: number; height: number; left: number; right: number; zIndex: number };
  editable: boolean;
  isStart: boolean;
  isEnd: boolean;
  hidden: boolean;
  selected: boolean;
  // On coarse pointers the resize handles exist only on the selected tile.
  showHandles: boolean;
  getEditContext: () => EditContext;
  onTemplateScope: (scope: PendingTemplateScope) => void;
}

// Memoized so a drag (which re-renders the grid on every pointer move) only
// re-renders the tiles whose own props changed.
const OwnTile = memo(function OwnTile({
  tileEvent,
  box,
  editable,
  isStart,
  isEnd,
  hidden,
  selected,
  showHandles,
  getEditContext,
  onTemplateScope,
}: OwnTileProps) {
  return (
    <div
      className={styles.tileHarness}
      style={{
        top: box.top,
        height: box.height,
        left: `${box.left}%`,
        right: `${box.right}%`,
        zIndex: box.zIndex,
        visibility: hidden ? "hidden" : undefined,
      }}
    >
      <div
        className={styles.tile}
        {...{ [TILE_ID_ATTR]: tileEvent.id }}
        data-tile-selected={selected ? "" : undefined}
      >
        <TileContent
          event={tileEvent}
          getEditContext={getEditContext}
          onTemplateScope={onTemplateScope}
        />
        {editable && showHandles && isStart && (
          <div className={styles.resizer} data-resize="start" />
        )}
        {editable && showHandles && isEnd && (
          <div className={styles.resizer} data-resize="end" />
        )}
      </div>
    </div>
  );
});

function OwnCalendar({ initialDate, dayHeaderContent }: OwnCalendarProps) {
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
  const isMobile = useIsMobile();
  const coarsePointer = useCoarsePointer();

  const plannerRef = useRef(planner);
  const templateRef = useRef(template);
  useEffect(() => {
    plannerRef.current = planner;
    templateRef.current = template;
  }, [planner, template]);
  const getEditContext = useCallback(
    () => buildEditContext(templateRef.current, plannerRef.current),
    [],
  );

  const view = selectViewType(isMobile);
  const dayCount = viewDayCount(view);
  const anchorTime = initialDate.getTime();
  const range = useMemo(
    () => viewRange(view, new Date(anchorTime), weekStartDay),
    [view, anchorTime, weekStartDay],
  );
  const days = useMemo(() => rangeDays(range), [range]);
  const hourHeight = hourHeightFor(isMobile);
  const gridHeight = 24 * hourHeight;

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
        range,
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
      range,
    ],
  );

  const [held, setHeld] = useState<HeldEdit | null>(null);
  const displayEvents = useMemo(
    () =>
      held
        ? calendarEvents.map((e) =>
            e.id === held.pending.event.id
              ? { ...e, start: held.start, end: held.end }
              : e,
          )
        : calendarEvents,
    [calendarEvents, held],
  );
  const eventsById = useMemo(
    () => new Map(displayEvents.map((e) => [e.id, e])),
    [displayEvents],
  );
  const tileEvents = useMemo(
    () =>
      new Map(displayEvents.map((e) => [e.id, tileEventFromCalendarEvent(e)])),
    [displayEvents],
  );

  // Category windows are FullCalendar background events: full column width,
  // behind the foreground tiles, outside the overlap placement.
  const { foreground, background } = useMemo(() => {
    const fg: CalendarEvent[] = [];
    const bg: CalendarEvent[] = [];
    for (const e of displayEvents) {
      (e.kind === EventType.category ? bg : fg).push(e);
    }
    return { foreground: fg, background: bg };
  }, [displayEvents]);

  const foregroundByDay = useMemo(() => {
    const byDay: TileGeometry[][] = days.map(() => []);
    for (const tile of layoutEvents(
      foreground,
      range,
      hourHeight,
      compareSegments,
      EVENT_MIN_HEIGHT,
    )) {
      const index = days.findIndex((d) => d.getTime() === tile.day.getTime());
      if (index >= 0) byDay[index].push(tile);
    }
    return byDay;
  }, [foreground, range, hourHeight, days]);

  const backgroundByDay = useMemo(() => {
    const byDay: { event: CalendarEvent; segment: PreviewSegment }[][] =
      days.map(() => []);
    for (const event of background) {
      for (const segment of spanSegments(event, range, hourHeight)) {
        if (segment.dayIndex >= 0) byDay[segment.dayIndex].push({ event, segment });
      }
    }
    return byDay;
  }, [background, range, hourHeight, days]);

  const [pendingOccurrenceMove, setPendingOccurrenceMove] =
    useState<PendingOccurrenceMove | null>(null);
  const [pendingTemplateScope, setPendingTemplateScope] =
    useState<PendingTemplateScope | null>(null);
  const [pendingPlan, setPendingPlan] = useState<TimeSpan | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  // Resolving a scope prompt either way releases the held tile: an apply has
  // already rewritten the data under it, a cancel snaps it back.
  const resolveOccurrenceMove = useCallback(
    (next: PendingOccurrenceMove | null) => {
      setPendingOccurrenceMove(next);
      if (!next) setHeld(null);
    },
    [],
  );
  const resolveTemplateScope = useCallback(
    (next: PendingTemplateScope | null) => {
      setPendingTemplateScope(next);
      if (!next) setHeld(null);
    },
    [],
  );

  const release = useCallback(() => setHeld(null), []);
  const hold = useCallback(
    (
      event: CalendarEvent,
      editKind: EditKind,
      decision: AskScopeResult,
      span: TimeSpan,
    ) => {
      setHeld({
        pending: {
          event,
          editKind,
          decision,
          previewDay: startOfDay(span.start),
          previewStartMinute: dateToMinutes(span.start),
          previewEndMinute: dateToMinutes(span.end),
          revert: release,
        },
        start: span.start,
        end: span.end,
      });
    },
    [release],
  );

  // The own renderer's eventDrop: the same decideEdit branches and apply
  // functions as Calendar.tsx, with the held tile standing in for
  // FullCalendar's internally moved one.
  const commitMove = useCallback(
    (event: CalendarEvent, span: TimeSpan) => {
      const decision = decideEdit(event, "move", getEditContext(), event.start);
      if (decision.action === "askScope" && decision.entityType === "template") {
        hold(event, "move", decision, span);
        setPendingTemplateScope({
          mode: "move",
          templateId: decision.entityId,
          templateTitle: decision.entityTitle,
          occurrenceKey: decision.occurrenceKey,
          newStart: span.start,
          revert: release,
        });
        return;
      }
      if (
        decision.action === "apply" &&
        decision.scope === "single" &&
        decision.entityType === "template"
      ) {
        applyTemplateOccurrenceMove(
          updateTemplateArray,
          decision.entityId,
          decision.occurrenceKey,
          span.start,
        );
        return;
      }
      if (decision.action === "reject" && event.kind === EventType.template) {
        return;
      }
      if (decision.action === "askScope" && decision.entityType === "plan") {
        hold(event, "move", decision, span);
        setPendingOccurrenceMove({
          planId: decision.entityId,
          planTitle: decision.entityTitle,
          occurrenceKey: decision.occurrenceKey,
          newStart: span.start,
          deltaMs: span.start.getTime() - event.start.getTime(),
          revert: release,
        });
        return;
      }
      if (
        decision.action === "apply" &&
        decision.scope === "single" &&
        decision.entityType === "plan"
      ) {
        applyOccurrenceMove(
          updatePlannerArray,
          decision.entityId,
          decision.occurrenceKey,
          span.start,
          decision.entityTitle,
        );
        return;
      }

      const completed = completedLeafRow(
        event.id,
        event.kind === EventType.planner ? event.props?.completedEndTime : null,
        plannerRef.current,
      );
      if (completed) {
        applyCompletedWindowEdit(
          updatePlannerArray,
          completed.id,
          span.start,
          span.end,
          completed.title,
        );
        return;
      }

      applyEventStartEdit(updatePlannerArray, event.id, span.start, event.title);
    },
    [getEditContext, hold, release, updatePlannerArray, updateTemplateArray],
  );

  // The own renderer's eventResize, mirroring Calendar.tsx.
  const commitResize = useCallback(
    (event: CalendarEvent, span: TimeSpan) => {
      if (event.kind === EventType.template) {
        const decision = decideEdit(
          event,
          "resize",
          getEditContext(),
          event.start,
        );
        if (decision.action === "reject") return;
        if (decision.action === "apply" && decision.scope === "single") {
          applyTemplateOccurrenceResize(
            updateTemplateArray,
            decision.entityId,
            decision.occurrenceKey,
            span.start,
            getDuration(span.start, span.end),
          );
          return;
        }
        if (decision.action === "askScope") {
          hold(event, "resize", decision, span);
          setPendingTemplateScope({
            mode: "resize",
            templateId: decision.entityId,
            templateTitle: decision.entityTitle,
            occurrenceKey: decision.occurrenceKey,
            newStart: span.start,
            newDurationMinutes: getDuration(span.start, span.end),
            revert: release,
          });
          return;
        }
      }

      const completed = completedLeafRow(
        event.id,
        event.kind === EventType.planner ? event.props?.completedEndTime : null,
        plannerRef.current,
      );
      if (completed) {
        applyCompletedWindowEdit(
          updatePlannerArray,
          completed.id,
          span.start,
          span.end,
          completed.title,
        );
        return;
      }

      applyEventResize(updateAll, event.id, span.start, span.end, event.title);
    },
    [getEditContext, hold, release, updateAll, updatePlannerArray, updateTemplateArray],
  );

  const onCommit = useCallback(
    (state: CommittedState, pointerType: string) => {
      const intent = commitIntent(state);
      if (!intent) {
        // A touch long-press released in place selects the tile, exposing
        // its resize handles (FullCalendar's touch model).
        if (pointerType !== "mouse" && state.kind === "move" && state.event) {
          setSelectedTileId(state.event.id);
        }
        return;
      }
      if (intent.type === "create") {
        setPendingPlan(intent.span);
        return;
      }
      if (intent.type === "move") commitMove(intent.event, intent.span);
      else commitResize(intent.event, intent.span);
    },
    [commitMove, commitResize],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const resolveEvent = useCallback(
    (id: string) => eventsById.get(id),
    [eventsById],
  );
  const onTouchEmpty = useCallback(() => setSelectedTileId(null), []);
  const { state: dragState, handlers } = useDragInteraction({
    columnsRef,
    scrollerRef,
    range,
    hourHeight,
    dayCount,
    longPressDelay: CALENDAR_LONG_PRESS_DELAY_MS,
    resolveEvent,
    onCommit,
    onTouchEmpty,
  });

  // FullCalendar opens every date range scrolled to 05:00 (scrollTime with
  // scrollTimeReset); so does this grid.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = minutesToPx(SCROLL_TIME_MINUTES, hourHeight);
  }, [range, hourHeight]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);
  const nowLine = nowLinePosition(now, range, hourHeight);

  // The live drag: the mirror (or create highlight) follows the machine's
  // current hit; the dragged event's own tiles hide, as in FullCalendar.
  const dragging = dragState.phase === "dragging" ? dragState : null;
  const liveIntent = dragging ? dragIntent(dragging) : null;
  const draggedEvent = dragging?.event ?? null;
  const mirrorSpan: TimeSpan | null = draggedEvent
    ? liveIntent && liveIntent.type !== "create"
      ? liveIntent.span
      : draggedEvent
    : null;
  const highlightSpan: TimeSpan | null =
    liveIntent?.type === "create" ? liveIntent.span : pendingPlan;
  const mirrorSegments = mirrorSpan
    ? spanSegments(mirrorSpan, range, hourHeight)
    : [];
  const highlightSegments = highlightSpan
    ? spanSegments(highlightSpan, range, hourHeight)
    : [];
  const mirrorTileEvent = useMemo(() => {
    if (!draggedEvent || !mirrorSpan) return null;
    return tileEventFromCalendarEvent({
      ...draggedEvent,
      start: mirrorSpan.start,
      end: mirrorSpan.end,
    });
  }, [draggedEvent, mirrorSpan]);

  return (
    <div className={styles.root}>
      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.headerRow}>
          <div className={styles.headerCorner} />
          {days.map((date) => {
            const isToday = isSameDay(date, now);
            return (
              <div
                key={date.getTime()}
                className={styles.headerCell}
                data-today={isToday ? "" : undefined}
              >
                {dayHeaderContent({ date, isToday })}
              </div>
            );
          })}
        </div>
        <div className={styles.body} style={{ height: gridHeight }}>
          <div className={styles.gutter}>
            {HOUR_LABELS.map(({ hour, label }) => (
              <span
                key={hour}
                className={styles.hourLabel}
                style={{ top: (hour + 0.25) * hourHeight }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className={styles.columns} ref={columnsRef} {...handlers}>
            <div className={styles.slotLines} aria-hidden>
              {Array.from({ length: 48 }, (_, slot) => (
                <div
                  key={slot}
                  className={styles.slotLine}
                  data-minor={slot % 2 === 1 ? "" : undefined}
                  style={{ top: (slot * hourHeight) / 2 }}
                />
              ))}
            </div>
            {days.map((date, dayIndex) => (
              <div
                key={date.getTime()}
                className={styles.column}
                data-today={isSameDay(date, now) ? "" : undefined}
              >
                <div className={styles.backgroundLayer}>
                  {backgroundByDay[dayIndex].map(({ event, segment }) => {
                    const tileEvent = tileEvents.get(event.id);
                    if (!tileEvent) return null;
                    return (
                      <div
                        key={event.id}
                        className={styles.backgroundTile}
                        style={{ top: segment.top, height: segment.height }}
                      >
                        <TileContent
                          event={tileEvent}
                          getEditContext={getEditContext}
                          onTemplateScope={resolveTemplateScope}
                        />
                      </div>
                    );
                  })}
                  {highlightSegments
                    .filter((s) => s.dayIndex === dayIndex)
                    .map((s) => (
                      <div
                        key={`highlight-${s.top}`}
                        className={styles.highlight}
                        style={{ top: s.top, height: s.height }}
                      />
                    ))}
                </div>
                <div className={styles.eventsLayer}>
                  {foregroundByDay[dayIndex].map((tile) => {
                    const tileEvent = tileEvents.get(tile.event.id);
                    if (!tileEvent) return null;
                    const edges = sliceEdges(tile.event, tile);
                    const selected = selectedTileId === tile.event.id;
                    return (
                      <OwnTile
                        key={tile.event.id}
                        tileEvent={tileEvent}
                        box={tileBox(tile)}
                        editable={tile.event.editable}
                        isStart={edges.isStart}
                        isEnd={edges.isEnd}
                        hidden={draggedEvent?.id === tile.event.id}
                        selected={selected}
                        showHandles={!coarsePointer || selected}
                        getEditContext={getEditContext}
                        onTemplateScope={resolveTemplateScope}
                      />
                    );
                  })}
                </div>
                {mirrorTileEvent && (
                  <div className={styles.mirrorLayer}>
                    {mirrorSegments
                      .filter((s) => s.dayIndex === dayIndex)
                      .map((s) => (
                        <div
                          key={`mirror-${s.top}`}
                          className={styles.tileHarness}
                          style={{
                            top: s.top,
                            height: Math.max(s.height, EVENT_MIN_HEIGHT),
                            left: 0,
                            right: 0,
                          }}
                        >
                          <div className={styles.mirrorTile}>
                            <TileContent
                              event={mirrorTileEvent}
                              getEditContext={getEditContext}
                              onTemplateScope={resolveTemplateScope}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {nowLine?.dayIndex === dayIndex && (
                  <div className={styles.nowLine} style={{ top: nowLine.top }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <ScopeModals
        pendingOccurrenceMove={pendingOccurrenceMove}
        setPendingOccurrenceMove={resolveOccurrenceMove}
        pendingTemplateScope={pendingTemplateScope}
        setPendingTemplateScope={resolveTemplateScope}
      />
      <NewPlanModal
        open={pendingPlan !== null}
        start={pendingPlan?.start ?? null}
        end={pendingPlan?.end ?? null}
        onCancel={() => setPendingPlan(null)}
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
        }}
      />
    </div>
  );
}

export default memo(OwnCalendar);
