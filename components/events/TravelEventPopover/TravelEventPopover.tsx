"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { AlertTriangle, Car, Settings } from "lucide-react";
import { EventImpl } from "@fullcalendar/core/internal";
import type { RootState } from "@/redux/store";
import { Button, FieldStack, FieldValue, TypeBadge } from "@/components/ui";
import { CalendarPopover } from "../CalendarPopover";
import {
  POPOVER_WIDTH,
  popoverBody,
  fullBleedLandscape,
  PopoverHeader,
  PopoverTitleRow,
  PopoverWhen,
  PopoverCallout,
  PopoverFooter,
} from "../popover";
import {
  tone,
  statusNote,
  routeArrow,
  estimateValueRow,
  estimateDelta,
} from "./TravelEventPopover.css";

interface TravelExtendedProps {
  travelMinutes?: number;
  requiredTravelMinutes?: number | null;
  insufficientTravel?: boolean;
  overconstrained?: boolean;
  fromLocationId?: string | null;
  toLocationId?: string | null;
}

interface TravelEventPopoverProps {
  event: EventImpl;
  eventRect: DOMRect;
  startTime: Date;
  endTime: Date;
  onClose: () => void;
}

const POPOVER_HEIGHT = 320;

const TravelEventPopover: React.FC<TravelEventPopoverProps> = ({
  event,
  eventRect,
  startTime,
  endTime,
  onClose,
}) => {
  const router = useRouter();
  const locations = useSelector(
    (state: RootState) => state.schedulingSettings.locations,
  );

  const locationNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const loc of locations) m.set(loc.id, loc.name);
    return m;
  }, [locations]);

  const ext = event.extendedProps as TravelExtendedProps;
  const travelMinutes = ext.travelMinutes;
  const requiredMinutes = ext.requiredTravelMinutes ?? null;
  const insufficient = !!ext.insufficientTravel;
  const overconstrained = !!ext.overconstrained && !insufficient;

  const fromName = ext.fromLocationId
    ? (locationNameMap.get(ext.fromLocationId) ?? "Unknown")
    : "Start";
  const toName = ext.toLocationId
    ? (locationNameMap.get(ext.toLocationId) ?? "Unknown")
    : "End";

  const allottedLabel = travelMinutes != null ? `${travelMinutes}m` : null;
  const requiredLabel = requiredMinutes != null ? `${requiredMinutes}m` : null;

  const openLocationsRoute = () => {
    onClose();
    router.push("/locations");
  };

  const variant: "ok" | "warning" | "error" = insufficient
    ? "error"
    : overconstrained
      ? "warning"
      : "ok";

  return (
    <CalendarPopover
      anchorRect={eventRect}
      width={POPOVER_WIDTH}
      height={POPOVER_HEIGHT}
      title={event.title || "Travel details"}
      onClose={onClose}
    >
      {({ startDrag, isDragging }) => (
        <>
          <PopoverHeader
            onStartDrag={startDrag}
            isDragging={isDragging}
            onClose={onClose}
            badges={
              <>
                <TypeBadge
                  size="sm"
                  tone={
                    variant === "error"
                      ? "error"
                      : variant === "warning"
                        ? "warning"
                        : "type"
                  }
                >
                  {variant === "error"
                    ? "warning"
                    : variant === "warning"
                      ? "overconstrained"
                      : "travel"}
                </TypeBadge>
                {variant !== "ok" && (
                  <span className={`${statusNote} ${tone[variant]}`}>
                    {variant === "error"
                      ? "insufficient travel time"
                      : "travel window exceeded"}
                  </span>
                )}
              </>
            }
          />

          <PopoverTitleRow
            leadingIcon={<Car size={18} strokeWidth={2} aria-hidden />}
            titleAttr={`${fromName} → ${toName}`}
            staticContent={
              <>
                {fromName} <span className={routeArrow}>→</span> {toName}
              </>
            }
          />

          <div className={popoverBody}>
            <PopoverWhen
              start={startTime}
              end={endTime}
              suffix={allottedLabel ? `${allottedLabel} allotted` : undefined}
            />

            {requiredLabel && (
              <FieldStack size="sm" label="Engine estimate">
                <span className={estimateValueRow}>
                  <FieldValue>{requiredLabel}</FieldValue>
                  {allottedLabel &&
                    requiredMinutes != null &&
                    travelMinutes != null && (
                      <span className={`${estimateDelta} ${tone[variant]}`}>
                        {requiredMinutes - travelMinutes > 0
                          ? `${requiredMinutes - travelMinutes}m short`
                          : `${travelMinutes - requiredMinutes}m extra`}
                      </span>
                    )}
                </span>
              </FieldStack>
            )}

            {variant !== "ok" && (
              <PopoverCallout
                tone={variant}
                className={fullBleedLandscape}
                icon={<AlertTriangle size={14} strokeWidth={2.2} />}
              >
                {variant === "error"
                  ? "The engine couldn't fit the full travel time between these events. The route will run short — consider freeing up time on either side, or switch to a faster transport mode in Locations."
                  : "This travel slot is longer than the route's expected duration. The engine reserved the window to keep surrounding events from drifting."}
              </PopoverCallout>
            )}

            <PopoverFooter
              primary={
                <Button variant="glass" size="sm" onClick={openLocationsRoute}>
                  <Settings size={13} strokeWidth={2} />
                  Adjust travel times
                </Button>
              }
            />
          </div>
        </>
      )}
    </CalendarPopover>
  );
};

export default TravelEventPopover;
