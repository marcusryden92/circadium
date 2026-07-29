import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Habit, HabitBucket, HabitItem } from "@/types/prisma";

// Habit trackers, their buckets, and their tracked-item links. Deliberately
// OUTSIDE the OCC diff sync (like occurrenceCompletions / viewState): rows are
// written by direct server actions and mirrored here wholesale, so this state
// never bumps dataVersion. The engine never reads it — habits are a pure
// tracking layer over repeating planner items.
type HabitsState = {
  buckets: HabitBucket[];
  habits: Habit[];
  items: HabitItem[];
  isLoaded: boolean;
};

const initialState: HabitsState = {
  buckets: [],
  habits: [],
  items: [],
  isLoaded: false,
};

const habitsSlice = createSlice({
  name: "habits",
  initialState,
  reducers: {
    hydrateHabits: (
      state,
      action: PayloadAction<{
        buckets: HabitBucket[];
        habits: Habit[];
        items: HabitItem[];
      }>,
    ) => {
      state.buckets = action.payload.buckets;
      state.habits = action.payload.habits;
      state.items = action.payload.items;
      state.isLoaded = true;
    },
    upsertHabitBucket: (state, action: PayloadAction<HabitBucket>) => {
      const idx = state.buckets.findIndex((b) => b.id === action.payload.id);
      if (idx >= 0) state.buckets[idx] = action.payload;
      else state.buckets.push(action.payload);
    },
    removeHabitBucket: (
      state,
      action: PayloadAction<{ bucketId: string }>,
    ) => {
      state.buckets = state.buckets.filter(
        (b) => b.id !== action.payload.bucketId,
      );
      // Mirror the DB's SetNull: bucketed habits survive as unsorted.
      state.habits = state.habits.map((h) =>
        h.bucketId === action.payload.bucketId ? { ...h, bucketId: null } : h,
      );
    },
    upsertHabit: (state, action: PayloadAction<Habit>) => {
      const idx = state.habits.findIndex((h) => h.id === action.payload.id);
      if (idx >= 0) state.habits[idx] = action.payload;
      else state.habits.push(action.payload);
    },
    removeHabit: (state, action: PayloadAction<{ habitId: string }>) => {
      state.habits = state.habits.filter(
        (h) => h.id !== action.payload.habitId,
      );
      state.items = state.items.filter(
        (i) => i.habitId !== action.payload.habitId,
      );
    },
    upsertHabitItem: (state, action: PayloadAction<HabitItem>) => {
      const idx = state.items.findIndex(
        (i) =>
          i.habitId === action.payload.habitId &&
          i.plannerId === action.payload.plannerId,
      );
      if (idx >= 0) state.items[idx] = action.payload;
      else state.items.push(action.payload);
    },
    removeHabitItem: (
      state,
      action: PayloadAction<{ habitId: string; plannerId: string }>,
    ) => {
      state.items = state.items.filter(
        (i) =>
          !(
            i.habitId === action.payload.habitId &&
            i.plannerId === action.payload.plannerId
          ),
      );
    },
  },
});

export const {
  hydrateHabits,
  upsertHabitBucket,
  removeHabitBucket,
  upsertHabit,
  removeHabit,
  upsertHabitItem,
  removeHabitItem,
} = habitsSlice.actions;
export default habitsSlice;
