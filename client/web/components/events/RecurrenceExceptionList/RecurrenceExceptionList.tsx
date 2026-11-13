"use client";

import { addMinutes, format } from "date-fns";
import { RotateCcw } from "lucide-react";
import {
  occurrenceKeyToDate,
  type PlanOccurrenceException,
} from "@/utils/planRecurrence";
import { row, time, arrow, skipped, restore } from "./RecurrenceExceptionList.css";

const TIME_FORMAT = "EEE MMM d · HH:mm";

interface RecurrenceExceptionListProps {
  exceptions: PlanOccurrenceException[];
  onRestore: (key: string) => void;
  // "card" = item-detail Exceptions card; "rail" = WeekStructureModal
  // TemplateEditor rail (denser type, borderless restore).
  variant?: "card" | "rail";
}

export function RecurrenceExceptionList({
  exceptions,
  onRestore,
  variant = "card",
}: RecurrenceExceptionListProps) {
  // Occurrence keys are naive local "yyyy-MM-ddTHH:mm" — lexicographic order
  // is chronological order.
  const sorted = [...exceptions].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <>
      {sorted.map((exception) => (
        <div key={exception.key} className={row[variant]}>
          <span className={time}>
            {format(occurrenceKeyToDate(exception.key), TIME_FORMAT)}
          </span>
          {exception.type === "moved" ? (
            <>
              <span className={arrow}>→</span>
              <span className={time}>
                {format(new Date(exception.newStart), TIME_FORMAT)}
                {exception.durationMinutes !== undefined
                  ? `–${format(
                      addMinutes(
                        new Date(exception.newStart),
                        exception.durationMinutes,
                      ),
                      "HH:mm",
                    )}`
                  : ""}
              </span>
            </>
          ) : (
            <span className={skipped}>skipped</span>
          )}
          <button
            type="button"
            className={restore[variant]}
            onClick={() => onRestore(exception.key)}
            title="Remove this exception — the occurrence returns to its regular time"
          >
            <RotateCcw size={11} strokeWidth={2} />
            Restore
          </button>
        </div>
      ))}
    </>
  );
}
