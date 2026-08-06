"use client";

import { RefObject, useEffect, useRef } from "react";

export interface CanvasGesturePoint {
  x: number;
  y: number;
}

export interface CanvasPinchInfo {
  scaleFactor: number;
  centroid: CanvasGesturePoint;
}

export interface CanvasGestureHandlers {
  enabled?: boolean;
  longPressMs?: number;
  tapSlopPx?: number;
  onTap?: (pt: CanvasGesturePoint) => void;
  onLongPress?: (pt: CanvasGesturePoint) => void;
  onDragStart?: (pt: CanvasGesturePoint) => void;
  onDragMove?: (dx: number, dy: number, pt: CanvasGesturePoint) => void;
  onDragEnd?: (pt: CanvasGesturePoint) => void;
  onPinchStart?: (centroid: CanvasGesturePoint) => void;
  onPinch?: (info: CanvasPinchInfo) => void;
  onPinchEnd?: () => void;
}

const DEFAULT_LONG_PRESS_MS = 300;
const DEFAULT_TAP_SLOP_PX = 8;

// A completed single-finger sequence is a tap (quick, in place), a long-press
// (held past the timer, in place), or a drag (moved past the slop before the
// timer). Two fingers down at once is a pinch. This mirrors the live hook's
// classification and exists as a pure function purely so it can be unit-tested.
export type PointerGestureEvent =
  | { type: "down"; pointerId: number; x: number; y: number; t: number }
  | { type: "move"; pointerId: number; x: number; y: number; t: number }
  | { type: "up"; pointerId: number; x: number; y: number; t: number };

export type PointerGestureKind = "tap" | "longpress" | "drag" | "pinch";

export function classifyPointerGesture(
  events: PointerGestureEvent[],
  opts: { tapSlopPx?: number; longPressMs?: number } = {},
): PointerGestureKind {
  const slop = opts.tapSlopPx ?? DEFAULT_TAP_SLOP_PX;
  const longPressMs = opts.longPressMs ?? DEFAULT_LONG_PRESS_MS;

  const active = new Set<number>();
  let maxConcurrent = 0;
  for (const e of events) {
    if (e.type === "down") active.add(e.pointerId);
    else if (e.type === "up") active.delete(e.pointerId);
    maxConcurrent = Math.max(maxConcurrent, active.size);
  }
  if (maxConcurrent >= 2) return "pinch";

  const down = events.find((e) => e.type === "down");
  const up = [...events].reverse().find((e) => e.type === "up");
  if (!down) return "tap";

  let slopBreakT: number | null = null;
  for (const e of events) {
    if (e.type === "down") continue;
    const dx = e.x - down.x;
    const dy = e.y - down.y;
    if (dx * dx + dy * dy > slop * slop) {
      slopBreakT = e.t;
      break;
    }
  }
  const longPressT = down.t + longPressMs;
  if (slopBreakT !== null && slopBreakT < longPressT) return "drag";

  const endT = up ? up.t : events[events.length - 1].t;
  if (endT - down.t >= longPressMs) return "longpress";
  return "tap";
}

// The additive 0-100 slider delta that reproduces a `ratio` change in the
// mapped value, for a log-scaled slider whose full range spans `logRange`
// (= ln(max/min)). ratio 1 -> 0; a factor-f pinch yields the delta that,
// applied to the slider, multiplies the mapped value by f.
export function pinchZoomDelta(ratio: number, logRange: number): number {
  if (ratio <= 0 || logRange <= 0) return 0;
  return (100 * Math.log(ratio)) / logRange;
}

// Client -> element-local coordinates for a canvas surface.
export function clientToCanvasPoint(
  rect: { left: number; top: number },
  clientX: number,
  clientY: number,
): CanvasGesturePoint {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// Exact inverse of clientToCanvasPoint for the same rect.
export function canvasPointToClient(
  rect: { left: number; top: number },
  pt: CanvasGesturePoint,
): { clientX: number; clientY: number } {
  return { clientX: rect.left + pt.x, clientY: rect.top + pt.y };
}

interface TrackedPointer {
  startX: number;
  startY: number;
  startT: number;
  lastX: number;
  lastY: number;
}

type Mode = "idle" | "pending" | "dragging" | "pinching" | "spent";

// Touch-only gesture recognizer for a canvas surface. Ignores mouse/pen so the
// desktop code paths are untouched even when `enabled` is true on a small
// window. Pairs with `touch-action: none` on the element so single-finger pan
// and pinch are deterministic (no native-scroll race, no passive-listener
// preventDefault needed). Children that own their own pointer interaction
// (e.g. link handles) opt out with a `data-gesture-skip` attribute.
export function useCanvasGestures(
  ref: RefObject<HTMLElement | null>,
  handlers: CanvasGestureHandlers,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el || !handlers.enabled) return;

    const longPressMs = handlers.longPressMs ?? DEFAULT_LONG_PRESS_MS;
    const tapSlop = handlers.tapSlopPx ?? DEFAULT_TAP_SLOP_PX;

    const pointers = new Map<number, TrackedPointer>();
    let mode: Mode = "idle";
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let prevPinchDist = 0;

    const rectPoint = (clientX: number, clientY: number): CanvasGesturePoint =>
      clientToCanvasPoint(el.getBoundingClientRect(), clientX, clientY);

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const twoPointerGeometry = () => {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
      const centroid = rectPoint(
        (a.lastX + b.lastX) / 2,
        (a.lastY + b.lastY) / 2,
      );
      return { dist, centroid };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if ((e.target as HTMLElement | null)?.closest("[data-gesture-skip]"))
        return;

      pointers.set(e.pointerId, {
        startX: e.clientX,
        startY: e.clientY,
        startT: e.timeStamp,
        lastX: e.clientX,
        lastY: e.clientY,
      });

      if (pointers.size === 2) {
        clearLongPress();
        if (mode === "dragging")
          handlersRef.current.onDragEnd?.(
            rectPoint(e.clientX, e.clientY),
          );
        mode = "pinching";
        const { dist, centroid } = twoPointerGeometry();
        prevPinchDist = dist;
        handlersRef.current.onPinchStart?.(centroid);
        return;
      }

      if (pointers.size === 1 && mode === "idle") {
        mode = "pending";
        const pt = rectPoint(e.clientX, e.clientY);
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (mode !== "pending") return;
          // Grabbed in place: subsequent moves drive the consumer (a reorder,
          // not a pan), so stay in dragging and forward onDragMove/onDragEnd.
          mode = "dragging";
          handlersRef.current.onLongPress?.(pt);
        }, longPressMs);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const tracked = pointers.get(e.pointerId);
      if (!tracked) return;
      const prevX = tracked.lastX;
      const prevY = tracked.lastY;
      tracked.lastX = e.clientX;
      tracked.lastY = e.clientY;

      if (mode === "pinching") {
        if (pointers.size < 2) return;
        const { dist, centroid } = twoPointerGeometry();
        if (prevPinchDist > 0 && dist > 0) {
          handlersRef.current.onPinch?.({
            scaleFactor: dist / prevPinchDist,
            centroid,
          });
        }
        prevPinchDist = dist;
        return;
      }

      const dx = e.clientX - tracked.startX;
      const dy = e.clientY - tracked.startY;
      const pt = rectPoint(e.clientX, e.clientY);

      if (mode === "pending") {
        if (dx * dx + dy * dy <= tapSlop * tapSlop) return;
        clearLongPress();
        mode = "dragging";
        handlersRef.current.onDragStart?.(pt);
        // Deltas start from the activating position; no jump on the first move.
        return;
      }

      if (mode === "dragging") {
        handlersRef.current.onDragMove?.(
          e.clientX - prevX,
          e.clientY - prevY,
          pt,
        );
      }
    };

    const endPointer = (e: PointerEvent, canceled: boolean) => {
      const tracked = pointers.get(e.pointerId);
      if (!tracked) return;
      pointers.delete(e.pointerId);
      const pt = rectPoint(e.clientX, e.clientY);

      if (mode === "pinching") {
        if (pointers.size < 2) {
          handlersRef.current.onPinchEnd?.();
          // Any remaining finger stays inert until all lift, so the surviving
          // pointer never jumps the view from pinch straight into a pan.
          mode = pointers.size === 0 ? "idle" : "spent";
          prevPinchDist = 0;
        }
        return;
      }

      if (mode === "dragging") {
        handlersRef.current.onDragEnd?.(pt);
      } else if (mode === "pending" && !canceled) {
        clearLongPress();
        handlersRef.current.onTap?.(pt);
      }

      if (pointers.size === 0) {
        clearLongPress();
        mode = "idle";
      }
    };

    const onPointerUp = (e: PointerEvent) => endPointer(e, false);
    const onPointerCancel = (e: PointerEvent) => endPointer(e, true);

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    return () => {
      clearLongPress();
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [ref, handlers.enabled, handlers.longPressMs, handlers.tapSlopPx]);
}
