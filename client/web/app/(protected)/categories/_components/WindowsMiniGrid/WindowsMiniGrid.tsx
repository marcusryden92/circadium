"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { CategoryTimeWindow } from "@/types/prisma";
import { orderedWeekDays } from "@/utils/calendarUtils";
import {
  wrap,
  scrollArea,
  dayHeader,
  dayLabel,
  gridArea,
  hourLabel,
  dayCol,
  hourRow,
  windowBlock,
  emptyState,
  editHint,
} from "./WindowsMiniGrid.css";

interface WindowsMiniGridProps {
  windows: CategoryTimeWindow[];
  color: string;
  onOpen: () => void;
}

// Indexed by day integer (0=Sunday .. 6=Saturday); column order comes from
// the user's week-start preference.
const DAY_LABELS_BY_INT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Full-24h grid keeps height constant across categories so the surrounding
// layout doesn't shift when selecting between categories with different
// window ranges.
const TOTAL_HOURS = 24;
const ROW_HEIGHT_PX = 14;
const GRID_HEIGHT_PX = TOTAL_HOURS * ROW_HEIGHT_PX;
// Initial scroll lands at ~6am — the typical waking hour. Users can scroll
// up/down to reach overnight or pre-dawn windows.
const DEFAULT_SCROLL_HOUR = 6;

// HH:MM (24h, possibly "23:59" sentinel) -> fractional hour [0, 24]
function parseTime(t: string): number {
  if (t === "23:59") return 24;
  const [h, m] = t.split(":").map((v) => parseInt(v, 10));
  return h + m / 60;
}

function formatHourLabel(h: number): string {
  if (h === 0 || h === 24) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

export function WindowsMiniGrid({
  windows,
  color,
  onOpen,
}: WindowsMiniGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { weekStartDay } = useCalendarProvider();
  const dayOrder = useMemo(() => orderedWeekDays(weekStartDay), [weekStartDay]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * ROW_HEIGHT_PX;
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  if (windows.length === 0) {
    return (
      <div
        className={wrap}
        onClick={onOpen}
        onKeyDown={onKey}
        role="button"
        tabIndex={0}
        aria-label="Open week structure to add time windows"
      >
        <div className={emptyState}>
          No time windows yet — click to add some
        </div>
      </div>
    );
  }

  // Pinstripe matches the WeekStructureModal window styling: 45° diagonal lines
  // on a tinted color fill, the visual idiom for "category time window".
  const blockBg = `repeating-linear-gradient(45deg, transparent 0 5px, ${color} 5px 6.5px), color-mix(in srgb, ${color} 80%, transparent)`;
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i);

  return (
    <div
      className={wrap}
      onClick={onOpen}
      onKeyDown={onKey}
      role="button"
      tabIndex={0}
      aria-label="Open week structure to edit time windows"
    >
      <div className={dayHeader}>
        <span />
        {dayOrder.map((dayInt) => (
          <div key={dayInt} className={dayLabel}>
            {DAY_LABELS_BY_INT[dayInt]}
          </div>
        ))}
      </div>
      <div className={scrollArea} ref={scrollRef}>
        <div className={gridArea} style={{ height: GRID_HEIGHT_PX }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            {hours.map((h) => (
              <span
                key={h}
                className={hourLabel}
                style={{ height: ROW_HEIGHT_PX, lineHeight: `${ROW_HEIGHT_PX}px` }}
              >
                {formatHourLabel(h)}
              </span>
            ))}
          </div>
          {dayOrder.map((dayInt) => {
            const dayWindows = windows.filter((w) => w.day === dayInt);
            return (
              <div key={dayInt} className={dayCol}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className={hourRow}
                    style={{ height: ROW_HEIGHT_PX }}
                  />
                ))}
                {dayWindows.map((w) => {
                  const startH = parseTime(w.startTime);
                  const endH = parseTime(w.endTime);
                  const top = (startH / TOTAL_HOURS) * GRID_HEIGHT_PX;
                  const height = ((endH - startH) / TOTAL_HOURS) * GRID_HEIGHT_PX;
                  return (
                    <div
                      key={w.id}
                      className={windowBlock}
                      style={{
                        top,
                        height,
                        background: blockBg,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <span className={editHint}>Click to edit</span>
    </div>
  );
}
