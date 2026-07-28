import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  SimpleEvent,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
} from "@/types/prisma";

// Engine-derived calendar state. Written by exactly three paths: an engine
// run (applyEngineRun), a server snapshot (hydrateEngineOutput), and the one
// user-owned flag flip on a derived row (dismissEngineMessage). User-authored
// inputs live in calendarSourceSlice.
type EngineOutputState = {
  // Scheduled events. Engine output, but also the engine's memory — each run
  // receives the previous array as `previousCalendar` to keep placements
  // stable, so this is persisted and diffed like everything else.
  calendar: SimpleEvent[];
  // Materialized weekly category occurrences with trespass info. Written
  // wholesale each regen; renderer reads directly.
  categoryEvents: CategoryEvent[];
  // Materialized travel events between scheduled items. Written wholesale
  // each regen; renderer reads directly.
  travelEvents: TravelEvent[];
  // Engine messages surfaced in the calendar engine console. Written
  // wholesale each regen; the engine consults the prior contents at emit
  // time to carry forward the user-owned `dismissed` flag by id, so a
  // dismissed row stays dismissed across regens as long as the deterministic
  // id keeps matching. Dismissal is a plain field flip that flows to the DB
  // through the standard diff sync.
  engineMessages: EngineMessage[];
  // Per-planner urgency scores from the engine's last regen. Ephemeral —
  // hydrated only when the engine runs (not from the server fetch), so a
  // cold load before the autoregen fires will see {}. Consumers (e.g. the
  // dashboard's priority-goals ranking) must handle the empty case.
  plannerScores: Record<string, number>;
  // ISO timestamp of the last engine run this session. Ephemeral like
  // plannerScores — null until the engine has run, including after a cold
  // load that only fetched persisted output.
  lastEngineRunAt: string | null;
};

const initialState: EngineOutputState = {
  calendar: [],
  categoryEvents: [],
  travelEvents: [],
  engineMessages: [],
  plannerScores: {},
  lastEngineRunAt: null,
};

const engineOutputSlice = createSlice({
  name: "engineOutput",
  initialState,
  reducers: {
    // One engine run, one dispatch. `ranAt` is passed in by the caller so
    // the reducer stays pure.
    applyEngineRun: (
      state,
      action: PayloadAction<{
        calendar: SimpleEvent[];
        categoryEvents: CategoryEvent[];
        travelEvents: TravelEvent[];
        engineMessages: EngineMessage[];
        plannerScores?: Record<string, number>;
        ranAt: string;
      }>,
    ) => {
      state.calendar = action.payload.calendar;
      state.categoryEvents = action.payload.categoryEvents;
      state.travelEvents = action.payload.travelEvents;
      state.engineMessages = action.payload.engineMessages;
      if (action.payload.plannerScores !== undefined) {
        state.plannerScores = action.payload.plannerScores;
      }
      state.lastEngineRunAt = action.payload.ranAt;
    },
    // Wholesale replacement from a server snapshot: initial fetch,
    // stale-adoption, and rollback. Leaves plannerScores/lastEngineRunAt
    // alone — the server doesn't know them; they belong to this session's
    // engine runs.
    hydrateEngineOutput: (
      state,
      action: PayloadAction<{
        calendar: SimpleEvent[];
        categoryEvents: CategoryEvent[];
        travelEvents: TravelEvent[];
        engineMessages: EngineMessage[];
      }>,
    ) => {
      state.calendar = action.payload.calendar;
      state.categoryEvents = action.payload.categoryEvents;
      state.travelEvents = action.payload.travelEvents;
      state.engineMessages = action.payload.engineMessages;
    },
    // Dismissal path: flip the row's `dismissed` flag. The row stays in
    // Redux (and eventually the DB via diff sync) so subsequent regens can
    // consult its dismissed state and carry it forward. The next regen's
    // emit sees the flag and keeps the row hidden as long as the
    // deterministic id keeps matching; cycling falls out naturally when the
    // engine stops emitting the row (diff destroys it) and any later
    // re-emit is a fresh, undismissed row.
    dismissEngineMessage: (state, action: PayloadAction<string>) => {
      const target = state.engineMessages.find((m) => m.id === action.payload);
      if (target) target.dismissed = true;
    },
    // Restore path: the engine never flips dismissed back on its own (a
    // re-emit of the same id keeps the flag), so an accidental dismiss needs
    // this user-driven undo. Rides the same diff sync as dismissal.
    undismissEngineMessage: (state, action: PayloadAction<string>) => {
      const target = state.engineMessages.find((m) => m.id === action.payload);
      if (target) target.dismissed = false;
    },
  },
});

export const {
  applyEngineRun,
  hydrateEngineOutput,
  dismissEngineMessage,
  undismissEngineMessage,
} = engineOutputSlice.actions;
export default engineOutputSlice;
