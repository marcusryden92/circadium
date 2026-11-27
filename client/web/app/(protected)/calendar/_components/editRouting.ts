import type { EditContext } from "@circadium/shared/calendar-core/edit";
import { resolveTemplateOccurrence } from "@/utils/calendarEventHandlers";
import {
  occurrenceKeyFromEventId,
  plannerIdFromEventId,
  planIsRecurring,
  hasMovedException,
} from "@/utils/planRecurrence";
import { EventTemplate, Planner, PlannerType } from "@/types/prisma";

// Shared by both calendar renderers: the recurrence lookups decideEdit needs,
// resolved against the live template and planner arrays.
export function buildEditContext(
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
export function completedLeafRow(
  eventId: string,
  completedEndTime: unknown,
  planner: Planner[],
): Planner | null {
  const plannerId = plannerIdFromEventId(eventId);
  if (plannerId !== eventId) return null;
  if (!completedEndTime) return null;
  const row = planner.find((p) => p.id === plannerId);
  if (!row || row.plannerType === PlannerType.plan) return null;
  if (planner.some((p) => p.parentId === plannerId)) return null;
  return row;
}
