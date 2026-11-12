"use client";

import { MapPin } from "lucide-react";
import { useMemo } from "react";
import { Caption, Combobox, Switch } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import {
  root,
  overrideRow,
  overrideLabel,
  comboWrap,
  optionLabel,
  valueWrap,
  valueIcon,
  valueText,
} from "./PopoverLocationPicker.css";

interface Props {
  value: string | null;
  onChange: (locationId: string | null) => void;
  /** True when the user has chosen to override the inherited location. */
  isOverridden?: boolean;
  /** Toggle handler; when omitted, override controls are hidden entirely. */
  onToggleOverride?: () => void;
  inheritedLocationName?: string;
  inheritedFromLabel?: string;
}

// Fixed dropdown width so swapping between short and long location names
// doesn't shift the surrounding popover layout.
const DROPDOWN_WIDTH = 200;

export function PopoverLocationPicker({
  value,
  onChange,
  isOverridden,
  onToggleOverride,
  inheritedLocationName,
  inheritedFromLabel,
}: Props) {
  const { locations } = useCalendarProvider();

  const hasOverrideControls = !!onToggleOverride;
  const isInheriting = hasOverrideControls && !isOverridden;

  const options = useMemo(
    () => [
      { value: null, label: <Caption>Anywhere</Caption> },
      ...locations.map((l) => ({
        value: l.id,
        label: (
          <span className={optionLabel}>
            <MapPin size={12} strokeWidth={2} />
            <span>{l.name}</span>
          </span>
        ),
      })),
    ],
    [locations],
  );

  const currentLocation = locations.find((l) => l.id === value);
  const displayName = isInheriting
    ? (inheritedLocationName ?? "Anywhere")
    : (currentLocation?.name ?? "Anywhere");

  return (
    <div className={root}>
      {hasOverrideControls && (
        <div className={overrideRow}>
          <Switch
            checked={!!isOverridden}
            onCheckedChange={() => onToggleOverride?.()}
            aria-label="Override inherited location"
          />
          <span
            className={overrideLabel[isOverridden ? "custom" : "inherited"]}
          >
            {isOverridden
              ? "Custom location"
              : `Inherited${inheritedFromLabel ? ` from ${inheritedFromLabel}` : ""}`}
          </span>
        </div>
      )}
      <div
        className={comboWrap[isInheriting ? "inheriting" : "enabled"]}
        aria-disabled={isInheriting || undefined}
      >
        <Combobox<string | null>
          value={isInheriting ? null : value}
          options={options}
          onChange={(v) => onChange(v)}
          width={DROPDOWN_WIDTH}
          renderValue={() => (
            <span className={valueWrap} title={displayName}>
              <MapPin size={12} strokeWidth={2} className={valueIcon} />
              <span className={valueText}>{displayName}</span>
            </span>
          )}
          ariaLabel="Location"
        />
      </div>
    </div>
  );
}

