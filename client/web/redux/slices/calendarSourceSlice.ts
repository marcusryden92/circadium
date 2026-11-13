import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  Planner,
  EventTemplate,
  Category,
  CategoryTimeWindow,
  Queue,
  PlannerDependency,
} from "@/types/prisma";

// User-authored scheduling inputs. Everything here is edited by the user (or
// hydrated wholesale from the server) and consumed by the engine as input.
// Engine output lives in engineOutputSlice — keeping the two lifecycles in
// separate slices means a source edit never shares a dispatch with derived
// rows, and subscribers to one don't re-render on writes to the other.
type SourceSnapshot = {
  planner: Planner[];
  template: EventTemplate[];
  categories: Category[];
  queues: Queue[];
  dependencies: PlannerDependency[];
};

// The label names the TRANSITION out of this snapshot ("move task", "change
// duration…"), so it travels with the entry across both stacks: undo toasts
// `Undid <label>` and the future entry keeps it for `Redid <label>`.
type HistoryEntry = SourceSnapshot & { label: string };

type CalendarSourceState = {
  planner: Planner[];
  template: EventTemplate[];
  categories: Category[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  // Undo/redo stacks over the source arrays. Snapshots are array REFERENCES
  // (updates are immutable everywhere), so entries are O(1). In-memory only:
  // hydrateSource clears both, since a wholesale server adoption means the
  // local lineage diverged and replaying old snapshots would corrupt state.
  past: HistoryEntry[];
  future: HistoryEntry[];
  // Flipped to true once useFetchCalendarData seeds the store. Pages gate
  // their empty-state UI on this so a fresh load doesn't briefly read as
  // "no items" / "no categories" before the fetch returns.
  isLoaded: boolean;
};

const HISTORY_LIMIT = 50;

const takeSnapshot = (state: CalendarSourceState): SourceSnapshot => ({
  planner: state.planner,
  template: state.template,
  categories: state.categories,
  queues: state.queues,
  dependencies: state.dependencies,
});

const initialState: CalendarSourceState = {
  planner: [],
  template: [],
  categories: [],
  queues: [],
  dependencies: [],
  past: [],
  future: [],
  isLoaded: false,
};

const calendarSourceSlice = createSlice({
  name: "calendarSource",
  initialState,
  reducers: {
    // Wholesale replacement from a server snapshot: initial fetch,
    // stale-adoption, and rollback. Does not touch isLoaded — that belongs
    // to the initial fetch alone.
    hydrateSource: (
      state,
      action: PayloadAction<{
        planner: Planner[];
        template: EventTemplate[];
        categories: Category[];
        queues: Queue[];
        dependencies: PlannerDependency[];
      }>,
    ) => {
      state.planner = action.payload.planner;
      state.template = action.payload.template;
      state.categories = action.payload.categories;
      state.queues = action.payload.queues;
      state.dependencies = action.payload.dependencies;
      state.past = [];
      state.future = [];
    },
    // One history entry per logical user edit. The thunk dispatches this once
    // per state-changing pass; the two surfaces that bypass the thunk
    // (categories page, WeekStructureModal save) dispatch it themselves,
    // once per user action — never per granular dispatch.
    recordHistory: (state, action: PayloadAction<{ label: string }>) => {
      state.past.push({ ...takeSnapshot(state), label: action.payload.label });
      if (state.past.length > HISTORY_LIMIT) state.past.shift();
      state.future = [];
    },
    // Stack movement only — the actual array restore goes through the thunk
    // (pruning + regen + sync), which is why these don't touch the arrays.
    shiftHistoryForUndo: (state) => {
      const entry = state.past.pop();
      if (!entry) return;
      state.future.push({ ...takeSnapshot(state), label: entry.label });
    },
    shiftHistoryForRedo: (state) => {
      const entry = state.future.pop();
      if (!entry) return;
      state.past.push({ ...takeSnapshot(state), label: entry.label });
    },
    // The engine-run write-back path: the thunk applies the caller's edits
    // to planner/template before generating, and the edited arrays land here
    // in the same tick as the derived output lands in engineOutputSlice.
    setPlannerAndTemplate: (
      state,
      action: PayloadAction<{
        planner: Planner[];
        template: EventTemplate[];
      }>,
    ) => {
      state.planner = action.payload.planner;
      state.template = action.payload.template;
    },
    // Only useFetchCalendarData should call this.
    markCalendarLoaded: (state) => {
      state.isLoaded = true;
    },
    setCategories: (state, action: PayloadAction<Category[]>) => {
      state.categories = action.payload;
    },
    setQueues: (state, action: PayloadAction<Queue[]>) => {
      state.queues = action.payload;
    },
    setDependencies: (state, action: PayloadAction<PlannerDependency[]>) => {
      state.dependencies = action.payload;
    },
    // Insert-or-replace by id. Used by optimistic updates so the caller doesn't
    // have to snapshot the whole array and replay it after the server confirms.
    upsertCategory: (state, action: PayloadAction<Category>) => {
      const idx = state.categories.findIndex((c) => c.id === action.payload.id);
      if (idx === -1) state.categories.push(action.payload);
      else state.categories[idx] = action.payload;
    },
    removeCategory: (state, action: PayloadAction<string>) => {
      state.categories = state.categories.filter((c) => c.id !== action.payload);
    },
    upsertTemplate: (state, action: PayloadAction<EventTemplate>) => {
      const idx = state.template.findIndex((t) => t.id === action.payload.id);
      if (idx === -1) state.template.push(action.payload);
      else state.template[idx] = action.payload;
    },
    removeTemplate: (state, action: PayloadAction<string>) => {
      state.template = state.template.filter((t) => t.id !== action.payload);
    },
    // Windows live nested in categories[].timeSlots. The upsert moves a window
    // to its target category if categoryId changes, and refuses unassigned
    // (categoryId === null) payloads — those are UI-only drafts and shouldn't
    // hit Redux until they've been assigned a category.
    upsertTimeWindow: (state, action: PayloadAction<CategoryTimeWindow>) => {
      const window = action.payload;
      if (!window.categoryId) return;
      for (const c of state.categories) {
        if (c.id === window.categoryId) continue;
        c.timeSlots = c.timeSlots.filter((ts) => ts.id !== window.id);
      }
      const target = state.categories.find((c) => c.id === window.categoryId);
      if (!target) return;
      const idx = target.timeSlots.findIndex((ts) => ts.id === window.id);
      if (idx === -1) target.timeSlots.push(window);
      else target.timeSlots[idx] = window;
    },
    removeTimeWindow: (state, action: PayloadAction<string>) => {
      for (const c of state.categories) {
        c.timeSlots = c.timeSlots.filter((ts) => ts.id !== action.payload);
      }
    },
  },
});

export const {
  hydrateSource,
  recordHistory,
  shiftHistoryForUndo,
  shiftHistoryForRedo,
  setPlannerAndTemplate,
  markCalendarLoaded,
  setCategories,
  setQueues,
  setDependencies,
  upsertCategory,
  removeCategory,
  upsertTemplate,
  removeTemplate,
  upsertTimeWindow,
  removeTimeWindow,
} = calendarSourceSlice.actions;
export default calendarSourceSlice;
