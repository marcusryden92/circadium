"use client";

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";

import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { CALENDAR_LONG_PRESS_DELAY_MS } from "@/utils/calendarUtils";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import {
  enumerateDays,
  layoutEvents,
  minutesToPx,
  type TileGeometry,
} from "@circadium/shared/calendar-core/layout";
import type { CommittedState } from "@circadium/shared/calendar-core/interaction";
import {
  EVENT_MIN_HEIGHT,
  compareSegments,
  sliceEdges,
  tileBox,
  type TileBox,
  type TimeSpan,
} from "@/components/calendar/timeGrid/timeGridGeometry";
import {
  TILE_ID_ATTR,
  useDragInteraction,
} from "@/components/calendar/timeGrid/useDragInteraction";
import {
  TimeGridShell,
  type TimeGridColumn,
} from "@/components/calendar/timeGrid/TimeGridShell";
import * as gridStyles from "@/components/calendar/timeGrid/timeGrid.css";

import { EventTile } from "../EventTile";
import type { WeekGridEvent } from "../eventSerializers";
import type { WorkingWindow } from "../timeWindow";
import {
  WEEK_GRID_SCROLL_MINUTES,
  WEEK_GRID_SNAP_MINUTES,
  WEEK_HOUR_HEIGHT_DESKTOP,
  WEEK_HOUR_HEIGHT_MOBILE,
  ringCopies,
  ringSegments,
  timeRangeText,
  weekGridAllowHook,
  weekGridIntent,
  weekGridRange,
  type WeekGridMode,
} from "./weekGridModel";
import * as styles from "./WeekGrid.css";

export type WeekGridEdit = "move" | "resize";

interface WeekGridProps {
  weekStartDay: WeekDayIntegers;
  mode: WeekGridMode;
  events: WeekGridEvent[];
  // The working windows, for the live overlap check.
  windows: WorkingWindow[];
  // The block open in the editor rail.
  selected: { kind: "template" | "window"; id: string } | null;
  // One column of the reference week (mobile), or null for all seven.
  dayIndex: number | null;
  isMobile: boolean;
  onSelect: (kind: "template" | "window", id: string) => void;
  onCreate: (span: TimeSpan) => void;
  onEdit: (event: WeekGridEvent, span: TimeSpan, edit: WeekGridEdit) => void;
}

interface WeekTileProps {
  event: WeekGridEvent;
  box: TileBox;
  timeText: string;
  isStart: boolean;
  isEnd: boolean;
  hidden: boolean;
  railSelected: boolean;
  // Touch: the long-press-selected tile, which shows the resize dots.
  handleSelected: boolean;
  showHandles: boolean;
  onSelect: (kind: "template" | "window", id: string) => void;
}

// Memoized so a drag (a grid re-render per pointer move) only re-renders the
// tiles whose own props changed.
const WeekTile = memo(function WeekTile({
  event,
  box,
  timeText,
  isStart,
  isEnd,
  hidden,
  railSelected,
  handleSelected,
  showHandles,
  onSelect,
}: WeekTileProps) {
  return (
    <div
      className={styles.tileHarness}
      data-inactive={event.active ? undefined : ""}
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
        className={gridStyles.tile}
        {...{ [TILE_ID_ATTR]: event.id }}
        data-tile-selected={handleSelected ? "" : undefined}
        onClick={() => {
          if (event.active) onSelect(event.gridKind, event.sourceId);
        }}
      >
        <div className={styles.tileBody}>
          <EventTile
            title={event.title}
            timeText={timeText}
            kind={event.gridKind}
            color={event.color}
            active={event.active}
            assigned={event.assigned}
            focused={event.focused}
            selected={railSelected}
          />
        </div>
        {event.editable && showHandles && isStart && (
          <div className={gridStyles.resizer} data-resize="start" />
        )}
        {event.editable && showHandles && isEnd && (
          <div className={gridStyles.resizer} data-resize="end" />
        )}
      </div>
    </div>
  );
});

// The WeekStructureModal's reference-week grid on the shared calendar core:
// the shared time-grid shell and drag adapter, 15-minute snap, the weekly
// ring for blocks crossing the week's edge, and a live allow hook that
// refuses overlapping windows (the drag preview paints red, the release
// reverts). The modal owns the data; this reports creates and edits.
export function WeekGrid({
  weekStartDay,
  mode,
  events,
  windows,
  selected,
  dayIndex,
  isMobile,
  onSelect,
  onCreate,
  onEdit,
}: WeekGridProps) {
  const coarsePointer = useCoarsePointer();
  const range = useMemo(
    () => weekGridRange(weekStartDay, dayIndex),
    [weekStartDay, dayIndex],
  );
  const days = useMemo(() => enumerateDays(range), [range]);
  const hourHeight = isMobile ? WEEK_HOUR_HEIGHT_MOBILE : WEEK_HOUR_HEIGHT_DESKTOP;

  const eventsById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  const tilesByDay = useMemo(() => {
    const byDay: TileGeometry[][] = days.map(() => []);
    for (const tile of layoutEvents(
      events.flatMap(ringCopies),
      range,
      hourHeight,
      compareSegments,
      EVENT_MIN_HEIGHT,
    )) {
      const index = days.findIndex((d) => d.getTime() === tile.day.getTime());
      if (index >= 0) byDay[index].push(tile);
    }
    return byDay;
  }, [events, range, hourHeight, days]);

  const [handleTileId, setHandleTileId] = useState<string | null>(null);

  const onCommit = useCallback(
    (state: CommittedState, pointerType: string) => {
      const intent = weekGridIntent({ ...state, currentHit: state.endHit });
      if (!intent) {
        // A touch long-press released in place selects the tile, exposing
        // its resize dots (the touch model FullCalendar had here).
        if (pointerType !== "mouse" && state.kind === "move" && state.event) {
          const block = state.event as WeekGridEvent;
          setHandleTileId(block.id);
          onSelect(block.gridKind, block.sourceId);
        }
        return;
      }
      if (intent.type === "create") {
        onCreate(intent.span);
        return;
      }
      onEdit(intent.event as WeekGridEvent, intent.span, intent.type);
    },
    [onCreate, onEdit, onSelect],
  );

  const allowHook = useMemo(
    () => weekGridAllowHook(mode, windows),
    [mode, windows],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const resolveEvent = useCallback(
    (id: string) => eventsById.get(id),
    [eventsById],
  );
  const onTouchEmpty = useCallback(() => setHandleTileId(null), []);
  const { state: dragState, handlers } = useDragInteraction({
    columnsRef,
    scrollerRef,
    range,
    hourHeight,
    dayCount: days.length,
    snapMinutes: WEEK_GRID_SNAP_MINUTES,
    longPressDelay: CALENDAR_LONG_PRESS_DELAY_MS,
    allowHook,
    resolveEvent,
    onCommit,
    onTouchEmpty,
  });

  // Opened at 06:00, and back there on every day change (FullCalendar's
  // scrollTime with scrollTimeReset).
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = minutesToPx(WEEK_GRID_SCROLL_MINUTES, hourHeight);
    }
  }, [range, hourHeight]);

  const dragging = dragState.phase === "dragging" ? dragState : null;
  const liveIntent = dragging ? weekGridIntent(dragging) : null;
  const draggedEvent = (dragging?.event ?? null) as WeekGridEvent | null;
  const invalid = dragging ? !dragging.allowed : false;
  const mirrorSpan: TimeSpan | null = draggedEvent
    ? liveIntent && liveIntent.type !== "create"
      ? liveIntent.span
      : draggedEvent
    : null;
  const createSpan = liveIntent?.type === "create" ? liveIntent.span : null;
  const mirrorSegments = mirrorSpan
    ? ringSegments(mirrorSpan, range, hourHeight)
    : [];
  const createSegments = createSpan
    ? ringSegments(createSpan, range, hourHeight)
    : [];

  const columns: TimeGridColumn[] = days.map((date, index) => ({
    key: date.getTime(),
    header: <span className={styles.dayLabel}>{format(date, "EEE")}</span>,
    content: (
      <>
        <div className={gridStyles.backgroundLayer}>
          {createSegments
            .filter((s) => s.dayIndex === index)
            .map((s) => (
              <div
                key={`create-${s.top}`}
                className={styles.createHighlight}
                data-invalid={invalid ? "" : undefined}
                style={{ top: s.top, height: s.height }}
              />
            ))}
        </div>
        <div className={gridStyles.eventsLayer}>
          {tilesByDay[index].map((tile) => {
            const block = eventsById.get(tile.event.id);
            if (!block) return null;
            const edges = sliceEdges(tile.event, tile);
            const handleSelected = handleTileId === block.id;
            return (
              <WeekTile
                key={`${block.id}:${tile.event.start.getTime()}`}
                event={block}
                box={tileBox(tile)}
                timeText={timeRangeText(block)}
                isStart={edges.isStart}
                isEnd={edges.isEnd}
                hidden={draggedEvent?.id === block.id}
                railSelected={
                  selected !== null &&
                  selected.kind === block.gridKind &&
                  selected.id === block.sourceId
                }
                handleSelected={handleSelected}
                showHandles={!coarsePointer || handleSelected}
                onSelect={onSelect}
              />
            );
          })}
        </div>
        {draggedEvent && mirrorSpan && (
          <div className={gridStyles.mirrorLayer}>
            {mirrorSegments
              .filter((s) => s.dayIndex === index)
              .map((s) => (
                <div
                  key={`mirror-${s.top}`}
                  className={gridStyles.tileHarness}
                  style={{
                    top: s.top,
                    height: Math.max(s.height, EVENT_MIN_HEIGHT),
                    left: 0,
                    right: 0,
                  }}
                >
                  <div
                    className={
                      invalid
                        ? `${gridStyles.mirrorTile} ${styles.invalid}`
                        : gridStyles.mirrorTile
                    }
                    data-invalid={invalid ? "" : undefined}
                  >
                    <EventTile
                      title={draggedEvent.title}
                      timeText={timeRangeText(mirrorSpan)}
                      kind={draggedEvent.gridKind}
                      color={draggedEvent.color}
                      active
                      assigned={draggedEvent.assigned}
                      focused={draggedEvent.focused}
                      selected={false}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </>
    ),
  }));

  return (
    <div className={styles.root}>
      <TimeGridShell
        scrollerRef={scrollerRef}
        columnsRef={columnsRef}
        handlers={handlers}
        hourHeight={hourHeight}
        columns={columns}
      />
    </div>
  );
}
