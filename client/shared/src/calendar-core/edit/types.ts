import type { CalendarEvent } from "../model/calendarEvent";

// ---------------------------------------------------------------------------
// Edit kinds — what the user is doing to an event
// ---------------------------------------------------------------------------

export type EditKind = "move" | "resize" | "delete";

// ---------------------------------------------------------------------------
// Occurrence data — shared by apply-single and askScope results
// ---------------------------------------------------------------------------

export interface OccurrenceInfo {
  entityId: string;
  entityTitle: string;
  occurrenceKey: string;
  entityType: "template" | "plan";
}

// ---------------------------------------------------------------------------
// decideEdit result — what the caller should do
// ---------------------------------------------------------------------------

/** Apply immediately — event is not recurring or is a non-occurrence planner. */
export interface DirectApplyResult {
  action: "apply";
  scope: "direct";
}

/**
 * Apply immediately — the occurrence was already customized (has a moved
 * exception), so re-editing always means "just this one".
 */
export interface OccurrenceApplyResult extends OccurrenceInfo {
  action: "apply";
  scope: "single";
}

export type ApplyResult = DirectApplyResult | OccurrenceApplyResult;

/** Show a scope prompt — the event is an uncustomized recurring occurrence. */
export interface AskScopeResult extends OccurrenceInfo {
  action: "askScope";
  editKind: EditKind;
}

/** Reject — the event is not editable. */
export interface RejectResult {
  action: "reject";
}

export type EditDecision = ApplyResult | AskScopeResult | RejectResult;

// ---------------------------------------------------------------------------
// Pending edit — holds a tile at its drop/resize position while the scope
// modal is open. The renderer reads this to override the event's visual
// position, and clears it when the modal resolves.
// ---------------------------------------------------------------------------

export interface PendingEdit {
  /** The event being edited. */
  event: CalendarEvent;
  editKind: EditKind;
  /** The scope decision that produced this pending state. */
  decision: AskScopeResult;
  /** Preview position: the day + minute range the tile should show at. */
  previewDay: Date;
  previewStartMinute: number;
  previewEndMinute: number;
  /** Revert function — restores the original position on cancel. */
  revert: () => void;
}

// ---------------------------------------------------------------------------
// Validation helpers — reusable range checks
// ---------------------------------------------------------------------------

/** A range is allowed if end > start and duration is at most 24 hours. */
export function rangeAllowed(start: Date, end: Date): boolean {
  return end > start && end.getTime() - start.getTime() <= 24 * 60 * 60_000;
}
