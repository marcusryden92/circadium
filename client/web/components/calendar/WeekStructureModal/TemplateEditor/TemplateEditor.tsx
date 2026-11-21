"use client";

import { useMemo } from "react";
import { Button, Input, TimePicker, vars } from "@/components/ui";
import type { EventTemplate } from "@/types/prisma";
import { PopoverLocationPicker } from "@/components/events/PopoverLocationPicker";
import { PopoverColorPicker } from "@/components/events/PopoverColorPicker";
import { RecurrenceExceptionList } from "@/components/events/RecurrenceExceptionList";
import { calendarColors } from "@/data/calendarColors";
import {
  parseRecurrenceExceptions,
  serializeRecurrenceExceptions,
  removeException,
} from "@/utils/planRecurrence";
import { addMinutesToHHMM, timeToMinutes } from "../timeWindow";
import {
  selectedPanel,
  selectedHeaderRow,
  selectedSwatch,
  selectedTitle,
  fieldGrid,
  field,
  fieldWithMargin,
  fieldLabel,
  selectedActions,
  exceptionsSection,
} from "./TemplateEditor.css";

interface TemplateEditorProps {
  template: EventTemplate;
  onUpdate: (patch: Partial<EventTemplate>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function TemplateEditor({
  template,
  onUpdate,
  onDuplicate,
  onDelete,
}: TemplateEditorProps) {
  const exceptions = useMemo(
    () => parseRecurrenceExceptions(template.recurrenceExceptions),
    [template.recurrenceExceptions],
  );
  const restoreException = (key: string) => {
    onUpdate({
      recurrenceExceptions: serializeRecurrenceExceptions(
        removeException(exceptions, key),
      ),
    });
  };

  return (
    <div className={selectedPanel}>
      <div className={selectedHeaderRow}>
        <span
          className={selectedSwatch}
          style={{ background: template.color || calendarColors[0] }}
        />
        <span className={selectedTitle}>{template.title || "Untitled"}</span>
      </div>

      <div className={fieldWithMargin}>
        <span className={fieldLabel}>name</span>
        <Input
          value={template.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
      </div>

      <div className={fieldGrid}>
        <div className={field}>
          <span className={fieldLabel}>start</span>
          <TimePicker
            value={template.startTime}
            ariaLabel="Start time"
            onChange={(next) => {
              if (next === template.startTime) return;
              // Duration is preserved; a start re-anchor invalidates
              // per-occurrence exception keys — same rule as a grid drag.
              onUpdate({ startTime: next, recurrenceExceptions: null });
            }}
          />
        </div>
        <div className={field}>
          <span className={fieldLabel}>end</span>
          <TimePicker
            value={addMinutesToHHMM(template.startTime, template.duration)}
            ariaLabel="End time"
            onChange={(next) => {
              // The wrap handles overnight (end at or before start runs into
              // the next morning); zero-length is rejected. End-only change:
              // exceptions are preserved.
              const dur =
                (timeToMinutes(next) -
                  timeToMinutes(template.startTime) +
                  1440) %
                1440;
              if (dur === 0 || dur === template.duration) return;
              onUpdate({ duration: dur });
            }}
          />
        </div>
      </div>

      <div className={fieldWithMargin}>
        <span className={fieldLabel}>location</span>
        <PopoverLocationPicker
          value={template.locationId ?? null}
          onChange={(locationId) => onUpdate({ locationId })}
        />
      </div>

      <div className={fieldWithMargin}>
        <span className={fieldLabel}>color</span>
        <PopoverColorPicker
          currentColor={template.color || calendarColors[0]}
          onChange={(c) => onUpdate({ color: c })}
        />
      </div>

      <div className={selectedActions}>
        <Button variant="glass" size="sm" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onDelete}
          style={{ color: vars.status.error }}
        >
          Delete
        </Button>
      </div>

      {exceptions.length > 0 && (
        <div className={exceptionsSection}>
          <span className={fieldLabel}>exceptions</span>
          <RecurrenceExceptionList
            exceptions={exceptions}
            onRestore={restoreException}
            variant="rail"
          />
        </div>
      )}
    </div>
  );
}
