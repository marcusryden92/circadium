import React, { useRef, useState, useLayoutEffect } from "react";
import { EventImpl } from "@fullcalendar/core/internal";
import { CalendarClock } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatTime } from "@/utils/calendarUtils";
import { handleDoubleClick } from "@/utils/calendarEventHandlers";
import { getEventTier } from "@/utils/eventTier";
import { borderWidth } from "@/lib/theme/scales";
import { vars } from "@/lib/theme";
import { colorMixAlpha } from "@/lib/theme/effects";
import type { RuntimeEventExtendedProps } from "@/types/ui";
import ExternalEventPopover from "../ExternalEventPopover";
import {
  tile,
  tilePadding,
  tileInner,
  titleText,
  titleVisualOnly,
  sourceIcon,
  labelText,
  timeRow,
  timeDash,
} from "./ExternalEventContent.css";

interface ExternalEventContentProps {
  event: EventImpl;
}

const ExternalEventContent: React.FC<ExternalEventContentProps> = ({
  event,
}) => {
  const isMobile = useIsMobile();
  const elementRef = useRef<HTMLDivElement>(null);
  const [elementHeight, setElementHeight] = useState<number>(0);
  const [elementWidth, setElementWidth] = useState<number>(0);
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [eventRect, setEventRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element) {
      setElementHeight(element.offsetHeight);
      setElementWidth(element.offsetWidth);
    }
  }, []);

  if (!event.start || !event.end) return null;

  const startTime = new Date(event.start);
  const endTime = new Date(event.end);
  const ext = event.extendedProps as RuntimeEventExtendedProps;
  const busy = !!ext.externalBusy;
  const accent = ext.externalAccent ?? vars.muted;
  // The global calendar CSS forces .fc-event backgrounds transparent, so the
  // tile paints its own fill — an opaque pastel of the source accent over
  // paper, stronger when the event blocks scheduling.
  const fill = `color-mix(in srgb, ${accent} ${
    busy ? colorMixAlpha.selectedFill : colorMixAlpha.lightFill
  }%, ${vars.paper})`;

  const tier = getEventTier(elementHeight);
  const showLabel = tier !== "tiny";
  const showTime =
    tier === "regular" && elementHeight >= 48 && elementWidth >= 70;
  const titleSize =
    tier === "compact" ? ("compact" as const) : ("regular" as const);

  return (
    <div
      ref={elementRef}
      onClick={(e) => {
        if (!isMobile) return;
        if (!elementRef.current?.contains(e.target as Node)) return;
        handleDoubleClick(e, elementRef, setEventRect, setShowPopover);
      }}
      onDoubleClick={(e) =>
        handleDoubleClick(e, elementRef, setEventRect, setShowPopover)
      }
      className={`${tile[busy ? "busy" : "visual"]} ${tilePadding[tier]}`}
      style={{
        background: fill,
        borderLeft: `${borderWidth.thick}px solid ${accent}`,
      }}
    >
      <div className={tileInner}>
        {showLabel && (
          <span
            className={`${titleText[titleSize]}${busy ? "" : ` ${titleVisualOnly}`}`}
          >
            <CalendarClock
              size={12}
              strokeWidth={2}
              className={sourceIcon}
              aria-hidden
            />
            <span className={labelText}>{event.title}</span>
          </span>
        )}
        {showTime && (
          <span className={timeRow}>
            <span>{formatTime(startTime)}</span>
            <span aria-hidden className={timeDash}>
              –
            </span>
            <span>{formatTime(endTime)}</span>
          </span>
        )}
      </div>

      {showPopover && eventRect && (
        <ExternalEventPopover
          event={event}
          eventRect={eventRect}
          startTime={startTime}
          endTime={endTime}
          onClose={() => setShowPopover(false)}
        />
      )}
    </div>
  );
};

export default ExternalEventContent;
