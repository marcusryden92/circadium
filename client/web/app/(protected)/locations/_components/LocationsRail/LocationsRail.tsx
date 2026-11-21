"use client";

import { useMemo } from "react";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { SerializedLocation } from "@/redux/slices/schedulingSettingsSlice";
import { MAX_LOCATIONS } from "../../_constants";
import {
  rail,
  railHead,
  railBody,
  railEmpty,
  railRow,
  railRowPin,
  railRowMeta,
  railRowName,
  railRowAddress,
  railRowTags,
  railRowTag,
  railRowTagDot,
  railFooter,
  railNote,
  railNewButton,
} from "./LocationsRail.css";

interface LocationsRailProps {
  locations: SerializedLocation[];
  onEditLocation: (location: SerializedLocation) => void;
  onAddLocation: () => void;
}

export function LocationsRail({
  locations,
  onEditLocation,
  onAddLocation,
}: LocationsRailProps) {
  const { categories } = useCalendarProvider();

  const categoryDefaultsByLocation = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }[]>();
    for (const category of categories) {
      if (!category.locationId) continue;
      const list = map.get(category.locationId) ?? [];
      list.push({ name: category.name, color: category.color });
      map.set(category.locationId, list);
    }
    return map;
  }, [categories]);

  return (
    <aside className={rail}>
      <div className={railHead}>Locations</div>
      <div className={railBody}>
        {locations.length === 0 ? (
          <div className={railEmpty}>
            No locations yet — add one to get started.
          </div>
        ) : (
          locations.map((loc) => {
            const tags = categoryDefaultsByLocation.get(loc.id) ?? [];
            return (
              <button
                key={loc.id}
                type="button"
                className={railRow}
                onClick={() => onEditLocation(loc)}
                aria-label={`Edit ${loc.name}`}
              >
                <span className={railRowPin}>
                  <MapPin size={13} strokeWidth={2.2} />
                </span>
                <span className={railRowMeta}>
                  <span className={railRowName}>{loc.name}</span>
                  <span className={railRowAddress}>
                    {loc.address || loc.placeId}
                  </span>
                  {tags.length > 0 && (
                    <span className={railRowTags}>
                      {tags.map((t) => (
                        <span key={t.name} className={railRowTag}>
                          {t.color && (
                            <span
                              className={railRowTagDot}
                              style={{ background: t.color }}
                            />
                          )}
                          {t.name}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className={railFooter}>
        <Button
          variant="ghost"
          size="sm"
          className={railNewButton}
          onClick={onAddLocation}
          disabled={locations.length >= MAX_LOCATIONS}
        >
          <Plus size={13} strokeWidth={2.4} />
          {locations.length >= MAX_LOCATIONS
            ? `Max ${MAX_LOCATIONS} reached`
            : "Add location"}
        </Button>
        <span className={railNote}>
          Up to {MAX_LOCATIONS} locations · deleting cascades to travel times
        </span>
      </div>
    </aside>
  );
}
