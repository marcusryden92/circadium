"use client";

import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import {
  wrap,
  trigger,
  triggerIcon,
  triggerPlaceholder,
  panel,
  column,
  option,
  optionActive,
} from "./TimePicker.css";

const OPTION_HEIGHT = 28;
const OPTION_GAP = 2;
const COLUMN_HEIGHT = 208;

const pad = (n: number) => String(n).padStart(2, "0");

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTE_STEP = 5;
const BASE_MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
  pad(i * MINUTE_STEP),
);

// "HH:MM" -> [hh, mm]; anything malformed reads as unset.
function parseTime(value: string): [string, string] | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return [match[1], match[2]];
}

export interface TimePickerProps {
  // "HH:MM" (24h) or "" unset — the same shape the native time input used.
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "--:--",
  disabled = false,
  ariaLabel,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseTime(value);
  const [hour, minute] = parsed ?? [null, null];

  // Values off the 5-minute grid (hand-entered data) still show as selected.
  const minutes =
    minute && !BASE_MINUTES.includes(minute)
      ? [...BASE_MINUTES, minute].sort()
      : BASE_MINUTES;

  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);

  const centerOn = (col: HTMLDivElement | null, index: number) => {
    if (!col || index < 0) return;
    col.scrollTop =
      index * (OPTION_HEIGHT + OPTION_GAP) - COLUMN_HEIGHT / 2 + OPTION_HEIGHT / 2;
  };

  const onOpenChange = (next: boolean) => {
    if (disabled) return;
    setOpen(next);
  };

  // Radix mounts the portal content after open flips, so scroll positioning
  // rides the content ref callback instead of an effect.
  const onPanelMount = (node: HTMLDivElement | null) => {
    if (!node) return;
    centerOn(hourColRef.current, hour ? HOURS.indexOf(hour) : 8);
    centerOn(minuteColRef.current, minute ? minutes.indexOf(minute) : 0);
  };

  const pickHour = (h: string) => {
    onChange(`${h}:${minute ?? "00"}`);
  };

  const pickMinute = (m: string) => {
    onChange(`${hour ?? "12"}:${m}`);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <div className={wrap}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={trigger}
            aria-label={ariaLabel}
            disabled={disabled}
          >
            <Clock size={13} strokeWidth={2} className={triggerIcon} />
            <span className={parsed ? "" : triggerPlaceholder}>
              {parsed ? `${hour}:${minute}` : placeholder}
            </span>
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          ref={onPanelMount}
          className={panel}
          align="start"
          sideOffset={6}
        >
          <div className={column} ref={hourColRef}>
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                className={`${option} ${h === hour ? optionActive : ""}`}
                onClick={() => pickHour(h)}
                aria-label={`${h} hours`}
                aria-pressed={h === hour}
              >
                {h}
              </button>
            ))}
          </div>
          <div className={column} ref={minuteColRef}>
            {minutes.map((m) => (
              <button
                key={m}
                type="button"
                className={`${option} ${m === minute ? optionActive : ""}`}
                onClick={() => pickMinute(m)}
                aria-label={`${m} minutes`}
                aria-pressed={m === minute}
              >
                {m}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
