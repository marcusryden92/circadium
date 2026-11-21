"use client";

import { useEffect, useState } from "react";
import { DurationField, Input } from "@/components/ui";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import {
  MIN_CHUNK_MINUTES,
  SPLIT_MAX_UNLIMITED,
  splitMaxIsUnlimited,
  type TaskSplittingSettings,
} from "@/utils/taskSplitting";
import {
  boxesCol,
  inputsGrid,
  inputStack,
  inputCaption,
  progressNote,
  completedRow,
} from "./SplittingFields.css";

// The default a fresh "Split into chunks" toggle enables with.
export const DEFAULT_SPLITTING_SETTINGS: TaskSplittingSettings = {
  minMinutes: 60,
  maxMinutes: SPLIT_MAX_UNLIMITED,
  maxMinutesPerDay: null,
  minSpacingMinutes: null,
};

// Free typing, clamp on commit — clamping per keystroke fights the user
// (typing "90" clamps the intermediate "9" up to the minimum and the digits
// land on the clamped value).
function CommitNumberInput({
  value,
  placeholder,
  ariaLabel,
  onCommit,
}: {
  value: number | null;
  placeholder?: string;
  ariaLabel: string;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [value]);

  const commit = () => {
    if (draft === null) return;
    onCommit(draft);
    setDraft(null);
  };

  return (
    <Input
      type="number"
      value={draft ?? (value === null ? "" : String(value))}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(null);
      }}
      aria-label={ariaLabel}
    />
  );
}

// The chunk-bound fields shared by the item-detail SplittingSection and the
// subtask EditDrawer. Rendered only when splitting is enabled (settings
// non-null); the enabling toggle lives in each host so it can own its layout.
export function SplittingFields({
  settings,
  duration,
  completed,
  onChange,
  onCompletedCommit,
  showCompleted = true,
}: {
  settings: TaskSplittingSettings;
  duration: number;
  completed: number;
  onChange: (next: TaskSplittingSettings) => void;
  // When provided, the completed total renders as an editable duration field
  // instead of the read-only note. Hosts withhold it while completion is
  // locked (root not ready).
  onCompletedCommit?: (minutes: number) => void;
  // False when the host renders its own completed/progress block (EditDrawer).
  showCompleted?: boolean;
}) {
  const commitMin = (raw: string) => {
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) return;
    const min = Math.max(MIN_CHUNK_MINUTES, parsed);
    onChange({
      ...settings,
      minMinutes: min,
      maxMinutes: splitMaxIsUnlimited(settings)
        ? SPLIT_MAX_UNLIMITED
        : Math.max(min, settings.maxMinutes),
      maxMinutesPerDay:
        settings.maxMinutesPerDay === null
          ? null
          : Math.max(min, settings.maxMinutesPerDay),
    });
  };

  const commitMax = (raw: string) => {
    if (raw.trim() === "") {
      onChange({ ...settings, maxMinutes: SPLIT_MAX_UNLIMITED });
      return;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) return;
    onChange({
      ...settings,
      maxMinutes:
        parsed <= 0
          ? SPLIT_MAX_UNLIMITED
          : Math.max(settings.minMinutes, parsed),
    });
  };

  const commitPerDay = (raw: string) => {
    if (raw.trim() === "") {
      onChange({ ...settings, maxMinutesPerDay: null });
      return;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) return;
    onChange({
      ...settings,
      maxMinutesPerDay:
        parsed <= 0 ? null : Math.max(settings.minMinutes, parsed),
    });
  };

  const commitSpacing = (raw: string) => {
    if (raw.trim() === "") {
      onChange({ ...settings, minSpacingMinutes: null });
      return;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) return;
    onChange({ ...settings, minSpacingMinutes: parsed > 0 ? parsed : null });
  };

  return (
    <div className={boxesCol}>
      <div className={inputsGrid}>
        <div className={inputStack}>
          <span className={inputCaption}>Min (min)</span>
          <CommitNumberInput
            value={settings.minMinutes}
            ariaLabel="Minimum chunk minutes"
            onCommit={commitMin}
          />
        </div>
        <div className={inputStack}>
          <span className={inputCaption}>Max (min)</span>
          <CommitNumberInput
            value={splitMaxIsUnlimited(settings) ? null : settings.maxMinutes}
            placeholder="∞"
            ariaLabel="Maximum chunk minutes (0 or empty = no limit)"
            onCommit={commitMax}
          />
        </div>
        <div className={inputStack}>
          <span className={inputCaption}>Max / day</span>
          <CommitNumberInput
            value={settings.maxMinutesPerDay}
            placeholder="∞"
            ariaLabel="Maximum minutes per day (0 or empty = no limit)"
            onCommit={commitPerDay}
          />
        </div>
        <div className={inputStack}>
          <span className={inputCaption}>Min gap</span>
          <CommitNumberInput
            value={settings.minSpacingMinutes ?? null}
            placeholder="0"
            ariaLabel="Minimum minutes between chunks"
            onCommit={commitSpacing}
          />
        </div>
      </div>
      {!showCompleted ? null : onCompletedCommit ? (
        <div className={completedRow}>
          <DurationField
            minutes={completed}
            onCommit={onCompletedCommit}
            ariaLabel="Completed time"
          />
          <span className={progressNote}>
            of {formatMinutesToHours(duration)} done
          </span>
        </div>
      ) : (
        completed > 0 && (
          <span className={progressNote}>
            {formatMinutesToHours(completed)} of{" "}
            {formatMinutesToHours(duration)} done
          </span>
        )
      )}
    </div>
  );
}
