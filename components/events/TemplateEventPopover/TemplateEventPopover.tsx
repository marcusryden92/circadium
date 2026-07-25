"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Copy, Repeat, RotateCcw, Trash2 } from "lucide-react";
import { EventImpl } from "@fullcalendar/core/internal";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { Button, CategoryBadge, FieldStack, TypeBadge } from "@/components/ui";
import {
  occurrenceKeyFromEventId,
  hasMovedException,
} from "@/utils/planRecurrence";
import { applyTemplateOccurrenceRestore } from "@/utils/calendarEventHandlers";
import { PopoverLocationPicker } from "../PopoverLocationPicker";
import { PopoverColorPicker } from "../PopoverColorPicker";
import { timeOnDate } from "@/utils/calendarUtils";
import { calendarColors } from "@/data/calendarColors";
import { vars } from "@/lib/theme";
import { CalendarPopover } from "../CalendarPopover";
import {
  POPOVER_WIDTH,
  popoverBody,
  fullBleedLandscape,
  PopoverHeader,
  PopoverTitleRow,
  PopoverWhen,
  PopoverTimeFields,
  PopoverNote,
  PopoverFooter,
} from "../popover";

interface TemplateEventPopoverProps {
  event: EventImpl;
  eventRect: DOMRect;
  startTime: Date;
  endTime: Date;
  onClose: () => void;
  onEdit: (newTitle: string) => void;
  onCopy: () => void;
  onDelete: () => void;
  onEditTimes?: (newStart: Date, newEnd: Date) => void;
}

const POPOVER_HEIGHT = 390;

const TemplateEventPopover: React.FC<TemplateEventPopoverProps> = ({
  event,
  eventRect,
  startTime,
  endTime,
  onClose,
  onEdit,
  onCopy,
  onDelete,
  onEditTimes,
}) => {
  const { template, updateTemplateArray } = useCalendarProvider();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState<string>(event.title || "");

  // A moved one-off occurrence's event.id is a composite `templateId|key`;
  // the template row id rides in extendedProps.eventId.
  const templateId =
    (event.extendedProps?.eventId as string | undefined) ?? event.id;

  const templateItem = useMemo(
    () => template.find((t) => t.id === templateId),
    [template, templateId],
  );

  const currentColor =
    (templateItem?.color as string | undefined) ?? calendarColors[0];

  // A moved one-off carries a composite id whose key must also still have a
  // moved exception on the row — otherwise the tile is a plain series
  // occurrence and there is nothing to restore.
  const occurrenceKeyValue = occurrenceKeyFromEventId(event.id);
  const isException =
    !!templateItem &&
    occurrenceKeyValue !== null &&
    hasMovedException(templateItem.recurrenceExceptions, occurrenceKeyValue);

  const handleRestore = () => {
    if (templateItem && occurrenceKeyValue !== null) {
      applyTemplateOccurrenceRestore(
        updateTemplateArray,
        templateItem.id,
        occurrenceKeyValue,
      );
    }
    // The one-off tile this popover is anchored to disappears on restore.
    onClose();
  };

  const applyColor = (color: string) => {
    updateTemplateArray((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, color } : t)),
    );
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleLocationChange = (locationId: string | null) => {
    updateTemplateArray((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, locationId } : t)),
    );
  };

  const startEditing = () => setIsEditingTitle(true);

  const handleTitleSave = () => {
    if (onEdit && titleValue.trim() !== "") onEdit(titleValue);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setTitleValue(event.title);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleTitleSave();
    else if (e.key === "Escape") handleTitleCancel();
  };

  const categoryColor = event.backgroundColor ?? vars.muted;
  const categoryName = event.extendedProps.categoryName as string | undefined;

  const durationMinutes = Math.max(
    0,
    Math.round((endTime.getTime() - startTime.getTime()) / 60000),
  );
  const durationLabel = (() => {
    if (durationMinutes < 60) return `${durationMinutes}m`;
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  })();

  return (
    <CalendarPopover
      anchorRect={eventRect}
      width={POPOVER_WIDTH}
      height={POPOVER_HEIGHT}
      title={event.title || "Template details"}
      onClose={() => {
        if (isEditingTitle) handleTitleSave();
        onClose();
      }}
      onEscape={isEditingTitle ? handleTitleCancel : onClose}
    >
      {({ startDrag, isDragging }) => (
        <>
          <PopoverHeader
            onStartDrag={startDrag}
            isDragging={isDragging}
            onClose={onClose}
            badges={
              <>
                <TypeBadge size="sm">template</TypeBadge>
                {categoryName && (
                  <CategoryBadge size="sm" color={categoryColor}>
                    {categoryName}
                  </CategoryBadge>
                )}
              </>
            }
          />

          <PopoverTitleRow
            editor={{
              isEditing: isEditingTitle,
              value: titleValue,
              inputRef: titleInputRef,
              onChange: setTitleValue,
              onBlur: handleTitleSave,
              onKeyDown: handleTitleKeyDown,
              onStartEditing: startEditing,
            }}
            trailing={
              <PopoverColorPicker
                currentColor={currentColor}
                onChange={applyColor}
              />
            }
          />

          <div className={popoverBody}>
            <PopoverWhen
              start={startTime}
              end={endTime}
              showDate={false}
              suffix={durationLabel}
            />

            <PopoverNote
              className={fullBleedLandscape}
              icon={<Repeat size={13} strokeWidth={2} aria-hidden />}
            >
              {isException
                ? "This occurrence was moved out of its usual slot. Other edits still apply to every occurrence."
                : "Editing applies to every occurrence of this template."}
            </PopoverNote>

            {onEditTimes && (
              <PopoverTimeFields
                start={{
                  value: format(startTime, "HH:mm"),
                  onChange: (next) => {
                    // The end stays fixed — a form start edit is the top-edge
                    // resize. An end at or before it wraps to the next morning.
                    const newStart = timeOnDate(startTime, next);
                    if (newStart.getTime() === startTime.getTime()) return;
                    const newEnd =
                      endTime <= newStart
                        ? new Date(endTime.getTime() + 24 * 60 * 60 * 1000)
                        : endTime;
                    onEditTimes(newStart, newEnd);
                  },
                }}
                end={{
                  value: format(endTime, "HH:mm"),
                  onChange: (next) => {
                    // End at or before start wraps to the next morning.
                    let newEnd = timeOnDate(startTime, next);
                    if (newEnd <= startTime) {
                      newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000);
                    }
                    if (newEnd.getTime() === endTime.getTime()) return;
                    onEditTimes(startTime, newEnd);
                  },
                }}
              />
            )}

            {templateItem && (
              <FieldStack size="sm" label="Location">
                <PopoverLocationPicker
                  value={templateItem.locationId ?? null}
                  onChange={handleLocationChange}
                />
              </FieldStack>
            )}

            <PopoverFooter
              utility={
                <>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={onDelete}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 size={13} strokeWidth={2} color={vars.status.error} />
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={onCopy}
                    aria-label="Duplicate"
                    title="Duplicate"
                  >
                    <Copy size={13} strokeWidth={2} />
                  </Button>
                </>
              }
              primary={
                isException ? (
                  <Button variant="glass" size="sm" onClick={handleRestore}>
                    <RotateCcw size={12} strokeWidth={2.2} />
                    Restore to series
                  </Button>
                ) : undefined
              }
            />
          </div>
        </>
      )}
    </CalendarPopover>
  );
};

export default TemplateEventPopover;
