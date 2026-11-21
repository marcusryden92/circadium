import { configureStore } from "@reduxjs/toolkit";
import type {
  ExternalCalendarSource,
  ExternalEvent,
  SimpleEvent,
  OccurrenceCompletion,
} from "../contracts";
import type { OccurrenceCompletionInput } from "../engine/models/SchedulingModels";
import calendarSourceSlice from "./slices/calendarSourceSlice";
import engineOutputSlice from "./slices/engineOutputSlice";
import userReducer from "./slices/userSlice";
import schedulingSettingsSlice from "./slices/schedulingSettingsSlice";
import externalCalendarSlice from "./slices/externalCalendarSlice";
import occurrenceCompletionsSlice from "./slices/occurrenceCompletionsSlice";
import habitsSlice from "./slices/habitsSlice";
import toastSlice from "./slices/toastSlice";
import syncStatusSlice from "./slices/syncStatusSlice";

// Host-provided engine-input adapters. These are the only pieces the engine
// entry thunk needs from outside shared: they turn slice rows (external
// calendars, occurrence completions) into the engine's input shapes. They live
// in the host because the external-calendar domain (exception parsing, server
// fetch) is web-only until Phase 2; injecting them here keeps the thunk and
// store fully inside shared. Threaded in as the thunk middleware's
// extraArgument, so updateAllCalendarStates reads them from its third argument.
export interface StateDependencies {
  deriveExternalBusyEvents: (
    sources: ExternalCalendarSource[],
    events: ExternalEvent[],
  ) => SimpleEvent[];
  deriveOccurrenceCompletions: (
    rows: OccurrenceCompletion[],
  ) => OccurrenceCompletionInput[];
}

// Factory, not a singleton: each host (web StoreProvider now, mobile later)
// creates its own store and injects its own engine-input adapters. The web
// StoreProvider owns the single instance per mount.
export const makeStore = (deps: StateDependencies) =>
  configureStore({
    reducer: {
      user: userReducer,
      calendarSource: calendarSourceSlice.reducer,
      engineOutput: engineOutputSlice.reducer,
      schedulingSettings: schedulingSettingsSlice.reducer,
      externalCalendar: externalCalendarSlice.reducer,
      occurrenceCompletions: occurrenceCompletionsSlice.reducer,
      habits: habitsSlice.reducer,
      toasts: toastSlice.reducer,
      syncStatus: syncStatusSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: deps } }),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
