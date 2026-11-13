"use client";

import { vars } from "@/components/ui";
import { eventBox, eventTitle, eventTime } from "./EventTile.css";

interface EventTileProps {
  title: string;
  timeText?: string;
  kind: "template" | "window";
  color: string;
  active: boolean;
  assigned?: boolean;
  focused?: boolean;
  selected: boolean;
}

export function EventTile({
  title,
  timeText,
  kind,
  color,
  active,
  assigned,
  focused,
  selected,
}: EventTileProps) {
  const isWindow = kind === "window";
  const bg = isWindow
    ? `repeating-linear-gradient(45deg, transparent 0 6px, ${color} 6px 7.5px), ${
        assigned
          ? `color-mix(in srgb, ${color} 80%, transparent)`
          : `color-mix(in srgb, ${vars.ink} 8%, transparent)`
      }`
    : color;

  return (
    <div
      className={eventBox}
      data-kind={kind}
      data-assigned={assigned ? "true" : "false"}
      data-inactive={active ? "false" : "true"}
      data-selected={selected ? "true" : "false"}
      data-defocused={
        kind === "window" && focused === false ? "true" : "false"
      }
      style={{ background: bg }}
    >
      <div className={eventTitle}>{title}</div>
      {timeText && <div className={eventTime}>{timeText}</div>}
    </div>
  );
}
