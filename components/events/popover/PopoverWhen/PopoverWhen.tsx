"use client";

import { format } from "date-fns";
import { Clock } from "lucide-react";
import { formatTime } from "@/utils/calendarUtils";
import { whenRow, whenIcon } from "./PopoverWhen.css";

interface PopoverWhenProps {
  start: Date;
  end: Date;
  /** false → weekday only, no date (weekly templates). Default true. */
  showDate?: boolean;
  /** Trailing detail after the time range (duration, "12m allotted"). */
  suffix?: string;
}

export function PopoverWhen({
  start,
  end,
  showDate = true,
  suffix,
}: PopoverWhenProps) {
  const datePart = showDate ? format(start, "EEE MMM d") : format(start, "EEE");
  return (
    <div className={whenRow}>
      <Clock size={13} strokeWidth={2} aria-hidden className={whenIcon} />
      <span>
        {datePart} · {formatTime(start)} – {formatTime(end)}
        {suffix ? ` · ${suffix}` : ""}
      </span>
    </div>
  );
}
