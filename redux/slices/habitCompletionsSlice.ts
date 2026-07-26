import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { HabitCompletion } from "@/types/prisma";

// Logged habit-occurrence completions. Deliberately OUTSIDE the OCC diff sync
// (like externalCalendar / viewState): rows are written by direct server
// actions and mirrored here wholesale, so this state never bumps dataVersion.
// Feeds the engine as options.habitCompletions (via deriveHabitCompletions) and
// the /habits statistics surface.
type HabitCompletionsState = {
  rows: HabitCompletion[];
  isLoaded: boolean;
};

const initialState: HabitCompletionsState = {
  rows: [],
  isLoaded: false,
};

const sameOccurrence =
  (plannerId: string, occurrenceKey: string) => (row: HabitCompletion) =>
    row.plannerId === plannerId && row.occurrenceKey === occurrenceKey;

const habitCompletionsSlice = createSlice({
  name: "habitCompletions",
  initialState,
  reducers: {
    hydrateHabitCompletions: (
      state,
      action: PayloadAction<HabitCompletion[]>,
    ) => {
      state.rows = action.payload;
      state.isLoaded = true;
    },
    upsertHabitCompletion: (state, action: PayloadAction<HabitCompletion>) => {
      const match = sameOccurrence(
        action.payload.plannerId,
        action.payload.occurrenceKey,
      );
      const idx = state.rows.findIndex(match);
      if (idx >= 0) state.rows[idx] = action.payload;
      else state.rows.push(action.payload);
    },
    removeHabitCompletion: (
      state,
      action: PayloadAction<{ plannerId: string; occurrenceKey: string }>,
    ) => {
      const match = sameOccurrence(
        action.payload.plannerId,
        action.payload.occurrenceKey,
      );
      state.rows = state.rows.filter((row) => !match(row));
    },
  },
});

export const {
  hydrateHabitCompletions,
  upsertHabitCompletion,
  removeHabitCompletion,
} = habitCompletionsSlice.actions;
export default habitCompletionsSlice;
