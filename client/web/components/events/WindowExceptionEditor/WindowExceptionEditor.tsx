"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Button,
  Combobox,
  DateTimePicker,
  SegmentedControl,
} from "@/components/ui";
import { RecurrenceExceptionList } from "@/components/events/RecurrenceExceptionList";
import {
  occurrenceKey,
  removeException,
  upsertDeletedException,
  upsertMovedException,
  PlanOccurrenceException,
} from "@/utils/planRecurrence";
import { upcomingWindowOccurrences } from "@/utils/windowOccurrences";
import {
  container,
  formStack,
  addRow,
  listStack,
} from "./WindowExceptionEditor.css";

const OCCURRENCE_LABEL_FORMAT = "EEE MMM d · HH:mm";
const UPCOMING_COUNT = 8;

type ExceptionAction = "skip" | "move";

const ACTION_OPTIONS = [
  { key: "skip", label: "Skip" },
  { key: "move", label: "Move" },
] as const;

export interface WindowExceptionEditorProps {
  window: { day: number; startTime: string; endTime: string };
  exceptions: PlanOccurrenceException[];
  onChange: (next: PlanOccurrenceException[]) => void;
  variant?: "card" | "rail";
}

// Create + restore surface for per-occurrence category-window exceptions.
// Occurrence identity is the key (original local start); callers own
// serialization of the exception array back onto the window row.
export function WindowExceptionEditor({
  window: win,
  exceptions,
  onChange,
  variant = "card",
}: WindowExceptionEditorProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [action, setAction] = useState<ExceptionAction>("skip");
  const [moveTarget, setMoveTarget] = useState("");

  const excludeKeys = useMemo(
    () => new Set(exceptions.map((e) => e.key)),
    [exceptions],
  );
  const options = useMemo(
    () =>
      upcomingWindowOccurrences(win, new Date(), UPCOMING_COUNT, excludeKeys).map(
        (start) => ({
          value: occurrenceKey(start),
          label: format(start, OCCURRENCE_LABEL_FORMAT),
        }),
      ),
    [win, excludeKeys],
  );

  const selectOccurrence = (key: string | null) => {
    setSelectedKey(key);
    // The key is the occurrence's naive local start — exactly the
    // DateTimePicker value shape — so the move target prefills to "no move".
    if (key) setMoveTarget(key);
  };

  const canAdd =
    selectedKey !== null && (action === "skip" || moveTarget.length > 0);

  const addException = () => {
    if (!selectedKey) return;
    const next =
      action === "skip"
        ? upsertDeletedException(exceptions, selectedKey)
        : upsertMovedException(
            exceptions,
            selectedKey,
            new Date(moveTarget).toISOString(),
          );
    onChange(next);
    setSelectedKey(null);
    setMoveTarget("");
  };

  return (
    <div className={container[variant]}>
      <div className={formStack}>
        <Combobox
          value={selectedKey}
          options={options}
          onChange={selectOccurrence}
          placeholder="Pick an occurrence…"
          ariaLabel="Occurrence"
        />
        {selectedKey !== null && (
          <>
            <SegmentedControl
              options={ACTION_OPTIONS}
              value={action}
              onChange={(next) => setAction(next)}
            />
            {action === "move" && (
              <DateTimePicker
                value={moveTarget}
                onChange={setMoveTarget}
                ariaLabel="New start"
              />
            )}
            <div className={addRow}>
              <Button
                variant="glass"
                size="sm"
                onClick={addException}
                disabled={!canAdd}
              >
                {action === "skip" ? "Skip occurrence" : "Move occurrence"}
              </Button>
            </div>
          </>
        )}
      </div>
      {exceptions.length > 0 && (
        <div className={listStack}>
          <RecurrenceExceptionList
            exceptions={exceptions}
            onRestore={(key) => onChange(removeException(exceptions, key))}
            variant={variant}
          />
        </div>
      )}
    </div>
  );
}
