"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  transition,
  confirmLongPress,
  cancel,
  reset,
  autoScrollSpeed,
  type CommittedState,
  type DragKind,
  type AllowHook,
  type DragMachineConfig,
  type DragState,
  type DragTransition,
  type GridMetrics,
  type NormalizedPointerEvent,
  type PointerPhase,
} from "@circadium/shared/calendar-core/interaction";
import type {
  CalendarEvent,
  CalendarRange,
} from "@circadium/shared/calendar-core/model";

// A mouse press only becomes a drag once it travels this far, so clicks and
// double-clicks on tiles (which open the popover) never start one.
const MOUSE_DRAG_DISTANCE = 5;
// A touch that travels this far before the long-press fires is a scroll.
const TOUCH_MOVE_THRESHOLD = 5;
// iOS and Android synthesize a click on release after a drag; swallow it.
const CLICK_SUPPRESS_MS = 400;

// The DOM contract with the tiles: a tile root carries data-tile-id, its
// resize handles data-resize="start" | "end".
export const TILE_ID_ATTR = "data-tile-id";
export const RESIZE_ATTR = "data-resize";

export interface DragTarget {
  event: CalendarEvent | null;
  kind: DragKind;
}

// What a press on `target` would drag: a tile (move or edge resize), empty
// grid (create), or nothing (a non-editable tile).
export function resolveDragTarget(
  target: Element,
  resolveEvent: (id: string) => CalendarEvent | undefined,
): DragTarget | null {
  const tile = target.closest(`[${TILE_ID_ATTR}]`);
  if (!tile) return { event: null, kind: "create" };
  const event = resolveEvent(tile.getAttribute(TILE_ID_ATTR) ?? "");
  if (!event || !event.editable) return null;
  const edge = target.closest(`[${RESIZE_ATTR}]`)?.getAttribute(RESIZE_ATTR);
  if (edge === "start") return { event, kind: "resize-start" };
  if (edge === "end") return { event, kind: "resize-end" };
  return { event, kind: "move" };
}

interface UseDragInteractionOptions {
  columnsRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  range: CalendarRange;
  hourHeight: number;
  dayCount: number;
  snapMinutes: number;
  longPressDelay: number;
  // Live validation of the drag position; read through a ref on every hit,
  // so a fresh closure per render is fine.
  allowHook?: AllowHook;
  resolveEvent: (id: string) => CalendarEvent | undefined;
  onCommit: (state: CommittedState, pointerType: string) => void;
  // A touch on empty grid: the FullCalendar convention for deselecting a tile.
  onTouchEmpty: () => void;
}

interface MousePress {
  pointerId: number;
  clientX: number;
  clientY: number;
  time: number;
  target: DragTarget;
}

// The web input adapter for the core drag machine: turns DOM pointer events
// into normalized {phase, x, y, time} with grid metrics, owns the long-press
// timer and auto-scroll loop the machine asks for, and hands committed drags
// back to the caller. Mouse drags start after a short travel; touch drags
// after the long-press, with the page scroll held off only while dragging.
export function useDragInteraction(options: UseDragInteractionOptions) {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const stateRef = useRef<DragState>({ phase: "idle" });
  const [state, setState] = useState<DragState>(stateRef.current);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pressRef = useRef<MousePress | null>(null);
  const pointerTypeRef = useRef<string>("mouse");
  const lastClientRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragEndedAtRef = useRef(0);

  const apply = useCallback((next: DragState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const config = useCallback((): DragMachineConfig => {
    return {
      longPressDelay: optionsRef.current.longPressDelay,
      moveThreshold: TOUCH_MOVE_THRESHOLD,
      allowHook: optionsRef.current.allowHook,
    };
  }, []);

  const metrics = useCallback((): GridMetrics | null => {
    const { columnsRef, scrollerRef, range, hourHeight, dayCount } =
      optionsRef.current;
    const columns = columnsRef.current;
    const scroller = scrollerRef.current;
    if (!columns || !scroller) return null;
    const rect = columns.getBoundingClientRect();
    return {
      hourHeight,
      columnWidth: rect.width / dayCount,
      visibleRange: range,
      snapMinutes: optionsRef.current.snapMinutes,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      viewportHeight: scroller.clientHeight,
    };
  }, []);

  // The columns element lives inside the scroller, so its rect already moves
  // with the scroll: client minus rect is the scroll-adjusted grid point.
  const normalize = useCallback(
    (phase: PointerPhase, clientX: number, clientY: number, time: number) => {
      const columns = optionsRef.current.columnsRef.current;
      if (!columns) return null;
      const rect = columns.getBoundingClientRect();
      const event: NormalizedPointerEvent = {
        phase,
        x: clientX - rect.left,
        y: clientY - rect.top,
        time,
      };
      return event;
    },
    [],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const settle = useCallback(
    (next: DragState, wasDragging: boolean) => {
      if (next.phase === "committed") {
        stopAutoScroll();
        dragEndedAtRef.current = Date.now();
        optionsRef.current.onCommit(next, pointerTypeRef.current);
        apply(reset().state);
        return;
      }
      if (next.phase === "cancelled") {
        stopAutoScroll();
        if (wasDragging) dragEndedAtRef.current = Date.now();
        apply(reset().state);
        return;
      }
      if (next.phase === "idle") stopAutoScroll();
      apply(next);
    },
    [apply, stopAutoScroll],
  );

  // Re-declared through a ref so the rAF loop and the timer always call the
  // current closure.
  const feedRef = useRef<(
    pe: NormalizedPointerEvent,
    target?: DragTarget,
  ) => DragTransition | null>(() => null);

  const startAutoScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = () => {
      rafRef.current = null;
      if (stateRef.current.phase !== "dragging") return;
      const scroller = optionsRef.current.scrollerRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const speed = autoScrollSpeed(
          lastClientRef.current.y - rect.top,
          scroller.clientHeight,
        );
        if (speed !== 0) {
          const before = scroller.scrollTop;
          scroller.scrollTop = before + speed;
          // The grid moved under a still pointer: re-hit-test at the same
          // client point so the preview follows the scroll.
          if (scroller.scrollTop !== before) {
            const pe = normalize(
              "move",
              lastClientRef.current.x,
              lastClientRef.current.y,
              Date.now(),
            );
            if (pe) feedRef.current(pe);
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [normalize]);

  const beginDrag = useCallback(
    (pointerId: number) => {
      try {
        optionsRef.current.columnsRef.current?.setPointerCapture(pointerId);
      } catch {
        // The pointer may already be gone (released during the long-press).
      }
      startAutoScroll();
    },
    [startAutoScroll],
  );

  const confirm = useCallback(
    (pointerId: number) => {
      const next = confirmLongPress(stateRef.current, config()).state;
      apply(next);
      if (next.phase === "dragging") beginDrag(pointerId);
    },
    [apply, beginDrag, config],
  );

  const feed = useCallback(
    (
      pe: NormalizedPointerEvent,
      target?: DragTarget,
      pointerId = -1,
      manualConfirm = false,
    ): DragTransition | null => {
      const m = metrics();
      if (!m) return null;
      const wasDragging = stateRef.current.phase === "dragging";
      const t = transition(
        stateRef.current,
        pe,
        m,
        config(),
        target?.event ?? null,
        target?.kind ?? "create",
      );
      if (t.cancelTimer !== undefined) clearTimer();
      if (t.startTimer && !manualConfirm) {
        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          confirm(pointerId);
        }, t.startTimer.delay);
      }
      settle(t.state, wasDragging);
      return t;
    },
    [clearTimer, config, confirm, metrics, settle],
  );
  useLayoutEffect(() => {
    feedRef.current = (pe, target) => feed(pe, target);
  }, [feed]);

  const inGrid = (target: EventTarget | null) => {
    const columns = optionsRef.current.columnsRef.current;
    // React bubbles events from portaled popovers and modals up through the
    // tile tree; only presses on the grid itself drive the machine.
    return !!columns && target instanceof Node && columns.contains(target);
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !inGrid(e.target)) return;
      if (stateRef.current.phase !== "idle" || pressRef.current) return;
      pointerTypeRef.current = e.pointerType;
      lastClientRef.current = { x: e.clientX, y: e.clientY };
      const target = resolveDragTarget(
        e.target as Element,
        optionsRef.current.resolveEvent,
      );
      if (e.pointerType !== "mouse" && (!target || !target.event)) {
        optionsRef.current.onTouchEmpty();
      }
      if (!target) return;

      if (e.pointerType === "mouse") {
        pressRef.current = {
          pointerId: e.pointerId,
          clientX: e.clientX,
          clientY: e.clientY,
          time: Date.now(),
          target,
        };
        return;
      }

      const pe = normalize("start", e.clientX, e.clientY, Date.now());
      if (!pe) return;
      // A resize handle only shows on a long-press-selected tile, so the
      // press that grabs it drags at once (FullCalendar's touch resize).
      const immediate = target.kind !== "move" && target.kind !== "create";
      feed(pe, target, e.pointerId, immediate);
      if (immediate) confirm(e.pointerId);
    },
    [confirm, feed, normalize],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      lastClientRef.current = { x: e.clientX, y: e.clientY };
      const press = pressRef.current;
      if (press && stateRef.current.phase === "idle") {
        if (e.pointerId !== press.pointerId) return;
        const distance = Math.hypot(
          e.clientX - press.clientX,
          e.clientY - press.clientY,
        );
        if (distance < MOUSE_DRAG_DISTANCE) return;
        pressRef.current = null;
        const start = normalize("start", press.clientX, press.clientY, press.time);
        if (!start) return;
        feed(start, press.target, press.pointerId, true);
        confirm(press.pointerId);
      }
      const phase = stateRef.current.phase;
      if (phase !== "pending" && phase !== "dragging") return;
      const pe = normalize("move", e.clientX, e.clientY, Date.now());
      if (pe) feed(pe);
    },
    [confirm, feed, normalize],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      pressRef.current = null;
      const phase = stateRef.current.phase;
      if (phase !== "pending" && phase !== "dragging") return;
      const pe = normalize("end", e.clientX, e.clientY, Date.now());
      if (pe) feed(pe);
    },
    [feed, normalize],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      pressRef.current = null;
      const phase = stateRef.current.phase;
      if (phase !== "pending" && phase !== "dragging") return;
      const pe = normalize("cancel", e.clientX, e.clientY, Date.now());
      if (pe) feed(pe);
    },
    [feed, normalize],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() - dragEndedAtRef.current < CLICK_SUPPRESS_MS) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // A long-press must not raise the touch context menu or text callout.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (pointerTypeRef.current !== "mouse" && stateRef.current.phase !== "idle") {
      e.preventDefault();
    }
  }, []);

  // Touch scrolling stays native until a long-press turns the touch into a
  // drag; from then on the page must not pan under it. Needs a non-passive
  // listener, which React's onTouchMove is not.
  useEffect(() => {
    const columns = options.columnsRef.current;
    if (!columns) return;
    const onTouchMove = (e: TouchEvent) => {
      if (stateRef.current.phase === "dragging" && e.cancelable) {
        e.preventDefault();
      }
    };
    columns.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => columns.removeEventListener("touchmove", onTouchMove);
  }, [options.columnsRef]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const phase = stateRef.current.phase;
      if (phase !== "pending" && phase !== "dragging") return;
      clearTimer();
      settle(cancel(stateRef.current).state, phase === "dragging");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearTimer, settle]);

  useEffect(
    () => () => {
      clearTimer();
      stopAutoScroll();
    },
    [clearTimer, stopAutoScroll],
  );

  return {
    state,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
      onContextMenu,
    },
  };
}
