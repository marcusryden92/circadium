"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import * as Dialog from "@radix-ui/react-dialog";
import {
  Button,
  ConfirmModal,
  Grain,
  useShellOverlay,
} from "@/components/ui";
import { useShellPortalTarget } from "@/components/ui/shell/ShellPortalContext";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Category, EventTemplate } from "@/types/prisma";
import { rangeAllowed } from "@circadium/shared/calendar-core/edit";
import type { TimeSpan } from "@/components/calendar/timeGrid/timeGridGeometry";

import { TEMPLATE_PALETTE } from "./constants";
import {
  dateToWeekDay,
  durationMinutes,
  endTimeFromDate,
  timeFromDate,
  windowRangeOverlaps,
  type WorkingWindow,
} from "./timeWindow";
import {
  templateToEvent,
  windowToEvent,
  windowRangeToDates,
  startDayAsInt,
  type WeekGridEvent,
} from "./eventSerializers";
import { useWeekStructureState } from "./useWeekStructureState";
import { TemplateEditor } from "./TemplateEditor";
import { WindowEditor } from "./WindowEditor";
import { WeekGrid } from "./WeekGrid";
import { referenceWeekStart } from "./WeekGrid/weekGridModel";

import {
  overlay,
  modal,
  banner,
  editingLabel,
  modeToggle,
  modeToggleThumb,
  modeToggleButton,
  bannerSummary,
  bannerSpacer,
  body,
  gridCol,
  gridHeader,
  gridTitle,
  gridSubtitle,
  dayNav,
  dayNavBtn,
  dayNavLabel,
  calendarWrap,
  rail,
  emptyPanel,
  errorBanner,
  errorBannerMessage,
  errorDismiss,
  cancelButtonStyle,
  a11yHiddenTitle,
  discardConfirmBody,
} from "./WeekStructureModal.css";

type Mode = "templates" | "windows";

interface WeekStructureModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  // When set, opens in windows mode with all other categories' windows
  // visually muted so the focused area's windows stand out.
  focusedCategoryId?: string | null;
}

export function WeekStructureModal({
  open,
  onClose,
  initialMode = "templates",
  focusedCategoryId = null,
}: WeekStructureModalProps) {
  useShellOverlay(open);
  // Portal to the AppShell canvas: the editor covers the sidebar and mobile
  // tabs while clipping to the shell's rounded frame (rendered in place it
  // would only fill mainColumn — absolute inset anchors to the canvas there).
  const portalTarget = useShellPortalTarget();
  const { userId, categories, weekStartDay } = useCalendarProvider();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [selected, setSelected] = useState<{
    kind: Mode;
    id: string;
  } | null>(null);

  const {
    saving,
    error,
    setError,
    tplsWorking,
    setTplsWorking,
    winsWorking,
    setWinsWorking,
    changeCount,
    saveAll,
  } = useWeekStructureState({ open, onClose });

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setSelected(null);
    }
  }, [open, initialMode]);

  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const weekStart = useMemo(
    () => referenceWeekStart(weekStartDay),
    [weekStartDay],
  );

  // Mobile shows one drawable day at a time — seven ~45px columns are too
  // small to read or draw on with a finger. The index is an offset into the
  // reference week, initialized to today's weekday.
  const isMobile = useIsMobile();
  const [mobileDayIdx, setMobileDayIdx] = useState(0);
  useEffect(() => {
    if (open) {
      setMobileDayIdx((new Date().getDay() - weekStartDay + 7) % 7);
    }
  }, [open, weekStartDay]);

  const events = useMemo(() => {
    const out: WeekGridEvent[] = [];
    for (const tpl of tplsWorking) {
      out.push(
        templateToEvent(tpl, weekStart, weekStartDay, mode === "templates"),
      );
    }
    for (const win of winsWorking) {
      const focused =
        focusedCategoryId === null || win.categoryId === focusedCategoryId;
      out.push(
        windowToEvent(
          win,
          weekStart,
          weekStartDay,
          categoryById,
          mode === "windows",
          focused,
        ),
      );
    }
    return out;
  }, [
    tplsWorking,
    winsWorking,
    weekStart,
    weekStartDay,
    categoryById,
    mode,
    focusedCategoryId,
  ]);

  const selectedTemplate = useMemo(
    () =>
      selected?.kind === "templates"
        ? tplsWorking.find((t) => t.id === selected.id) ?? null
        : null,
    [selected, tplsWorking],
  );
  const selectedWindow = useMemo(
    () =>
      selected?.kind === "windows"
        ? winsWorking.find((w) => w.id === selected.id) ?? null
        : null,
    [selected, winsWorking],
  );

  const overlapsWindow = useCallback(
    (start: Date, end: Date, excludeWindowId: string | null) =>
      windowRangeOverlaps(winsWorking, start, end, excludeWindowId),
    [winsWorking],
  );

  // The grid's allow hook already refuses these live (the release reverts);
  // the checks here keep a write from ever trusting the live rejection alone.
  const handleCreate = useCallback(
    ({ start, end }: TimeSpan) => {
      if (!rangeAllowed(start, end)) return;
      if (mode === "windows" && overlapsWindow(start, end, null)) return;
      const startTime = timeFromDate(start);
      const endTime = endTimeFromDate(end);
      const day = dateToWeekDay(start);

      if (mode === "templates") {
        const id = `tmp-${uuidv4()}`;
        const dur = durationMinutes(start, end);
        const now = new Date().toISOString();
        const newTpl = {
          id,
          userId: userId || "",
          title: "New block",
          startDay: day,
          startTime,
          duration: dur,
          color:
            TEMPLATE_PALETTE[tplsWorking.length % TEMPLATE_PALETTE.length],
          locationId: null,
          recurrenceExceptions: null,
          createdAt: now,
          updatedAt: now,
        } as unknown as EventTemplate;
        setTplsWorking((prev) => [...prev, newTpl]);
        setSelected({ kind: "templates", id });
      } else {
        const id = `tmp-${uuidv4()}`;
        const newWin: WorkingWindow = {
          id,
          day,
          startTime,
          endTime,
          categoryId: null,
          recurrenceExceptions: null,
        };
        setWinsWorking((prev) => [...prev, newWin]);
        setSelected({ kind: "windows", id });
      }
    },
    [mode, userId, tplsWorking.length, setTplsWorking, setWinsWorking, overlapsWindow],
  );

  // A move or resize from the grid. The span is the block's new absolute
  // range in the reference week (possibly a week to either side, after a
  // drag across the ring's edge); only its weekday and times are kept, and
  // the weekday is the same on every copy of the week.
  const handleEdit = useCallback(
    (block: WeekGridEvent, { start, end }: TimeSpan) => {
      if (!rangeAllowed(start, end)) return;
      const newStartTime = timeFromDate(start);
      const newEndTime = endTimeFromDate(end);
      const newDay = dateToWeekDay(start);

      if (block.gridKind === "template") {
        const dur = durationMinutes(start, end);
        setTplsWorking((prev) =>
          prev.map((t) =>
            t.id === block.sourceId
              ? ({
                  ...t,
                  startDay: newDay,
                  startTime: newStartTime,
                  duration: dur,
                  // A series re-anchor (a move, or a start-edge resize)
                  // invalidates per-occurrence exceptions — their keys point
                  // at the old weekly pattern (stale exdates resurrect deleted
                  // occurrences, moved one-offs go ghost). An end-edge resize
                  // keeps them.
                  recurrenceExceptions:
                    newDay !== startDayAsInt(t) || newStartTime !== t.startTime
                      ? null
                      : t.recurrenceExceptions,
                  updatedAt: new Date().toISOString(),
                })
              : t,
          ),
        );
        return;
      }
      if (overlapsWindow(start, end, block.sourceId)) return;
      setWinsWorking((prev) =>
        prev.map((w) =>
          w.id === block.sourceId
            ? {
                ...w,
                day: newDay,
                startTime: newStartTime,
                endTime: newEndTime,
                // Same re-anchor rule as templates above.
                recurrenceExceptions:
                  newDay !== w.day || newStartTime !== w.startTime
                    ? null
                    : w.recurrenceExceptions,
              }
            : w,
        ),
      );
    },
    [setTplsWorking, setWinsWorking, overlapsWindow],
  );

  const handleSelectBlock = useCallback(
    (kind: "template" | "window", id: string) => {
      setSelected({ kind: kind === "template" ? "templates" : "windows", id });
    },
    [],
  );

  const updateTemplate = (id: string, patch: Partial<EventTemplate>) => {
    setTplsWorking((prev) =>
      prev.map((t) =>
        t.id === id
          ? ({ ...t, ...patch, updatedAt: new Date().toISOString() })
          : t,
      ),
    );
  };

  const updateWindow = (id: string, patch: Partial<WorkingWindow>) => {
    setWinsWorking((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  };

  const updateWindowTimes = (
    id: string,
    startTimeRaw: string,
    endTimeRaw: string,
  ) => {
    const win = winsWorking.find((w) => w.id === id);
    if (!win) return;
    // A midnight end is stored as the "23:59" end-of-day sentinel
    // (endTimeFromDate precedent); equal bounds are zero-length, not 24h.
    const endTime = endTimeRaw === "00:00" ? "23:59" : endTimeRaw;
    if (startTimeRaw === endTime) return;
    if (startTimeRaw === win.startTime && endTime === win.endTime) return;
    const [start, end] = windowRangeToDates(
      win.day,
      startTimeRaw,
      endTime,
      weekStart,
      weekStartDay,
    );
    if (!rangeAllowed(start, end)) return;
    if (overlapsWindow(start, end, id)) {
      setError("Those times would overlap another window.");
      return;
    }
    updateWindow(id, {
      startTime: startTimeRaw,
      endTime,
      // A start re-anchor invalidates per-occurrence exception keys — same
      // rule as a grid drag; end-only changes preserve them.
      recurrenceExceptions:
        startTimeRaw !== win.startTime ? null : win.recurrenceExceptions,
    });
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.kind === "templates") {
      setTplsWorking((prev) => prev.filter((t) => t.id !== selected.id));
    } else {
      setWinsWorking((prev) => prev.filter((w) => w.id !== selected.id));
    }
    setSelected(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    if (selected.kind === "templates") {
      const src = tplsWorking.find((t) => t.id === selected.id);
      if (!src) return;
      const id = `tmp-${uuidv4()}`;
      const now = new Date().toISOString();
      const copy = { ...src, id, createdAt: now, updatedAt: now } as EventTemplate;
      setTplsWorking((prev) => [...prev, copy]);
      setSelected({ kind: "templates", id });
    } else {
      const src = winsWorking.find((w) => w.id === selected.id);
      if (!src) return;
      const id = `tmp-${uuidv4()}`;
      // Exceptions reference specific occurrences of the source rule.
      setWinsWorking((prev) => [
        ...prev,
        { ...src, id, recurrenceExceptions: null },
      ]);
      setSelected({ kind: "windows", id });
    }
  };

  const cancel = () => {
    if (changeCount > 0) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const tplCount = tplsWorking.length;
  const winCount = winsWorking.length;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <Dialog.Portal container={portalTarget ?? undefined}>
      <Dialog.Overlay className={overlay} />
      <Dialog.Content
        className={modal}
        aria-describedby={undefined}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Dialog.Title className={a11yHiddenTitle}>Week Structure</Dialog.Title>
        <Grain />
        <div className={banner}>
          <span className={editingLabel}>editing</span>
          <div className={modeToggle}>
            <span
              className={modeToggleThumb}
              data-position={mode === "templates" ? "0" : "1"}
              aria-hidden="true"
            />
            <button
              type="button"
              className={modeToggleButton}
              data-active={mode === "templates"}
              onClick={() => {
                setMode("templates");
                setSelected(null);
              }}
            >
              Templates
            </button>
            <button
              type="button"
              className={modeToggleButton}
              data-active={mode === "windows"}
              onClick={() => {
                setMode("windows");
                setSelected(null);
              }}
            >
              Categories
            </button>
          </div>
          <span className={bannerSummary}>
            {mode === "templates"
              ? `${tplCount} template${tplCount === 1 ? "" : "s"}`
              : `${winCount} window${winCount === 1 ? "" : "s"}`}
          </span>
          <span className={bannerSpacer} />
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            disabled={saving}
            className={cancelButtonStyle}
          >
            {changeCount === 0 ? "Back" : "Cancel"}
          </Button>
          <Button
            variant="solidLight"
            size="sm"
            onClick={saveAll}
            disabled={saving || changeCount === 0}
          >
            {saving
              ? "Saving…"
              : changeCount === 0
                ? "Save"
                : `Save · ${changeCount} change${changeCount === 1 ? "" : "s"}`}
          </Button>
        </div>

        {error && (
          <div className={errorBanner}>
            <span className={errorBannerMessage}>{error}</span>
            <button
              type="button"
              className={errorDismiss}
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        <div className={body}>
          <div className={gridCol}>
            <div className={gridHeader}>
              <h2 className={gridTitle}>Your typical week</h2>
              <span className={gridSubtitle}>
                drag on the grid to draw new · click a block to edit
              </span>
              <span className={dayNav}>
                <button
                  type="button"
                  className={dayNavBtn}
                  onClick={() => setMobileDayIdx((i) => (i + 6) % 7)}
                  aria-label="Previous day"
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                </button>
                <span className={dayNavLabel}>
                  {format(addDays(weekStart, mobileDayIdx), "EEEE")}
                </span>
                <button
                  type="button"
                  className={dayNavBtn}
                  onClick={() => setMobileDayIdx((i) => (i + 1) % 7)}
                  aria-label="Next day"
                >
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </span>
            </div>

            <div className={calendarWrap}>
              <WeekGrid
                weekStartDay={weekStartDay}
                mode={mode}
                events={events}
                windows={winsWorking}
                selected={
                  selected
                    ? {
                        kind: selected.kind === "templates" ? "template" : "window",
                        id: selected.id,
                      }
                    : null
                }
                dayIndex={isMobile ? mobileDayIdx : null}
                isMobile={isMobile}
                onSelect={handleSelectBlock}
                onCreate={handleCreate}
                onEdit={handleEdit}
              />
            </div>
          </div>

          <div className={rail}>
            {selectedTemplate ? (
              <TemplateEditor
                template={selectedTemplate}
                onUpdate={(patch) => updateTemplate(selectedTemplate.id, patch)}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            ) : selectedWindow ? (
              <WindowEditor
                window={selectedWindow}
                categories={categories}
                onUpdate={(patch) => updateWindow(selectedWindow.id, patch)}
                onUpdateTimes={(startTime, endTime) =>
                  updateWindowTimes(selectedWindow.id, startTime, endTime)
                }
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            ) : (
              <div className={emptyPanel}>
                Click any {mode === "templates" ? "template" : "window"} block
                to edit it, or drag on the grid to draw a new one.
              </div>
            )}
          </div>
        </div>

        <ConfirmModal
          open={showDiscardConfirm}
          title="Discard unsaved changes?"
          body={
            <p className={discardConfirmBody}>
              You have {changeCount} unsaved change
              {changeCount === 1 ? "" : "s"}. Closing now will lose them.
            </p>
          }
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          tone="danger"
          onCancel={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onClose();
          }}
        />
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
