"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { CalendarClock, RefreshCw, Settings } from "lucide-react";
import { EventImpl } from "@fullcalendar/core/internal";
import type { AppDispatch } from "@/redux/store";
import {
  applyExternalRefresh,
  upsertExternalSource,
} from "@/redux/slices/externalCalendarSlice";
import {
  refreshExternalCalendarSource,
  toggleExternalEventBusyException,
  updateExternalCalendarSource,
} from "@/actions/externalCalendars";
import { toggleModeException } from "@/utils/external-calendar/modeExceptions";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { RuntimeEventExtendedProps } from "@/types/ui";
import { Button, TypeBadge } from "@/components/ui";
import { CalendarPopover } from "../CalendarPopover";
import { PopoverColorPicker } from "../PopoverColorPicker";
import {
  POPOVER_WIDTH,
  popoverBody,
  fullBleedLandscape,
  PopoverHeader,
  PopoverTitleRow,
  PopoverWhen,
  PopoverNote,
  PopoverToggleField,
  PopoverFooter,
} from "../popover";

interface ExternalEventPopoverProps {
  event: EventImpl;
  eventRect: DOMRect;
  startTime: Date;
  endTime: Date;
  onClose: () => void;
}

const POPOVER_HEIGHT = 300;
const FALLBACK_ACCENT = "#8b8b8b";

const ExternalEventPopover: React.FC<ExternalEventPopoverProps> = ({
  event,
  eventRect,
  startTime,
  endTime,
  onClose,
}) => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { updateAll, externalSources } = useCalendarProvider();
  const [refreshing, setRefreshing] = useState(false);

  const ext = event.extendedProps as RuntimeEventExtendedProps;
  const sourceId = ext.externalSourceId;
  const uid = ext.externalUid;
  const busy = !!ext.externalBusy;
  const allDay = !!ext.externalAllDay;
  const source = externalSources.find((s) => s.id === sourceId);
  const sourceName =
    source?.name ?? ext.externalSourceName ?? "Imported calendar";

  // Optimistic like the settings row: the source recolors in Redux
  // immediately (color is render-only, no regen), the server write settles
  // in the background and rolls back on failure.
  const onChangeColor = (color: string) => {
    if (!source) return;
    dispatch(upsertExternalSource({ ...source, color }));
    void updateExternalCalendarSource(source.id, { color }).then((result) => {
      dispatch(upsertExternalSource(result.success ? result.source : source));
    });
  };

  // Optimistic: the exception flips in Redux immediately (tile + engine regen
  // follow from state), the server write settles in the background and rolls
  // back on failure.
  const onToggleBusy = () => {
    if (!source || !uid) return;
    dispatch(
      upsertExternalSource({
        ...source,
        modeExceptions: toggleModeException(source.modeExceptions, uid),
      }),
    );
    updateAll();
    void toggleExternalEventBusyException(source.id, uid).then((result) => {
      if (result.success) {
        dispatch(upsertExternalSource(result.source));
      } else {
        dispatch(upsertExternalSource(source));
        updateAll();
      }
    });
  };

  const onRefreshSource = async () => {
    if (!source || refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshExternalCalendarSource(source.id);
      if (result.success) {
        dispatch(
          applyExternalRefresh({
            source: result.source,
            events: result.events,
          }),
        );
        updateAll();
      } else if (result.source) {
        dispatch(upsertExternalSource(result.source));
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <CalendarPopover
      anchorRect={eventRect}
      width={POPOVER_WIDTH}
      height={POPOVER_HEIGHT}
      title={event.title || "Imported event"}
      onClose={onClose}
    >
      {({ startDrag, isDragging }) => (
        <>
          <PopoverHeader
            onStartDrag={startDrag}
            isDragging={isDragging}
            onClose={onClose}
            badges={
              <TypeBadge size="sm" tone="type">
                imported
              </TypeBadge>
            }
          />

          <PopoverTitleRow
            titleAttr={event.title}
            staticContent={event.title || "Imported event"}
            trailing={
              source ? (
                <PopoverColorPicker
                  currentColor={source.color ?? FALLBACK_ACCENT}
                  onChange={onChangeColor}
                />
              ) : undefined
            }
          />

          <div className={popoverBody}>
            <PopoverWhen start={startTime} end={endTime} />

            <PopoverNote
              className={fullBleedLandscape}
              icon={<CalendarClock size={13} strokeWidth={2} aria-hidden />}
            >
              From {sourceName}. Edits happen in the source calendar.
            </PopoverNote>

            {allDay ? (
              <PopoverNote className={fullBleedLandscape}>
                All-day events never block scheduling.
              </PopoverNote>
            ) : (
              <PopoverToggleField
                className={fullBleedLandscape}
                title="Blocks scheduling"
                hint={
                  busy
                    ? "The engine keeps this time free."
                    : "Shown on the calendar only — the engine may schedule over it."
                }
                checked={busy}
                onCheckedChange={onToggleBusy}
                ariaLabel="Blocks scheduling"
              />
            )}

            <PopoverFooter
              utility={
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => {
                    onClose();
                    router.push("/settings");
                  }}
                >
                  <Settings size={13} strokeWidth={2} />
                  Calendar settings
                </Button>
              }
              primary={
                source ? (
                  <Button
                    variant="glass"
                    size="sm"
                    disabled={refreshing}
                    onClick={() => void onRefreshSource()}
                  >
                    <RefreshCw size={13} strokeWidth={2} />
                    {refreshing ? "Refreshing…" : "Refresh calendar"}
                  </Button>
                ) : undefined
              }
            />
          </div>
        </>
      )}
    </CalendarPopover>
  );
};

export default ExternalEventPopover;
