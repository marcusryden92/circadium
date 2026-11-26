import type { CalendarEvent } from "../model/calendarEvent";
import type { HitResult } from "../layout/hitTest";
import { hitTest } from "../layout/hitTest";
import { wallMinutes } from "../layout/wallClock";
import type {
  NormalizedPointerEvent,
  GridMetrics,
  DragKind,
  DragState,
  IdleState,
  DraggingState,
  DragPreview,
  AllowHook,
  DragMachineConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LONG_PRESS_DELAY = 300;
const DEFAULT_MOVE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Preview geometry — computed from the state machine's current position
// ---------------------------------------------------------------------------

export function computePreview(
  state: DraggingState,
  event: CalendarEvent | null,
  kind: DragKind,
): DragPreview | null {
  const { startHit, currentHit } = state;

  if (kind === "create") {
    const minMinute = Math.min(startHit.minute, currentHit.minute);
    const maxMinute = Math.max(startHit.minute, currentHit.minute);
    return {
      day: currentHit.day,
      startMinute: minMinute,
      endMinute: maxMinute,
      allowed: state.allowed,
    };
  }

  if (!event) return null;
  const eventStartMinute = wallMinutes(event.start);
  const eventEndMinute = wallMinutes(event.end);
  const duration = eventEndMinute - eventStartMinute;

  if (kind === "move") {
    const minuteOffset = currentHit.minute - startHit.minute;
    const newStart = eventStartMinute + minuteOffset;
    const newEnd = newStart + duration;
    return {
      day: currentHit.day,
      startMinute: Math.max(0, newStart),
      endMinute: Math.min(1440, newEnd),
      allowed: state.allowed,
    };
  }

  if (kind === "resize-start") {
    const minuteOffset = currentHit.minute - startHit.minute;
    const newStart = eventStartMinute + minuteOffset;
    return {
      day: startHit.day,
      startMinute: Math.max(0, Math.min(newStart, eventEndMinute - 5)),
      endMinute: eventEndMinute,
      allowed: state.allowed,
    };
  }

  if (kind === "resize-end") {
    const minuteOffset = currentHit.minute - startHit.minute;
    const newEnd = eventEndMinute + minuteOffset;
    return {
      day: startHit.day,
      startMinute: eventStartMinute,
      endMinute: Math.min(1440, Math.max(newEnd, eventStartMinute + 5)),
      allowed: state.allowed,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Drag state machine — pure functional transitions
// ---------------------------------------------------------------------------

export interface DragTransition {
  state: DragState;
  /** Timer id to set (pending phase only). Caller is responsible for
   *  calling `setTimeout` and feeding the id back via `confirmLongPress`. */
  startTimer?: { delay: number };
  /** Timer id to cancel (when leaving pending). */
  cancelTimer?: number;
}

function idle(): IdleState {
  return { phase: "idle" };
}

function evaluateAllow(
  preview: DragPreview | null,
  event: CalendarEvent | null,
  kind: DragKind,
  allowHook: AllowHook | undefined,
  startHit: HitResult,
  currentHit: HitResult,
): boolean {
  if (!preview) return false;
  if (!allowHook) return true;
  return allowHook(preview, event, kind, { startHit, currentHit });
}

/**
 * Process a pointer event and return the next state plus any side-effect
 * instructions (timer start/cancel). The caller owns the timer and
 * scroll implementations.
 */
export function transition(
  state: DragState,
  pointerEvent: NormalizedPointerEvent,
  metrics: GridMetrics,
  config: DragMachineConfig,
  /** The event under the pointer at start, if any. null = create. */
  targetEvent: CalendarEvent | null,
  /** The drag kind, determined by the renderer from hit position on the event tile. */
  targetKind: DragKind,
): DragTransition {
  const resolvedConfig = {
    longPressDelay: config.longPressDelay ?? DEFAULT_LONG_PRESS_DELAY,
    moveThreshold: config.moveThreshold ?? DEFAULT_MOVE_THRESHOLD,
    allowHook: config.allowHook,
  };

  const hit = hitTest(
    pointerEvent.x,
    pointerEvent.y,
    metrics.columnWidth,
    metrics.hourHeight,
    metrics.visibleRange,
    metrics.snapMinutes,
  );

  switch (state.phase) {
    case "idle": {
      if (pointerEvent.phase !== "start") {
        return { state };
      }
      if (!hit) {
        return { state };
      }
      return {
        state: {
          phase: "pending",
          startEvent: pointerEvent,
          startHit: hit,
          event: targetEvent,
          kind: targetKind,
          timerId: 0,
        },
        startTimer: { delay: resolvedConfig.longPressDelay },
      };
    }

    case "pending": {
      if (pointerEvent.phase === "cancel") {
        return {
          state: idle(),
          cancelTimer: state.timerId,
        };
      }

      if (pointerEvent.phase === "end") {
        return {
          state: idle(),
          cancelTimer: state.timerId,
        };
      }

      if (pointerEvent.phase === "move") {
        const dx = pointerEvent.x - state.startEvent.x;
        const dy = pointerEvent.y - state.startEvent.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > resolvedConfig.moveThreshold) {
          return {
            state: idle(),
            cancelTimer: state.timerId,
          };
        }
      }

      return { state };
    }

    case "dragging": {
      if (
        pointerEvent.phase === "cancel" ||
        pointerEvent.phase === "end"
      ) {
        if (pointerEvent.phase === "cancel") {
          return { state: { phase: "cancelled" } };
        }
        const endHit = hit ?? state.currentHit;
        if (!state.allowed) {
          return { state: { phase: "cancelled" } };
        }
        return {
          state: {
            phase: "committed",
            kind: state.kind,
            event: state.event,
            startHit: state.startHit,
            endHit,
          },
        };
      }

      if (pointerEvent.phase === "move" && hit) {
        const preview = computePreviewFromHits(
          state.startHit,
          hit,
          state.event,
          state.kind,
        );
        const allowed = evaluateAllow(
          preview,
          state.event,
          state.kind,
          resolvedConfig.allowHook,
          state.startHit,
          hit,
        );
        return {
          state: {
            ...state,
            currentHit: hit,
            allowed,
          },
        };
      }

      return { state };
    }

    case "committed":
    case "cancelled": {
      if (pointerEvent.phase === "start" && hit) {
        return {
          state: {
            phase: "pending",
            startEvent: pointerEvent,
            startHit: hit,
            event: targetEvent,
            kind: targetKind,
            timerId: 0,
          },
          startTimer: { delay: resolvedConfig.longPressDelay },
        };
      }
      return { state };
    }
  }
}

/**
 * Called when the long-press timer fires. Transitions from pending to
 * dragging if still in the pending phase.
 */
export function confirmLongPress(
  state: DragState,
  config: DragMachineConfig,
): DragTransition {
  if (state.phase !== "pending") {
    return { state };
  }

  const preview = computePreviewFromHits(
    state.startHit,
    state.startHit,
    state.event,
    state.kind,
  );
  const allowed = evaluateAllow(
    preview,
    state.event,
    state.kind,
    config.allowHook,
    state.startHit,
    state.startHit,
  );

  return {
    state: {
      phase: "dragging",
      kind: state.kind,
      event: state.event,
      startHit: state.startHit,
      currentHit: state.startHit,
      allowed,
    },
  };
}

/**
 * Force cancel from any state (e.g. Escape key, scroll interruption).
 */
export function cancel(state: DragState): DragTransition {
  if (state.phase === "pending") {
    return { state: { phase: "cancelled" }, cancelTimer: state.timerId };
  }
  if (state.phase === "dragging") {
    return { state: { phase: "cancelled" } };
  }
  return { state };
}

/**
 * Reset to idle from committed or cancelled.
 */
export function reset(): DragTransition {
  return { state: idle() };
}

// ---------------------------------------------------------------------------
// Internal preview builder (from two hit results, before allow evaluation)
// ---------------------------------------------------------------------------

function computePreviewFromHits(
  startHit: HitResult,
  currentHit: HitResult,
  event: CalendarEvent | null,
  kind: DragKind,
): DragPreview | null {
  if (kind === "create") {
    const minMinute = Math.min(startHit.minute, currentHit.minute);
    const maxMinute = Math.max(startHit.minute, currentHit.minute);
    return {
      day: currentHit.day,
      startMinute: minMinute,
      endMinute: maxMinute,
      allowed: true,
    };
  }

  if (!event) return null;
  const eventStartMinute = wallMinutes(event.start);
  const eventEndMinute = wallMinutes(event.end);
  const duration = eventEndMinute - eventStartMinute;

  if (kind === "move") {
    const minuteOffset = currentHit.minute - startHit.minute;
    const newStart = eventStartMinute + minuteOffset;
    return {
      day: currentHit.day,
      startMinute: Math.max(0, newStart),
      endMinute: Math.min(1440, newStart + duration),
      allowed: true,
    };
  }

  if (kind === "resize-start") {
    const minuteOffset = currentHit.minute - startHit.minute;
    const newStart = eventStartMinute + minuteOffset;
    return {
      day: startHit.day,
      startMinute: Math.max(0, Math.min(newStart, eventEndMinute - 5)),
      endMinute: eventEndMinute,
      allowed: true,
    };
  }

  if (kind === "resize-end") {
    const minuteOffset = currentHit.minute - startHit.minute;
    const newEnd = eventEndMinute + minuteOffset;
    return {
      day: startHit.day,
      startMinute: eventStartMinute,
      endMinute: Math.min(1440, Math.max(newEnd, eventStartMinute + 5)),
      allowed: true,
    };
  }

  return null;
}
