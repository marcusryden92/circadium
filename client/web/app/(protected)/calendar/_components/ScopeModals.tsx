"use client";

import { useCalendarProvider } from "@/context/CalendarProvider";
import { RecurrenceScopeModal } from "@/components/events/RecurrenceScopeModal";
import {
  applyOccurrenceMove,
  applySeriesMove,
  applyTemplateOccurrenceMove,
  applyTemplateSeriesMove,
  applyTemplateOccurrenceDelete,
  applyTemplateOccurrenceResize,
  applyTemplateSeriesResize,
} from "@/utils/calendarEventHandlers";
import { handleTemplateEventDelete } from "@/utils/template-handlers/templateEventHandlers";

export interface PendingOccurrenceMove {
  planId: string;
  planTitle: string;
  occurrenceKey: string;
  newStart: Date;
  deltaMs: number;
  revert: () => void;
}

export type PendingTemplateScope =
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
    };

interface ScopeModalsProps {
  pendingOccurrenceMove: PendingOccurrenceMove | null;
  setPendingOccurrenceMove: (next: PendingOccurrenceMove | null) => void;
  pendingTemplateScope: PendingTemplateScope | null;
  setPendingTemplateScope: (next: PendingTemplateScope | null) => void;
}

// The "this occurrence vs every occurrence" prompts both renderers raise when
// decideEdit answers askScope. Each pending entry carries the renderer's own
// revert: FullCalendar's revert() snaps its moved tile back, the own renderer
// drops the pendingEdit that holds the tile at its drop position.
export function ScopeModals({
  pendingOccurrenceMove,
  setPendingOccurrenceMove,
  pendingTemplateScope,
  setPendingTemplateScope,
}: ScopeModalsProps) {
  const { updatePlannerArray, updateTemplateArray } = useCalendarProvider();

  return (
    <>
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
    </>
  );
}
