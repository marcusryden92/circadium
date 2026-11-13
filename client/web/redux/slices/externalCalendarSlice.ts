import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ExternalCalendarSource, ExternalEvent } from "@/types/prisma";

// Imported external calendars (ICS subscriptions). Deliberately OUTSIDE the
// OCC diff sync: rows are written by direct server actions (add/refresh/
// update/delete) and mirrored here wholesale from the action results, so this
// state never bumps dataVersion or produces sync diffs.
type ExternalCalendarState = {
  sources: ExternalCalendarSource[];
  events: ExternalEvent[];
  isLoaded: boolean;
};

const initialState: ExternalCalendarState = {
  sources: [],
  events: [],
  isLoaded: false,
};

const externalCalendarSlice = createSlice({
  name: "externalCalendar",
  initialState,
  reducers: {
    hydrateExternalCalendar: (
      state,
      action: PayloadAction<{
        sources: ExternalCalendarSource[];
        events: ExternalEvent[];
      }>,
    ) => {
      state.sources = action.payload.sources;
      state.events = action.payload.events;
      state.isLoaded = true;
    },
    upsertExternalSource: (
      state,
      action: PayloadAction<ExternalCalendarSource>,
    ) => {
      const idx = state.sources.findIndex((s) => s.id === action.payload.id);
      if (idx >= 0) state.sources[idx] = action.payload;
      else state.sources.push(action.payload);
    },
    removeExternalSource: (state, action: PayloadAction<string>) => {
      state.sources = state.sources.filter((s) => s.id !== action.payload);
      state.events = state.events.filter(
        (e) => e.sourceId !== action.payload,
      );
    },
    // One refresh (or add) result: the source row plus the wholesale-replaced
    // event set for that source.
    applyExternalRefresh: (
      state,
      action: PayloadAction<{
        source: ExternalCalendarSource;
        events: ExternalEvent[];
      }>,
    ) => {
      const idx = state.sources.findIndex(
        (s) => s.id === action.payload.source.id,
      );
      if (idx >= 0) state.sources[idx] = action.payload.source;
      else state.sources.push(action.payload.source);
      state.events = [
        ...state.events.filter(
          (e) => e.sourceId !== action.payload.source.id,
        ),
        ...action.payload.events,
      ];
    },
  },
});

export const {
  hydrateExternalCalendar,
  upsertExternalSource,
  removeExternalSource,
  applyExternalRefresh,
} = externalCalendarSlice.actions;
export default externalCalendarSlice;
