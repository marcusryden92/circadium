"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth } from "date-fns";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { orderedWeekDays } from "@/utils/calendarUtils";
import { TimePicker } from "../TimePicker";
import {
  wrap,
  triggerBoxed,
  triggerBare,
  triggerBareSm,
  triggerIcon,
  triggerText,
  triggerPlaceholder,
  clearBtn,
  panel,
  panelHeader,
  monthLabel,
  navBtn,
  weekHeader,
  weekHeaderCell,
  dayGrid,
  dayCell,
  dayCellOutside,
  dayCellToday,
  dayCellSelected,
  footer,
  quickBtn,
} from "./DateTimePicker.css";

// Indexed by day integer (0=Sunday .. 6=Saturday); column order comes from
// the weekStartsOn prop.
const WEEKDAY_LABELS_BY_INT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const GRID_CELLS = 42;
const DEFAULT_TIME = "12:00";

const pad = (n: number) => String(n).padStart(2, "0");
const toDatePart = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimePart = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Values use the native input shapes ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm"),
// parsed as LOCAL time — new Date("YYYY-MM-DD") would read as UTC midnight
// and shift the day in most timezones.
function parseValue(value: string): Date | null {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return null;
  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const [h, min] = timePart.split(":").map(Number);
    hours = h || 0;
    minutes = min || 0;
  }
  const parsed = new Date(y, m - 1, d, hours, minutes);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface DateTimePickerProps {
  // "YYYY-MM-DDTHH:mm" in datetime mode, "YYYY-MM-DD" in date mode, "" unset —
  // the same shapes the native datetime-local/date inputs used, so call sites
  // keep their existing conversions.
  value: string;
  onChange: (next: string) => void;
  mode?: "datetime" | "date";
  variant?: "boxed" | "bare";
  // "sm" shrinks the bare trigger to list-row metadata scale (no effect on
  // boxed).
  size?: "sm" | "md";
  weekStartsOn?: WeekDayIntegers;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  variant = "boxed",
  size = "md",
  weekStartsOn = 1,
  placeholder,
  clearable = true,
  disabled = false,
  ariaLabel,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(new Date()),
  );

  const selected = parseValue(value);
  const isDateOnly = mode === "date";

  const emit = (day: Date, time: string) => {
    onChange(isDateOnly ? toDatePart(day) : `${toDatePart(day)}T${time}`);
  };

  const onOpenChange = (next: boolean) => {
    if (disabled) return;
    if (next) setViewMonth(startOfMonth(selected ?? new Date()));
    setOpen(next);
  };

  const pickDay = (day: Date) => {
    emit(day, selected ? toTimePart(selected) : DEFAULT_TIME);
    if (isDateOnly) setOpen(false);
  };

  const pickNow = () => {
    const now = new Date();
    emit(now, toTimePart(now));
    setViewMonth(startOfMonth(now));
    if (isDateOnly) setOpen(false);
  };

  const onTimeChange = (time: string) => {
    if (!time) return;
    emit(selected ?? new Date(), time);
  };

  const gridStartOffset =
    (startOfMonth(viewMonth).getDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(startOfMonth(viewMonth), -gridStartOffset);
  const days = Array.from({ length: GRID_CELLS }, (_, i) =>
    addDays(gridStart, i),
  );
  const today = new Date();

  const label = selected
    ? format(selected, isDateOnly ? "EEE d MMM yyyy" : "EEE d MMM yyyy · HH:mm")
    : placeholder ?? (isDateOnly ? "Set date" : "Set date & time");

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <div className={wrap}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={
              variant === "bare"
                ? `${triggerBare}${size === "sm" ? ` ${triggerBareSm}` : ""}`
                : triggerBoxed
            }
            aria-label={ariaLabel}
            disabled={disabled}
          >
            <CalendarDays size={14} strokeWidth={2} className={triggerIcon} />
            <span
              className={`${triggerText} ${selected ? "" : triggerPlaceholder}`}
            >
              {label}
            </span>
          </button>
        </Popover.Trigger>
        {clearable && selected && !disabled && (
          <button
            type="button"
            className={clearBtn}
            onClick={() => onChange("")}
            aria-label="Clear date"
          >
            <X size={12} strokeWidth={2.4} />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content className={panel} align="start" sideOffset={6}>
          <div className={panelHeader}>
            <button
              type="button"
              className={navBtn}
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={15} strokeWidth={2.2} />
            </button>
            <span className={monthLabel}>{format(viewMonth, "MMMM yyyy")}</span>
            <button
              type="button"
              className={navBtn}
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={15} strokeWidth={2.2} />
            </button>
          </div>
          <div className={weekHeader}>
            {orderedWeekDays(weekStartsOn).map((dayInt) => (
              <span key={dayInt} className={weekHeaderCell}>
                {WEEKDAY_LABELS_BY_INT[dayInt]}
              </span>
            ))}
          </div>
          <div className={dayGrid}>
            {days.map((day) => {
              const isSelected = selected ? isSameDay(day, selected) : false;
              const classes = [
                dayCell,
                isSameMonth(day, viewMonth) ? "" : dayCellOutside,
                isSameDay(day, today) ? dayCellToday : "",
                isSelected ? dayCellSelected : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={day.getTime()}
                  type="button"
                  className={classes}
                  onClick={() => pickDay(day)}
                  aria-label={format(day, "EEEE d MMMM yyyy")}
                  aria-pressed={isSelected}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className={footer}>
            <button type="button" className={quickBtn} onClick={pickNow}>
              {isDateOnly ? "Today" : "Now"}
            </button>
            {!isDateOnly && (
              <TimePicker
                value={selected ? toTimePart(selected) : ""}
                onChange={onTimeChange}
                ariaLabel="Time"
              />
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
