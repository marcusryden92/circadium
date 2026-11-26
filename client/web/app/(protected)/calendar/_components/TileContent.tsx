"use client";

import EventContent from "@/components/events/EventContent";
import TemplateEventContent from "@/components/events/TemplateEventContent";
import TravelEventContent from "@/components/events/TravelEventContent";
import ExternalEventContent from "@/components/events/ExternalEventContent";
import { CategoryWrapperEvent } from "@/components/events/CategoryWrapperEvent";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { getDuration } from "@/utils/calendarUtils";
import {
  applyTemplateOccurrenceDelete,
  applyTemplateOccurrenceResize,
} from "@/utils/calendarEventHandlers";
import {
  handleTemplateEventCopy,
  handleTemplateEventEdit,
} from "@/utils/template-handlers/templateEventHandlers";
import { RuntimeEventExtendedProps } from "@/types/ui";
import { EventType } from "@/types/prisma";
import {
  decideEdit,
  type EditContext,
} from "@circadium/shared/calendar-core/edit";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";
import type { TileEvent } from "@/utils/calendar-rendering/tileEvent";
import type { PendingTemplateScope } from "./ScopeModals";

// decideEdit only reads the kind, id, start and editable flag; the stub
// carries no more than the tile event knows.
export function templateEditStub(
  id: string,
  start: Date,
  end: Date,
): CalendarEvent {
  return {
    kind: EventType.template,
    id,
    title: "",
    start,
    end,
    editable: true,
    templateId: "",
    occurrenceKey: "",
    moved: false,
    color: "",
  };
}

interface TileContentProps {
  event: TileEvent;
  // Read lazily, at the moment of an edit, so the renderer's callback stays
  // identity-stable across planner/template updates.
  getEditContext: () => EditContext;
  onTemplateScope: (scope: PendingTemplateScope) => void;
}

// The content drawn inside one calendar tile, shared by both renderers: the
// per-kind component, plus the template popover edits routed through
// decideEdit to the same apply functions and scope prompt.
export function TileContent({
  event,
  getEditContext,
  onTemplateScope,
}: TileContentProps) {
  const { updateTemplateArray, userId } = useCalendarProvider();
  const eventType = (
    event.extendedProps as RuntimeEventExtendedProps | undefined
  )?.eventType;

  if (eventType === EventType.category) {
    const ext = event.extendedProps as
      | (RuntimeEventExtendedProps & {
          categoryName?: string;
          categoryColor?: string | null;
        })
      | undefined;
    const categoryId = ext?.categoryId || "";
    const isStrict = !!ext?.isStrict;
    const wrapperId = ext?.wrapperId || "";
    const trespassingStart = !!ext?.trespassingStart;
    const trespassingEnd = !!ext?.trespassingEnd;
    // Clean name from extendedProps ("Work"), not event.title
    // ("Work Time Slot") — so the header hover chip matches what
    // items inside the category show.
    const cleanCategoryName = ext?.categoryName ?? event.title;
    const rawCategoryColor = ext?.categoryColor ?? null;
    return (
      <CategoryWrapperEvent
        categoryId={categoryId}
        categoryName={cleanCategoryName}
        categoryColor={rawCategoryColor}
        isStrict={isStrict}
        start={event.start || new Date()}
        end={event.end || new Date()}
        wrapperId={wrapperId}
        trespassingStart={trespassingStart}
        trespassingEnd={trespassingEnd}
      />
    );
  }

  if (eventType === EventType.template) {
    return (
      <TemplateEventContent
        event={event}
        onEditTitle={handleTemplateEventEdit}
        onCopy={() =>
          handleTemplateEventCopy(updateTemplateArray, event, userId)
        }
        onDelete={() => {
          if (!event.start || !event.end) return;
          const stub = templateEditStub(event.id, event.start, event.end);
          const decision = decideEdit(stub, "delete", getEditContext(), event.start);
          if (decision.action === "reject") return;
          if (decision.action === "apply" && decision.scope === "single") {
            applyTemplateOccurrenceDelete(
              updateTemplateArray,
              decision.entityId,
              decision.occurrenceKey,
            );
            return;
          }
          if (decision.action === "askScope") {
            onTemplateScope({
              mode: "delete",
              templateId: decision.entityId,
              templateTitle: decision.entityTitle,
              occurrenceKey: decision.occurrenceKey,
            });
          }
        }}
        hideHoverButtons
        scopedDelete
        onEditTimes={(newStart, newEnd) => {
          if (!event.start || !event.end) return;
          const stub = templateEditStub(event.id, event.start, event.end);
          const decision = decideEdit(stub, "resize", getEditContext(), event.start);
          if (decision.action === "reject") return;
          const newDurationMinutes = getDuration(newStart, newEnd);
          if (decision.action === "apply" && decision.scope === "single") {
            applyTemplateOccurrenceResize(
              updateTemplateArray,
              decision.entityId,
              decision.occurrenceKey,
              newStart,
              newDurationMinutes,
            );
            return;
          }
          if (decision.action === "askScope") {
            onTemplateScope({
              mode: "resize",
              templateId: decision.entityId,
              templateTitle: decision.entityTitle,
              occurrenceKey: decision.occurrenceKey,
              newStart,
              newDurationMinutes,
              revert: () => {},
            });
          }
        }}
      />
    );
  }

  if (eventType === EventType.travel) {
    return <TravelEventContent event={event} />;
  }

  if (eventType === EventType.external) {
    return <ExternalEventContent event={event} />;
  }

  return <EventContent event={event} />;
}
