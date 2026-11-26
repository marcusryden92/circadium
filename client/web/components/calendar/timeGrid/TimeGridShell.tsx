"use client";

import type { DOMAttributes, ReactNode, RefObject } from "react";
import { hourLabels } from "./timeGridGeometry";
import * as styles from "./timeGrid.css";

const HOUR_LABELS = hourLabels();

export interface TimeGridColumn {
  key: string | number;
  header: ReactNode;
  today?: boolean;
  content: ReactNode;
}

interface TimeGridShellProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  columnsRef: RefObject<HTMLDivElement | null>;
  // The drag adapter's pointer handlers, attached to the columns element so
  // its rect is the grid origin for hit-testing.
  handlers: DOMAttributes<HTMLDivElement>;
  hourHeight: number;
  columns: TimeGridColumn[];
  bodyClassName?: string;
  // Rendered inside the root after the scroller (the caller's modals).
  children?: ReactNode;
}

// The chrome both own time grids share: a scroller holding the sticky day
// header, the hour gutter, the 30-minute slot lines and one relative column
// per day. What goes inside a column (tiles, mirrors, now line) is the
// caller's.
export function TimeGridShell({
  scrollerRef,
  columnsRef,
  handlers,
  hourHeight,
  columns,
  bodyClassName,
  children,
}: TimeGridShellProps) {
  return (
    <div className={styles.root}>
      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.headerRow}>
          <div className={styles.headerCorner} />
          {columns.map((column) => (
            <div
              key={column.key}
              className={styles.headerCell}
              data-today={column.today ? "" : undefined}
            >
              {column.header}
            </div>
          ))}
        </div>
        <div
          className={bodyClassName ? `${styles.body} ${bodyClassName}` : styles.body}
          style={{ height: 24 * hourHeight }}
        >
          <div className={styles.gutter}>
            {HOUR_LABELS.map(({ hour, label }) => (
              <span
                key={hour}
                className={styles.hourLabel}
                style={{ top: (hour + 0.25) * hourHeight }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className={styles.columns} ref={columnsRef} {...handlers}>
            <div className={styles.slotLines} aria-hidden>
              {Array.from({ length: 48 }, (_, slot) => (
                <div
                  key={slot}
                  className={styles.slotLine}
                  data-minor={slot % 2 === 1 ? "" : undefined}
                  style={{ top: (slot * hourHeight) / 2 }}
                />
              ))}
            </div>
            {columns.map((column) => (
              <div
                key={column.key}
                className={styles.column}
                data-today={column.today ? "" : undefined}
              >
                {column.content}
              </div>
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
