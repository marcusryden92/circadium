import { Copy, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { useCalendarProvider } from "@/context/CalendarProvider";
import { ConfirmModal } from "@/components/ui";
import { EventImpl } from "@fullcalendar/core/internal";
import { EventTemplate } from "@/types/prisma";

import TemplateEventPopover from "../TemplateEventPopover";
import EventWrapper from "../EventWrapper";
import { hoverRow, hoverBtnGroup, hoverBtn } from "./TemplateEventContent.css";

interface TemplateEventContentProps {
  event: EventImpl;
  onEditTitle: (
    updateTemplateArray: (
      template: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
      label: string,
      options?: { engineMode?: "inline" | "worker" },
    ) => void,
    eventTitle: string,
    eventId: string
  ) => void;
  onCopy: () => void;
  onDelete: () => void;
  /** When true, suppresses the in-tile hover delete/duplicate buttons. The
   *  popover still opens — destructive edits are deferred to that surface
   *  (or future "delete all vs. add exception" prompts). */
  hideHoverButtons?: boolean;
  /** When true, delete opens a scope prompt instead of removing the tile, so
   *  skip the destructive red flash + delay and hand off immediately. */
  scopedDelete?: boolean;
  /** Popover time-field edits; hands off to the same scope prompt (or direct
   *  one-off apply) as a grid resize. */
  onEditTimes?: (newStart: Date, newEnd: Date) => void;
}

const TemplateEventContent: React.FC<TemplateEventContentProps> = ({
  event,
  onEditTitle,
  onCopy,
  onDelete,
  hideHoverButtons = false,
  scopedDelete = false,
  onEditTimes,
}) => {
  const { updateTemplateArray } = useCalendarProvider();

  const elementRef = useRef<HTMLDivElement>(null);
  const [elementHeight, setElementHeight] = useState<number>(0);
  const [elementWidth, setElementWidth] = useState<number>(0);
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [eventRect, setEventRect] = useState<DOMRect | null>(null);
  const [onHover, setOnHover] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const startTime = event.start ? new Date(event.start) : new Date();
  const endTime = event.end ? new Date(event.end) : new Date();

  const handleClickDelete = () => {
    setShowPopover(false);
    // Scoped delete hands off to a "this occurrence vs. every occurrence"
    // prompt, which is itself the confirmation.
    if (scopedDelete) {
      onDelete();
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete();
  };

  const handleEditTitle = (newTitle: string) => {
    // A moved one-off occurrence's event.id is a composite `templateId|key`;
    // the template row id rides in extendedProps.eventId.
    const id = (event.extendedProps?.eventId as string | undefined) ?? event.id;
    onEditTitle(updateTemplateArray, newTitle, id);
    setShowPopover(false);
  };

  return (
    <EventWrapper
      event={event}
      elementRef={elementRef}
      elementHeight={elementHeight}
      elementWidth={elementWidth}
      setElementHeight={setElementHeight}
      setElementWidth={setElementWidth}
      setOnHover={setOnHover}
      setEventRect={setEventRect}
      isCompleted={false} // templates are never completed
      showPopover={showPopover}
      setShowPopover={setShowPopover}
    >
      {!hideHoverButtons &&
        onHover &&
        elementHeight > 40 &&
        elementWidth > 70 && (
          <div className={hoverRow}>
            <div className={hoverBtnGroup}>
              <button
                onClick={handleClickDelete}
                className={hoverBtn}
                aria-label="Delete"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>

            <div className={hoverBtnGroup}>
              <button
                onClick={onCopy}
                className={hoverBtn}
                aria-label="Duplicate"
              >
                <Copy size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

      {showPopover && eventRect && (
        <TemplateEventPopover
          event={event}
          eventRect={eventRect}
          startTime={startTime}
          endTime={endTime}
          onClose={() => setShowPopover(false)}
          onEdit={handleEditTitle}
          onCopy={() => {
            setShowPopover(false);
            onCopy();
          }}
          onDelete={handleClickDelete}
          onEditTimes={
            onEditTimes
              ? (newStart, newEnd) => {
                  // The scope prompt (or direct one-off apply) replaces the
                  // sheet — same handoff as scoped delete.
                  setShowPopover(false);
                  onEditTimes(newStart, newEnd);
                }
              : undefined
          }
        />
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete template"
        body={
          <>
            Delete <strong>{event.title || "this template"}</strong>? This
            removes the recurring block from every week.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
      />
    </EventWrapper>
  );
};

export default TemplateEventContent;
