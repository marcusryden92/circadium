import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { OccurrenceCompletion } from "@/types/prisma";

// Logged occurrence completions (recurring tasks/goal leaves + plan
// check-offs). Deliberately OUTSIDE the OCC diff sync (like externalCalendar /
// viewState): rows are written by direct server actions and mirrored here
// wholesale, so this state never bumps dataVersion. Feeds the engine as
// options.occurrenceCompletions (via deriveOccurrenceCompletions) and the
// /habits tracking surface.
type OccurrenceCompletionsState = {
  rows: OccurrenceCompletion[];
  isLoaded: boolean;
};

const initialState: OccurrenceCompletionsState = {
  rows: [],
  isLoaded: false,
};

const sameOccurrence =
  (plannerId: string, occurrenceKey: string) => (row: OccurrenceCompletion) =>
    row.plannerId === plannerId && row.occurrenceKey === occurrenceKey;

const occurrenceCompletionsSlice = createSlice({
  name: "occurrenceCompletions",
  initialState,
  reducers: {
    hydrateOccurrenceCompletions: (
      state,
      action: PayloadAction<OccurrenceCompletion[]>,
    ) => {
      state.rows = action.payload;
      state.isLoaded = true;
    },
    upsertOccurrenceCompletion: (
      state,
      action: PayloadAction<OccurrenceCompletion>,
    ) => {
      const match = sameOccurrence(
        action.payload.plannerId,
        action.payload.occurrenceKey,
      );
      const idx = state.rows.findIndex(match);
      if (idx >= 0) state.rows[idx] = action.payload;
      else state.rows.push(action.payload);
    },
    removeOccurrenceCompletion: (
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
  hydrateOccurrenceCompletions,
  upsertOccurrenceCompletion,
  removeOccurrenceCompletion,
} = occurrenceCompletionsSlice.actions;
export default occurrenceCompletionsSlice;
