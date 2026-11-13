"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, FieldStack, ResponsiveSegmentedControl } from "@/components/ui";
import { useCalendarProvider } from "@/context/CalendarProvider";
import * as locationActions from "@/actions/locations";
import { serializeLocation, serializeTravelTime } from "@/utils/locations";
import {
  upsertLocation,
  setDefaultTransportMode,
  setAllTravelTimes,
  type SerializedLocation,
} from "@/redux/slices/schedulingSettingsSlice";
import type { TransportMode } from "@/generated/client";
import type { RootState } from "@/redux/store";
import { TRANSPORT_MODE_OPTIONS } from "../../locations/_constants";
import { StepFrame } from "../_components/StepFrame";
import { LocationRows, type LocationRow } from "../_components/LocationRows";
import {
  fieldHelp,
  footerActions,
  errorText,
} from "../onboarding.css";

type LocationsStepProps = {
  stepIndex: number;
  totalSteps: number;
  rows: LocationRow[];
  onRowsChange: (rows: LocationRow[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  continueDisabled?: boolean;
};

function upsertIntoList(
  list: SerializedLocation[],
  row: SerializedLocation,
): SerializedLocation[] {
  const idx = list.findIndex((l) => l.id === row.id);
  if (idx === -1) return [...list, row];
  const next = [...list];
  next[idx] = row;
  return next;
}

// A row the user started but that can't be created yet: an address typed or
// picked without both a name and a selected suggestion. Continuing would
// silently drop it, so these block with a message instead.
function isIncomplete(row: LocationRow): boolean {
  if (row.createdId) return false;
  const hasInput = row.query.trim().length > 0 || row.selected !== null;
  const isCreatable = row.name.trim().length > 0 && row.selected !== null;
  return hasInput && !isCreatable;
}

// How to refer to an incomplete row in the error: its name if typed, else the
// address it does have, so a name-less row still points the user at the offender
// instead of the generic fallback.
function incompleteLabel(row: LocationRow): string {
  const name = row.name.trim();
  if (name.length > 0) return name;
  const address = (row.selected?.description ?? row.query).trim();
  return address.length > 40 ? `${address.slice(0, 40)}…` : address;
}

export function LocationsStep({
  stepIndex,
  totalSteps,
  rows,
  onRowsChange,
  onBack,
  onContinue,
  onSkip,
  continueDisabled = false,
}: LocationsStepProps) {
  const dispatch = useDispatch();
  const { locations, markSynced } = useCalendarProvider();
  const transportMode = useSelector(
    (state: RootState) => state.schedulingSettings.defaultTransportMode,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTransportChange = (mode: TransportMode) => {
    dispatch(setDefaultTransportMode(mode));
    void locationActions.updateDefaultTransportMode(mode).catch(() => {});
  };

  const warmTravelTimes = (currentLocations: SerializedLocation[]) => {
    if (currentLocations.length < 2) return;
    void (async () => {
      try {
        await locationActions.fetchMissingTravelTimes(transportMode);
        const fresh = await locationActions.fetchTravelTimes();
        const serialized = fresh.map(serializeTravelTime);
        dispatch(setAllTravelTimes(serialized));
        markSynced("travelTimes", serialized);
      } catch {
        // Best-effort; the engine falls back to zero travel.
      }
    })();
  };

  const handleContinue = async () => {
    const incomplete = rows.filter(isIncomplete);
    if (incomplete.length > 0) {
      const labels = incomplete
        .map(incompleteLabel)
        .filter((l) => l.length > 0);
      setError(
        labels.length > 0
          ? `${labels.join(", ")} ${labels.length === 1 ? "needs" : "need"} both a name and an address picked from the suggestions — finish or clear the row to continue.`
          : "A location needs both a name and an address picked from the suggestions — finish or clear the row to continue.",
      );
      return;
    }

    const toCreate = rows.filter(
      (r) => r.selected && !r.createdId && r.name.trim().length > 0,
    );
    if (toCreate.length === 0) {
      warmTravelTimes(locations);
      onContinue();
      return;
    }

    setBusy(true);
    setError(null);
    let currentLocations = locations;
    let nextRows = [...rows];
    try {
      for (const row of toCreate) {
        const created = await locationActions.createLocation({
          name: row.name.trim(),
          placeId: row.selected!.placeId,
          sessionToken: row.sessionToken ?? undefined,
        });
        const serialized = serializeLocation(created);
        dispatch(upsertLocation(serialized));
        currentLocations = upsertIntoList(currentLocations, serialized);
        markSynced("locations", currentLocations);
        const idx = nextRows.findIndex((r) => r.key === row.key);
        if (idx !== -1) {
          nextRows = nextRows.map((r, i) =>
            i === idx ? { ...r, createdId: serialized.id } : r,
          );
        }
        // Persist the createdId after each success. If a later row throws, the
        // rows already created stay marked so a retry doesn't duplicate them.
        onRowsChange(nextRows);
      }
      warmTravelTimes(currentLocations);
      onContinue();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add that location.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepFrame
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Add your locations"
      subtitle="Where you spend your time. We weave travel time between them — skip this and add locations later if you like."
      onSkip={onSkip}
      footer={
        <>
          <Button variant="glass" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <div className={footerActions}>
            <Button
              variant="glassInk"
              onClick={handleContinue}
              disabled={busy || continueDisabled}
            >
              {busy ? "Adding…" : "Continue"}
            </Button>
          </div>
        </>
      }
    >
      <FieldStack size="lg" label="How do you usually get around?">
        <ResponsiveSegmentedControl
          options={TRANSPORT_MODE_OPTIONS}
          value={transportMode}
          onChange={handleTransportChange}
          ariaLabel="Travel mode"
        />
        <span className={fieldHelp}>
          The default travel mode for estimating time between locations.
        </span>
      </FieldStack>

      <LocationRows rows={rows} onChange={onRowsChange} />

      {error && <span className={errorText}>{error}</span>}
    </StepFrame>
  );
}
