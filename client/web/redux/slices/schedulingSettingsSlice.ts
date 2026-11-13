import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { TransportMode } from "@/generated/client";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type { TravelTimeEntry } from "@/utils/calendar-generation/models/SchedulingModels";
import {
  DEFAULT_STRATEGY_WEIGHTS,
  DEFAULT_LOCATION_GROUPING_SCORES,
  DEFAULT_LOCATION_GROUPING_PENALTIES,
} from "@/utils/calendar-generation/strategies/defaultStrategy";

// Serializable format for Redux storage
export type SerializedTravelTimeEntry = {
  key: string;
  fromLocationId: string;
  toLocationId: string;
  rushHourMinutes: number;
  regularMinutes: number;
  nightMinutes: number;
};

export type SerializedLocation = {
  id: string;
  name: string;
  address: string;
  placeId: string;
};

// Full row shape the Locations UI needs (every mode, with custom overrides).
// Distinct from SerializedTravelTimeEntry, which is the engine-shaped subset
// derived from the user's default mode only.
export type SerializedTravelTime = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  transportMode: TransportMode;
  googleRushHourMinutes: number;
  googleRegularMinutes: number;
  googleNightMinutes: number;
  customRushHourMinutes: number | null;
  customRegularMinutes: number | null;
  customNightMinutes: number | null;
  // Server-authoritative negative-cache mark: Google returned no route for
  // this pair. The engine matrix and the UI treat it as no-route, never as
  // zero-duration travel. Every serialization site must include it — the sync
  // diff compares whole objects.
  unroutable: boolean;
};

// Strategy configuration types (mutable versions of the readonly defaults)
export type StrategyWeights = {
  earliestSlot: number;
  locationGrouping: number;
  fitTightness: number;
};

export type LocationGroupingScores = {
  bothMatch: number;
  oneMatchOneOpen: number;
  oneMatch: number;
  bothOpen: number;
  oneOpenNoMatch: number;
  neitherMatch: number;
  noLocation: number;
};

export type LocationGroupingPenalties = {
  singleTravelPenaltyScale: number;
  doubleTravelPenaltyScale: number;
};

export type DebugStrategyConfig = {
  weights: StrategyWeights;
  locationGrouping: {
    scores: LocationGroupingScores;
    penalties: LocationGroupingPenalties;
  };
};

export type SchedulingSettings = {
  bufferTimeMinutes: number;
  weekStartDay: WeekDayIntegers;
  enableTravelEvents: boolean;
  // Full TravelTime rows, every transport mode. The single source of truth for
  // both the Locations UI and the engine (which derives its single-mode matrix
  // from these via deriveTravelTimeMatrix at run time).
  allTravelTimes: SerializedTravelTime[];
  defaultTransportMode: TransportMode;
  locations: SerializedLocation[];
  isLoaded: boolean;
  // Debug strategy configuration
  debugStrategyConfig: DebugStrategyConfig;
  debugDashboardEnabled: boolean;
};

const initialState: SchedulingSettings = {
  bufferTimeMinutes: 10, // Default value
  weekStartDay: 1, // Monday
  enableTravelEvents: false, // Travel events disabled by default
  allTravelTimes: [],
  defaultTransportMode: "DRIVING",
  locations: [],
  isLoaded: false,
  // Initialize with defaults from defaultStrategy.ts
  debugStrategyConfig: {
    weights: { ...DEFAULT_STRATEGY_WEIGHTS },
    locationGrouping: {
      scores: { ...DEFAULT_LOCATION_GROUPING_SCORES },
      penalties: { ...DEFAULT_LOCATION_GROUPING_PENALTIES },
    },
  },
  debugDashboardEnabled: false,
};

/**
 * Derive the engine-shaped travel matrix (single mode, overrides applied) from
 * the full allTravelTimes rows. This is the SINGLE source of truth: the engine
 * re-derives it on every run so any in-session change to travel times or the
 * transport mode takes effect without a page reload. Key format must match
 * TimeSlotManager.getTravelTime: "fromId->toId".
 */
export function deriveTravelTimeMatrix(
  allTravelTimes: SerializedTravelTime[],
  mode: TransportMode,
): SerializedTravelTimeEntry[] {
  return allTravelTimes
    .filter((tt) => tt.transportMode === mode)
    // An unroutable pair is absent from the matrix (the engine's missing-pair
    // fallback applies) unless the user supplied their own values.
    .filter(
      (tt) =>
        !tt.unroutable ||
        tt.customRushHourMinutes !== null ||
        tt.customRegularMinutes !== null ||
        tt.customNightMinutes !== null,
    )
    .map((tt) => ({
      key: `${tt.fromLocationId}->${tt.toLocationId}`,
      fromLocationId: tt.fromLocationId,
      toLocationId: tt.toLocationId,
      rushHourMinutes: tt.customRushHourMinutes ?? tt.googleRushHourMinutes,
      regularMinutes: tt.customRegularMinutes ?? tt.googleRegularMinutes,
      nightMinutes: tt.customNightMinutes ?? tt.googleNightMinutes,
    }));
}

/**
 * Helper to convert serialized array to Map for use in scheduling
 */
export function travelTimeArrayToMap(
  array: SerializedTravelTimeEntry[] | null
): Map<string, TravelTimeEntry> | null {
  if (!array || array.length === 0) return null;

  const map = new Map<string, TravelTimeEntry>();
  for (const entry of array) {
    map.set(entry.key, {
      fromLocationId: entry.fromLocationId,
      toLocationId: entry.toLocationId,
      rushHourMinutes: entry.rushHourMinutes,
      regularMinutes: entry.regularMinutes,
      nightMinutes: entry.nightMinutes,
    });
  }
  return map;
}

const schedulingSettingsSlice = createSlice({
  name: "schedulingSettings",
  initialState,
  reducers: {
    setSchedulingSettings: (
      state,
      action: PayloadAction<{
        bufferTimeMinutes: number;
        weekStartDay?: WeekDayIntegers;
        enableTravelEvents?: boolean;
      }>
    ) => {
      state.bufferTimeMinutes = action.payload.bufferTimeMinutes;
      if (action.payload.weekStartDay !== undefined) {
        state.weekStartDay = action.payload.weekStartDay;
      }
      if (action.payload.enableTravelEvents !== undefined) {
        state.enableTravelEvents = action.payload.enableTravelEvents;
      }
      state.isLoaded = true;
    },
    setWeekStartDay: (state, action: PayloadAction<WeekDayIntegers>) => {
      state.weekStartDay = action.payload;
    },
    setBufferTimeMinutes: (state, action: PayloadAction<number>) => {
      state.bufferTimeMinutes = action.payload;
    },
    setEnableTravelEvents: (state, action: PayloadAction<boolean>) => {
      state.enableTravelEvents = action.payload;
    },
    setLocations: (state, action: PayloadAction<SerializedLocation[]>) => {
      state.locations = action.payload;
    },
    upsertLocation: (state, action: PayloadAction<SerializedLocation>) => {
      const idx = state.locations.findIndex((l) => l.id === action.payload.id);
      if (idx === -1) {
        state.locations.push(action.payload);
      } else {
        state.locations[idx] = action.payload;
      }
    },
    removeLocation: (state, action: PayloadAction<string>) => {
      state.locations = state.locations.filter((l) => l.id !== action.payload);
    },
    setAllTravelTimes: (
      state,
      action: PayloadAction<SerializedTravelTime[]>,
    ) => {
      state.allTravelTimes = action.payload;
    },
    upsertTravelTime: (state, action: PayloadAction<SerializedTravelTime>) => {
      const idx = state.allTravelTimes.findIndex(
        (tt) => tt.id === action.payload.id,
      );
      if (idx === -1) state.allTravelTimes.push(action.payload);
      else state.allTravelTimes[idx] = action.payload;
    },
    removeTravelTimesByLocationId: (
      state,
      action: PayloadAction<string>,
    ) => {
      state.allTravelTimes = state.allTravelTimes.filter(
        (tt) =>
          tt.fromLocationId !== action.payload &&
          tt.toLocationId !== action.payload,
      );
    },
    setDefaultTransportMode: (
      state,
      action: PayloadAction<TransportMode>,
    ) => {
      state.defaultTransportMode = action.payload;
    },
    // Debug strategy config reducers
    setDebugDashboardEnabled: (state, action: PayloadAction<boolean>) => {
      state.debugDashboardEnabled = action.payload;
    },
    setStrategyWeights: (state, action: PayloadAction<Partial<StrategyWeights>>) => {
      state.debugStrategyConfig.weights = {
        ...state.debugStrategyConfig.weights,
        ...action.payload,
      };
    },
    setLocationGroupingScores: (state, action: PayloadAction<Partial<LocationGroupingScores>>) => {
      state.debugStrategyConfig.locationGrouping.scores = {
        ...state.debugStrategyConfig.locationGrouping.scores,
        ...action.payload,
      };
    },
    setLocationGroupingPenalties: (state, action: PayloadAction<Partial<LocationGroupingPenalties>>) => {
      state.debugStrategyConfig.locationGrouping.penalties = {
        ...state.debugStrategyConfig.locationGrouping.penalties,
        ...action.payload,
      };
    },
    resetStrategyConfig: (state) => {
      state.debugStrategyConfig = {
        weights: { ...DEFAULT_STRATEGY_WEIGHTS },
        locationGrouping: {
          scores: { ...DEFAULT_LOCATION_GROUPING_SCORES },
          penalties: { ...DEFAULT_LOCATION_GROUPING_PENALTIES },
        },
      };
    },
  },
});

export const {
  setSchedulingSettings,
  setWeekStartDay,
  setBufferTimeMinutes,
  setEnableTravelEvents,
  setLocations,
  upsertLocation,
  removeLocation,
  setAllTravelTimes,
  upsertTravelTime,
  removeTravelTimesByLocationId,
  setDefaultTransportMode,
  setDebugDashboardEnabled,
  setStrategyWeights,
  setLocationGroupingScores,
  setLocationGroupingPenalties,
  resetStrategyConfig,
} = schedulingSettingsSlice.actions;
export default schedulingSettingsSlice;
