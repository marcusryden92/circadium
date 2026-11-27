import React, { useRef, useState, useLayoutEffect, useMemo } from "react";
import type { TileEvent } from "@/utils/calendar-rendering/tileEvent";
import { AlertTriangle, Car } from "lucide-react";
// TODO: replace `Car` with a per-event mode icon (Car/Bike/Bus/Walk) once
// TravelTime's transportMode is plumbed through to the calendar event's
// extendedProps. The TravelTime record carries DRIVING/TRANSIT/BICYCLING/
// WALKING but the engine only emits a duration today.
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatTime } from "@/utils/calendarUtils";
import { handleDoubleClick } from "@/utils/calendarEventHandlers";
import { getEventTier } from "@/utils/eventTier";
import TravelEventPopover from "../TravelEventPopover";
import {
  tile,
  tilePadding,
  tileInner,
  titleText,
  titleItalic,
  alertIcon,
  modeIcon,
  labelText,
  minutes,
  timeRow,
  timeDash,
} from "./TravelEventContent.css";

interface TravelExtendedProps {
  travelMinutes?: number;
  requiredTravelMinutes?: number | null;
  insufficientTravel?: boolean;
  overconstrained?: boolean;
  fromLocationId?: string | null;
  toLocationId?: string | null;
}

interface TravelEventContentProps {
  event: TileEvent;
}

const TravelEventContent: React.FC<TravelEventContentProps> = ({ event }) => {
  const { locations } = useCalendarProvider();
  const isMobile = useIsMobile();
  const elementRef = useRef<HTMLDivElement>(null);
  const [elementHeight, setElementHeight] = useState<number>(0);
  const [elementWidth, setElementWidth] = useState<number>(0);
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [eventRect, setEventRect] = useState<DOMRect | null>(null);

  const locationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.name);
    }
    return map;
  }, [locations]);

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
  const extendedProps = event.extendedProps as TravelExtendedProps;
  const travelMinutes = extendedProps?.travelMinutes;
  const requiredTravelMinutes = extendedProps?.requiredTravelMinutes;
  const insufficientTravel = extendedProps?.insufficientTravel ?? false;
  const overconstrained = extendedProps?.overconstrained ?? false;
  const showAlert = insufficientTravel;
  const showOverconstrained = overconstrained && !insufficientTravel;
  const fromName = extendedProps?.fromLocationId
    ? (locationNameMap.get(extendedProps.fromLocationId) ??
      extendedProps.fromLocationId)
    : null;
  const toName = extendedProps?.toLocationId
    ? (locationNameMap.get(extendedProps.toLocationId) ??
      extendedProps.toLocationId)
    : null;
  const travelLabel = fromName && toName ? `${fromName} → ${toName}` : "Travel";

  const tier = getEventTier(elementHeight);
  const showLabel = tier !== "tiny";
  // Time renders below the label, not next to it. Needs a second-line worth
  // of vertical room PLUS bottom padding so it doesn't kiss the tile edge.
  // ~48 covers: 6px top + ~16 title + 2 gap + ~14 time + 6 bottom + ~4 breath.
  const showTime = tier === "regular" && elementHeight >= 48 && elementWidth >= 70;
  const showMinutes = tier === "regular" && elementWidth >= 110;
  const showsAlertTone = showAlert || showOverconstrained;
  const tileState = showAlert
    ? ("error" as const)
    : showOverconstrained
      ? ("warning" as const)
      : ("plain" as const);
  const titleSize = tier === "compact" ? ("compact" as const) : ("regular" as const);

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
      // Read by the calendar's cursor hit-test (page.tsx); a travel tile wins
      // the header chip over any category window it is painted on top of.
      data-hover-travel=""
      data-hover-name={travelLabel}
      className={`${tile[tileState]} ${tilePadding[tier]}`}
    >
      <div className={tileInner}>
        {showLabel && (
        <span
          className={`${titleText[titleSize]}${showsAlertTone ? "" : ` ${titleItalic}`}`}
        >
          {showsAlertTone ? (
            <AlertTriangle
              size={12}
              strokeWidth={2.2}
              className={alertIcon}
              aria-hidden
            />
          ) : (
            <Car
              size={12}
              strokeWidth={2}
              className={modeIcon}
              aria-hidden
            />
          )}
          <span className={labelText}>
            {travelLabel}
          </span>
          {travelMinutes !== undefined && showMinutes && (
            <span className={minutes}>
              {travelMinutes}m
              {showAlert &&
                requiredTravelMinutes !== null &&
                requiredTravelMinutes !== undefined && (
                  <> /{requiredTravelMinutes}</>
                )}
              {showOverconstrained &&
                requiredTravelMinutes !== null &&
                requiredTravelMinutes !== undefined && (
                  <> /{requiredTravelMinutes}</>
                )}
            </span>
          )}
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
        <TravelEventPopover
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

export default TravelEventContent;
