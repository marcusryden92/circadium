"use client";

import { space } from "@/lib/theme";
import { useMemo } from "react";
import { MapPin, RotateCcw } from "lucide-react";
import {
  Button,
  Caption,
  Combobox,
  FieldStack,
  SegmentedControl,
} from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useItem } from "../../ItemContext";
import {
  placeRow,
  hintRow,
  inheritedHint,
  flushLeftBtn,
} from "./LocationSection.css";

type OverrideKey = "inherited" | "override";

export function LocationSection() {
  const {
    item,
    category,
    locationOverrideEnabled,
    categoryHasLocation,
    changeLocation,
    toggleLocationOverride,
    requestResetSubgoalLocations,
  } = useItem();

  const { locations } = useCalendarProvider();

  const isGoal = item.plannerType === "goal";

  const locationOptions = useMemo(
    () => [
      { value: null, label: <Caption>Anywhere</Caption> },
      ...locations.map((l) => ({
        value: l.id,
        label: (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: space["2"],
            }}
          >
            <MapPin size={12} strokeWidth={2} />
            <span>{l.name}</span>
          </span>
        ),
      })),
    ],
    [locations],
  );

  const currentLocation = locations.find((l) => l.id === item.locationId);

  const dropdownDisabled = categoryHasLocation && !locationOverrideEnabled;

  return (
    <FieldStack label="Location" full>
      <div className={placeRow}>
        {categoryHasLocation && (
          <div>
            <SegmentedControl<OverrideKey>
              value={locationOverrideEnabled ? "override" : "inherited"}
              onChange={(next) => {
                const nextEnabled = next === "override";
                if (nextEnabled !== locationOverrideEnabled) {
                  toggleLocationOverride();
                }
              }}
              options={[
                { key: "inherited", label: "Inherited" },
                { key: "override", label: "Override" },
              ]}
            />
            {categoryHasLocation && (
              <div className={hintRow}>
                <span
                  className={inheritedHint}
                  style={{
                    visibility: locationOverrideEnabled ? "hidden" : "visible",
                  }}
                >
                  from {category?.name}
                </span>
              </div>
            )}
          </div>
        )}
        <Combobox
          value={item.locationId ?? null}
          options={locationOptions}
          onChange={(v) => changeLocation(v)}
          disabled={dropdownDisabled}
          maxWidth={280}
          renderValue={(opt) => {
            if (currentLocation) {
              return (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: space["1.5"],
                  }}
                >
                  <MapPin size={12} strokeWidth={2} />
                  {currentLocation.name}
                </span>
              );
            }
            if (opt) return opt.label;
            return <Caption>Anywhere</Caption>;
          }}
          ariaLabel="Location"
        />
        <div
          style={{
            marginTop: space["0.5"],
            visibility: isGoal ? "visible" : "hidden",
          }}
          aria-hidden={!isGoal}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={requestResetSubgoalLocations}
            disabled={!isGoal}
            className={flushLeftBtn}
          >
            <span>
              <RotateCcw
                size={11}
                strokeWidth={2.2}
                style={{ marginRight: space["1"] }}
              />
              {" Reset sub-goal places"}{" "}
            </span>
          </Button>
        </div>
      </div>
    </FieldStack>
  );
}
