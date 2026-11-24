"use client";

import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useFlashValue } from "@/hooks/useFlashAnimation";
import { useServerAction } from "@/hooks/useServerAction";
import { useCalendarProvider } from "@/context/CalendarProvider";
import * as locationActions from "@/actions/locations";
import {
  serializeLocation,
  serializeTravelTime,
  hasCustomOverride,
} from "@/utils/locations";
import type { RootState } from "@/redux/store";
import {
  upsertLocation,
  removeLocation,
  setAllTravelTimes,
  upsertTravelTime,
  removeTravelTimesByLocationId,
  setDefaultTransportMode,
  type SerializedLocation,
} from "@/redux/slices/schedulingSettingsSlice";
import type { TransportMode } from "@/generated/client";
import type { EditLocationDraft } from "../_components/EditLocationModal";
import { SUCCESS_MESSAGE_MS } from "../_constants";

export interface TravelTimeOverrides {
  customRushHourMinutes: number | null;
  customRegularMinutes: number | null;
  customNightMinutes: number | null;
}

// All data access and mutation flows for the Locations page. Reads come from
// Redux only — no fetch on mount. Locations arrive with the calendar
// bootstrap (useFetchCalendarData); a page-level dispatch raced with
// useCalendarServerSync's diff hook and could cascade-delete locations on the
// server if the racing fetch ever returned an empty list.
//
// Mutations split two ways:
//   - Pure Redux dispatches (name edits, deletes, travel-time overrides): the
//     diff in useCalendarServerSync picks them up and syncs.
//   - Server-first actions (create/place-change need Google Places, fetch
//     missing needs the Routes API + budget reservation): these bypass the
//     diff path, so each is followed by markSynced to advance the sync refs.
export function useLocationsPageState() {
  const dispatch = useDispatch();
  const { markSynced, updateAll, locations } = useCalendarProvider();

  const allTravelTimes = useSelector(
    (state: RootState) => state.schedulingSettings.allTravelTimes,
  );
  const transportMode = useSelector(
    (state: RootState) => state.schedulingSettings.defaultTransportMode,
  );
  const isLoaded = useSelector(
    (state: RootState) => state.schedulingSettings.isLoaded,
  );

  const [error, setError] = useState<string | null>(null);
  const [success, flashSuccess] = useFlashValue<string | null>(
    SUCCESS_MESSAGE_MS,
    null,
  );

  const fetchMissing = useServerAction(locationActions.fetchMissingTravelTimes);
  const working = fetchMissing.isPending;

  const travelTimes = useMemo(
    () => allTravelTimes.filter((tt) => tt.transportMode === transportMode),
    [allTravelTimes, transportMode],
  );

  const combinedError = error ?? fetchMissing.status?.text ?? null;

  const changeTransportMode = async (mode: TransportMode) => {
    const previous = transportMode;
    dispatch(setDefaultTransportMode(mode));
    try {
      await locationActions.updateDefaultTransportMode(mode);
    } catch (err) {
      dispatch(setDefaultTransportMode(previous));
      console.error("Failed to persist transport mode", err);
    }
  };

  // Mirrors the upsertLocation reducer so markSynced can be handed the exact
  // post-dispatch array without waiting for a re-render.
  const upsertIntoList = (
    list: SerializedLocation[],
    row: SerializedLocation,
  ): SerializedLocation[] => {
    const idx = list.findIndex((l) => l.id === row.id);
    if (idx === -1) return [...list, row];
    const next = [...list];
    next[idx] = row;
    return next;
  };

  // Add is server-first because the row's id is server-generated. The
  // returned row goes straight into Redux so the rest of the app sees the
  // new location without a separate sync step. markSynced advances the sync
  // refs so the diff doesn't treat the server-created row as a client change.
  // Rethrows so the calling modal can keep itself open on failure.
  const addLocation = async (
    name: string,
    placeId: string,
    sessionToken?: string,
  ) => {
    try {
      setError(null);
      const created = await locationActions.createLocation({
        name,
        placeId,
        sessionToken,
      });
      const serialized = serializeLocation(created);
      dispatch(upsertLocation(serialized));
      markSynced("locations", upsertIntoList(locations, serialized));
      flashSuccess(`Added "${name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add location");
      throw err;
    }
  };

  // Edit splits two ways:
  //   - name-only changes flow through Redux. The diff in useCalendarServerSync
  //     picks them up and sends location.update.
  //   - placeId changes still hit the server directly so updateLocation can do
  //     the Google Places lookup and cascade-delete travel times.
  const saveLocationEdit = async (
    original: SerializedLocation,
    draft: EditLocationDraft,
  ) => {
    const trimmedName = draft.name.trim();

    if (!draft.placeId) {
      dispatch(
        upsertLocation({
          ...original,
          name: trimmedName,
        }),
      );
      flashSuccess("Location updated.");
      return;
    }

    const optimistic: SerializedLocation = {
      ...original,
      name: trimmedName,
    };
    dispatch(upsertLocation(optimistic));

    try {
      const updated = await locationActions.updateLocation(original.id, {
        name: trimmedName !== original.name ? trimmedName : undefined,
        placeId: draft.placeId,
        sessionToken: draft.sessionToken,
      });
      const serialized = serializeLocation(updated);
      dispatch(upsertLocation(serialized));
      // updateLocation cascades the affected travel times server-side; mirror
      // that in Redux so the matrix shows them as missing immediately, and
      // advance the sync refs so neither shows up as a phantom diff.
      dispatch(removeTravelTimesByLocationId(updated.id));
      markSynced("locations", upsertIntoList(locations, serialized));
      markSynced(
        "travelTimes",
        allTravelTimes.filter(
          (tt) =>
            tt.fromLocationId !== updated.id && tt.toLocationId !== updated.id,
        ),
      );
      flashSuccess("Location updated.");
    } catch (err) {
      dispatch(upsertLocation(original));
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  // Delete is pure Redux dispatch — the diff sends location.destroy and
  // Prisma cascades the related travel times server-side. The client-side
  // travel-time removal keeps the matrix in sync immediately.
  const deleteLocation = (locationId: string) => {
    const original = locations.find((l) => l.id === locationId);
    if (!original) return;
    dispatch(removeLocation(locationId));
    dispatch(removeTravelTimesByLocationId(locationId));
    // Mirror the server's SetNull cascade: planner/category/template rows that
    // pointed at the deleted location fall back to "Anywhere". Routing it
    // through updateAll both nulls the ids and regenerates, so no stale
    // locationId survives in Redux and the calendar drops travel to/from it.
    updateAll(
      (prev) =>
        prev.map((p) =>
          p.locationId === locationId ? { ...p, locationId: null } : p,
        ),
      undefined,
      (prev) =>
        prev.map((t) =>
          t.locationId === locationId ? { ...t, locationId: null } : t,
        ),
      (prev) =>
        prev.map((c) =>
          c.locationId === locationId ? { ...c, locationId: null } : c,
        ),
    );
    flashSuccess("Location deleted.");
  };

  const fetchMissingTravelTimes = async () => {
    if (locations.length < 2) {
      setError("Add at least 2 locations to fetch travel times.");
      return;
    }
    setError(null);
    const result = await fetchMissing.run(transportMode);
    if (!result) return;
    const fresh = await locationActions.fetchTravelTimes();
    const serialized = fresh.map(serializeTravelTime);
    dispatch(setAllTravelTimes(serialized));
    markSynced("travelTimes", serialized);
    const fetchedText =
      result.fetched > 0
        ? `Fetched ${result.fetched} travel time${result.fetched > 1 ? "s" : ""}.`
        : "All travel times are up to date.";
    flashSuccess(
      result.failed > 0
        ? `${fetchedText} ${result.failed} pair${result.failed > 1 ? "s" : ""} couldn't be routed.`
        : fetchedText,
    );
  };

  // Travel-time overrides flow through Redux. The diff picks up the changed
  // custom fields and sends travelTime.update.
  const saveTravelTimeOverrides = (
    travelTimeId: string,
    overrides: TravelTimeOverrides,
  ) => {
    const current = allTravelTimes.find((tt) => tt.id === travelTimeId);
    if (!current) return;
    dispatch(
      upsertTravelTime({
        ...current,
        ...overrides,
      }),
    );
  };

  const clearAllOverrides = () => {
    const customized = travelTimes.filter(hasCustomOverride);
    if (customized.length === 0) return;
    for (const tt of customized) {
      dispatch(
        upsertTravelTime({
          ...tt,
          customRushHourMinutes: null,
          customRegularMinutes: null,
          customNightMinutes: null,
        }),
      );
    }
    flashSuccess("All overrides cleared.");
  };

  return {
    locations,
    travelTimes,
    transportMode,
    isLoaded,
    working,
    success,
    combinedError,
    changeTransportMode,
    addLocation,
    saveLocationEdit,
    deleteLocation,
    fetchMissingTravelTimes,
    saveTravelTimeOverrides,
    clearAllOverrides,
  };
}
