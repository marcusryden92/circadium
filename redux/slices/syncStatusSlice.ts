import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// Stamped by useCalendarServerSync on every successful sync transaction; the
// SaveIndicator flashes on each change. Timestamp minted in prepare (reducers
// stay pure).
const syncStatusSlice = createSlice({
  name: "syncStatus",
  initialState: { lastSavedAt: null as number | null },
  reducers: {
    markSaved: {
      reducer: (state, action: PayloadAction<number>) => {
        state.lastSavedAt = action.payload;
      },
      prepare: () => ({ payload: Date.now() }),
    },
  },
});

export const { markSaved } = syncStatusSlice.actions;
export default syncStatusSlice;
