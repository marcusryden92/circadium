import type { CalendarEvent, CalendarRange } from "../model/calendarEvent";
import type { HitResult } from "../layout/hitTest";

// ---------------------------------------------------------------------------
// Normalized pointer event — renderers produce these from platform-specific
// input (DOM PointerEvent, gesture-handler, etc.)
// ---------------------------------------------------------------------------

export type PointerPhase = "start" | "move" | "end" | "cancel";

export interface NormalizedPointerEvent {
  phase: PointerPhase;
  /** Horizontal px relative to the grid's left edge. */
  x: number;
  /** Vertical px relative to the grid's top edge (scroll-adjusted). */
  y: number;
  /** Event timestamp (ms since epoch). */
  time: number;
}

// ---------------------------------------------------------------------------
// Grid metrics — renderers provide these so the core can hit-test
// ---------------------------------------------------------------------------

export interface GridMetrics {
  hourHeight: number;
  columnWidth: number;
  visibleRange: CalendarRange;
  snapMinutes: number;
  /** Current scroll top of the grid container, in px. */
  scrollTop: number;
  /** Total scrollable height of the grid content, in px. */
  scrollHeight: number;
  /** Visible viewport height of the grid container, in px. */
  viewportHeight: number;
}

// ---------------------------------------------------------------------------
// Drag kind — what kind of interaction is happening
// ---------------------------------------------------------------------------

export type DragKind = "move" | "resize-start" | "resize-end" | "create";

// ---------------------------------------------------------------------------
// Drag state machine states
// ---------------------------------------------------------------------------

export interface IdleState {
  phase: "idle";
}

export interface PendingState {
  phase: "pending";
  startEvent: NormalizedPointerEvent;
  startHit: HitResult;
  event: CalendarEvent | null;
  kind: DragKind;
  timerId: number;
}

export interface DraggingState {
  phase: "dragging";
  kind: DragKind;
  event: CalendarEvent | null;
  startHit: HitResult;
  currentHit: HitResult;
  /** Whether the allow hook is passing for the current position. */
  allowed: boolean;
}

export interface CommittedState {
  phase: "committed";
  kind: DragKind;
  event: CalendarEvent | null;
  startHit: HitResult;
  endHit: HitResult;
}

export interface CancelledState {
  phase: "cancelled";
}

export type DragState =
  | IdleState
  | PendingState
  | DraggingState
  | CommittedState
  | CancelledState;

// ---------------------------------------------------------------------------
// Preview geometry — what the renderer draws while dragging
// ---------------------------------------------------------------------------

export interface DragPreview {
  /** The day column the preview lands in. */
  day: Date;
  /** Start minute within the day. */
  startMinute: number;
  /** End minute within the day. */
  endMinute: number;
  /** Whether the allow hook passes at this position. */
  allowed: boolean;
}

// ---------------------------------------------------------------------------
// Allow hook — called during drag to validate the preview position
// ---------------------------------------------------------------------------

// The hits ride along because the preview is day-local: it cannot express a
// span that crosses midnight or a move into another column, which a caller
// validating the real dropped range (an overnight window, say) needs.
export interface AllowHits {
  startHit: HitResult;
  currentHit: HitResult;
}

export type AllowHook = (
  preview: DragPreview,
  event: CalendarEvent | null,
  kind: DragKind,
  hits: AllowHits,
) => boolean;

// ---------------------------------------------------------------------------
// Mutation deltas — the result of comparing two hit positions
// ---------------------------------------------------------------------------

export interface MoveDelta {
  /** Day offset (positive = right/later in week). */
  dayOffset: number;
  /** Minute offset (positive = later in day). */
  minuteOffset: number;
}

export interface ResizeDelta {
  /** Change in duration, in minutes (positive = longer). */
  durationDelta: number;
  /** For resize-start: the new start minute. */
  edge: "start" | "end";
}

export interface CreateRange {
  day: Date;
  startMinute: number;
  endMinute: number;
}

// ---------------------------------------------------------------------------
// Configuration for the drag machine
// ---------------------------------------------------------------------------

export interface DragMachineConfig {
  /** Long-press delay before a drag starts (ms). */
  longPressDelay: number;
  /** Pixel distance threshold that cancels a pending long-press. */
  moveThreshold: number;
  /** Allow hook called during drag to validate preview position. */
  allowHook?: AllowHook;
}
