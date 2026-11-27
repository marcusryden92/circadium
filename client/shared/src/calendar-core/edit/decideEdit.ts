import { EventType } from "../../contracts";
import type { CalendarEvent } from "../model/calendarEvent";
import type { EditKind, EditDecision } from "./types";

// ---------------------------------------------------------------------------
// Context the caller provides — the minimum needed to make scope decisions.
// No imports from web, no React, no FullCalendar.
// ---------------------------------------------------------------------------

export interface EditContext {
  /** Is this occurrence already customized (has a moved exception)? */
  hasMovedException: (
    recurrenceExceptions: string | null | undefined,
    occurrenceKey: string,
  ) => boolean;
  planIsRecurring: (plan: { recurrence: string | null }) => boolean;
  /** Resolve a template event to its row + occurrence key. */
  resolveTemplateOccurrence: (
    eventId: string,
    startForKey: Date | null,
  ) => {
    templateId: string;
    templateTitle: string;
    occurrenceKey: string;
    recurrenceExceptions: string | null | undefined;
  } | null;
  /** Resolve a plan occurrence event to its row. */
  resolvePlanOccurrence: (
    eventId: string,
  ) => {
    planId: string;
    planTitle: string;
    occurrenceKey: string;
    recurrenceExceptions: string | null | undefined;
    recurrence: string | null;
  } | null;
}

/**
 * Central edit decision: given an event and what the user wants to do to it,
 * decide whether to apply immediately, show a scope prompt, or reject.
 *
 * This replaces the four repeated branches in Calendar.tsx that each check
 * hasMovedException and either apply directly or open the scope modal.
 *
 * @param event       The CalendarEvent being edited.
 * @param editKind    What the user is doing: move, resize, or delete.
 * @param context     Functions to resolve recurrence state.
 * @param preStart    The event's start before the edit (for occurrence key
 *                    resolution — a drag/resize changes event.start, so the
 *                    caller passes the pre-edit position).
 */
export function decideEdit(
  event: CalendarEvent,
  editKind: EditKind,
  context: EditContext,
  preStart?: Date | null,
): EditDecision {
  if (!event.editable) {
    return { action: "reject" };
  }

  if (event.kind === EventType.template) {
    const occurrence = context.resolveTemplateOccurrence(
      event.id,
      preStart ?? event.start,
    );
    if (!occurrence) {
      return { action: "reject" };
    }

    const info = {
      entityId: occurrence.templateId,
      entityTitle: occurrence.templateTitle,
      occurrenceKey: occurrence.occurrenceKey,
      entityType: "template" as const,
    };

    if (
      context.hasMovedException(
        occurrence.recurrenceExceptions,
        occurrence.occurrenceKey,
      )
    ) {
      return { action: "apply", scope: "single", ...info };
    }

    return { action: "askScope", ...info, editKind };
  }

  if (event.kind === EventType.planner) {
    const planOccurrence = context.resolvePlanOccurrence(event.id);

    if (planOccurrence) {
      const info = {
        entityId: planOccurrence.planId,
        entityTitle: planOccurrence.planTitle,
        occurrenceKey: planOccurrence.occurrenceKey,
        entityType: "plan" as const,
      };

      if (!context.planIsRecurring(planOccurrence)) {
        return { action: "apply", scope: "direct" };
      }

      if (
        context.hasMovedException(
          planOccurrence.recurrenceExceptions,
          planOccurrence.occurrenceKey,
        )
      ) {
        return { action: "apply", scope: "single", ...info };
      }

      return { action: "askScope", ...info, editKind };
    }

    return { action: "apply", scope: "direct" };
  }

  return { action: "reject" };
}
