"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { Category } from "@/types/prisma";
import { WindowExceptionEditor } from "@/components/events/WindowExceptionEditor";
import {
  parseRecurrenceExceptions,
  serializeRecurrenceExceptions,
} from "@/utils/planRecurrence";
import { orderedWeekDays } from "@/utils/calendarUtils";
import {
  overlay,
  modal,
  header,
  headerText,
  title,
  subtitle,
  closeBtn,
  columns,
  windowList,
  windowRow,
  dot,
  windowLabel,
  countBadge,
  panel,
  panelHeading,
  empty,
} from "./CategoryExceptionsModal.css";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FALLBACK_COLOR = "#9ca3af";

interface CategoryExceptionsModalProps {
  open: boolean;
  onClose: () => void;
  category: Category;
  onChangeWindowExceptions: (
    windowId: string,
    serialized: string | null,
  ) => void;
}

// Read-and-restore surface for a category's per-occurrence window exceptions:
// windows on the left, the selected window's exceptions on the right. Creating
// exceptions happens on the calendar, so this only offers Restore.
export function CategoryExceptionsModal({
  open,
  onClose,
  category,
  onChangeWindowExceptions,
}: CategoryExceptionsModalProps) {
  const { weekStartDay } = useCalendarProvider();

  const windows = useMemo(() => {
    const rank = new Map<number, number>(
      orderedWeekDays(weekStartDay).map((d, i): [number, number] => [d, i]),
    );
    return [...category.timeSlots].sort(
      (a, b) =>
        (rank.get(a.day) ?? a.day) - (rank.get(b.day) ?? b.day) ||
        a.startTime.localeCompare(b.startTime),
    );
  }, [category.timeSlots, weekStartDay]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Reset to the first window whenever the modal (re)opens or the category
  // changes underneath it.
  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open, category.id]);

  const effectiveSelectedId = selectedId ?? windows[0]?.id ?? null;
  const selectedWindow =
    windows.find((w) => w.id === effectiveSelectedId) ?? null;

  const selectedExceptions = useMemo(
    () =>
      selectedWindow
        ? parseRecurrenceExceptions(selectedWindow.recurrenceExceptions)
        : [],
    [selectedWindow],
  );

  const color = category.color || FALLBACK_COLOR;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content className={modal} aria-describedby={undefined}>
          <div className={header}>
            <div className={headerText}>
              <Dialog.Title className={title}>Window exceptions</Dialog.Title>
              <span className={subtitle}>
                Skip or move individual occurrences of {category.name}&apos;s
                windows, or restore ones you&apos;ve changed.
              </span>
            </div>
            <button
              type="button"
              className={closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className={columns}>
            <div className={windowList}>
              {windows.map((w) => {
                const count = parseRecurrenceExceptions(
                  w.recurrenceExceptions,
                ).length;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={windowRow}
                    data-active={w.id === effectiveSelectedId}
                    onClick={() => setSelectedId(w.id)}
                  >
                    <span className={dot} style={{ background: color }} />
                    <span className={windowLabel}>
                      {DAY_LABELS[w.day]} {w.startTime}–{w.endTime}
                    </span>
                    {count > 0 && <span className={countBadge}>{count}</span>}
                  </button>
                );
              })}
            </div>

            <div className={panel}>
              {selectedWindow ? (
                <>
                  <div className={panelHeading}>
                    <span className={dot} style={{ background: color }} />
                    {DAY_LABELS[selectedWindow.day]} {selectedWindow.startTime}–
                    {selectedWindow.endTime}
                  </div>
                  <WindowExceptionEditor
                    window={selectedWindow}
                    exceptions={selectedExceptions}
                    onChange={(next) =>
                      onChangeWindowExceptions(
                        selectedWindow.id,
                        serializeRecurrenceExceptions(next),
                      )
                    }
                    variant="card"
                  />
                </>
              ) : (
                <div className={empty}>
                  Select a window to manage its exceptions.
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
