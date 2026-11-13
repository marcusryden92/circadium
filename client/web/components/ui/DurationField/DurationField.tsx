"use client";

import { useEffect, useState } from "react";
import { Input } from "../Input";
import { root, unitGroup, input, unit } from "./DurationField.css";

interface DurationFieldProps {
  minutes: number;
  onCommit: (minutes: number) => void;
  minMinutes?: number;
  ariaLabel?: string;
}

// Enter a duration as separate hours + minutes fields (no more typing 720 for
// 8 hours). Free typing, clamp on commit — clamping per keystroke fights the
// user, so drafts are held locally and reconciled on blur/Enter.
export function DurationField({
  minutes,
  onCommit,
  minMinutes = 0,
  ariaLabel = "Duration",
}: DurationFieldProps) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const [hoursDraft, setHoursDraft] = useState<string | null>(null);
  const [minsDraft, setMinsDraft] = useState<string | null>(null);

  useEffect(() => {
    setHoursDraft(null);
    setMinsDraft(null);
  }, [minutes]);

  const commit = (nextHours: string | null, nextMins: string | null) => {
    if (nextHours === null && nextMins === null) return;
    const h = nextHours === null ? hours : Math.floor(Number(nextHours));
    const m = nextMins === null ? mins : Math.floor(Number(nextMins));
    setHoursDraft(null);
    setMinsDraft(null);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    onCommit(Math.max(minMinutes, Math.max(0, h) * 60 + Math.max(0, m)));
  };

  const onKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    clear: () => void,
  ) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      clear();
      e.currentTarget.blur();
    }
  };

  return (
    <div className={root}>
      <div className={unitGroup}>
        <Input
          className={input}
          type="number"
          min={0}
          value={hoursDraft ?? String(hours)}
          onChange={(e) => setHoursDraft(e.target.value)}
          onBlur={() => commit(hoursDraft, minsDraft)}
          onKeyDown={(e) => onKeyDown(e, () => setHoursDraft(null))}
          aria-label={`${ariaLabel} hours`}
        />
        <span className={unit}>h</span>
      </div>
      <div className={unitGroup}>
        <Input
          className={input}
          type="number"
          min={0}
          value={minsDraft ?? String(mins)}
          onChange={(e) => setMinsDraft(e.target.value)}
          onBlur={() => commit(hoursDraft, minsDraft)}
          onKeyDown={(e) => onKeyDown(e, () => setMinsDraft(null))}
          aria-label={`${ariaLabel} minutes`}
        />
        <span className={unit}>min</span>
      </div>
    </div>
  );
}
