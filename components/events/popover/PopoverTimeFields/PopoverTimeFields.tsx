"use client";

import { FieldStack, FieldValue, TimePicker } from "@/components/ui";
import { timePairGrid, staticSlot } from "./PopoverTimeFields.css";

interface TimeField {
  /** "HH:mm" */
  value: string;
  /** Omit to render the value read-only. */
  onChange?: (next: string) => void;
}

interface PopoverTimeFieldsProps {
  start: TimeField;
  end: TimeField;
}

function Cell({
  label,
  field,
  ariaLabel,
}: {
  label: string;
  field: TimeField;
  ariaLabel: string;
}) {
  return (
    <FieldStack size="sm" label={label}>
      {field.onChange ? (
        <TimePicker
          value={field.value}
          ariaLabel={ariaLabel}
          onChange={field.onChange}
        />
      ) : (
        <span className={staticSlot}>
          <FieldValue>{field.value}</FieldValue>
        </span>
      )}
    </FieldStack>
  );
}

export function PopoverTimeFields({ start, end }: PopoverTimeFieldsProps) {
  return (
    <div className={timePairGrid}>
      <Cell label="start" field={start} ariaLabel="Start time" />
      <Cell label="end" field={end} ariaLabel="End time" />
    </div>
  );
}
