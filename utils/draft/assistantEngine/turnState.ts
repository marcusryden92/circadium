import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { DraftTemplate } from "@/utils/draft/draftTemplates";
import type { DraftWindowsState } from "@/utils/draft/draftWindows";
import {
  pruneDraftPrecedence,
  type DraftPrecedenceState,
} from "@/utils/draft/draftPrecedence";
import { pruneDraftHabits, type DraftHabitsState } from "@/utils/draft/draftHabits";
import type { DraftRelocation } from "@/utils/draft/draftRelocations";
import type { DraftSchedulingSettings } from "@/utils/draft/draftSettings";
import type { DraftInboxItem } from "./types";

// The one callback the tool handlers reach the caller through — the same
// event-name/payload contract the old SSE emit used (see eventDispatch).
export type SendFn = (event: string, data: unknown) => void;

// The mutable working state of a single assistant turn. The deterministic edit
// tools advance the working copies in place (via the pure draftXOps functions),
// so later reads within the same turn see earlier edits; the caller is mirrored
// each change through `send`. Handlers live in ./handlers and operate on this
// object; the streaming loop in runAssistantTurn shares it too (the propose
// counter and goal-id sets are touched from both).
export interface TurnState {
  workingForest: DraftForest;
  workingTemplates: DraftTemplate[];
  workingWindows: DraftWindowsState;
  workingPrecedence: DraftPrecedenceState;
  workingHabits: DraftHabitsState;
  // Streamed proposals are keyed by call index so the caller can fold multiple
  // propose_goals calls from one turn without clobbering each other's merges.
  proposeCallCounter: number;
  // Reset per stream iteration: the final stamped propose_goals re-emit reuses
  // the callIndex its id-less partials streamed under, keyed by tool_use id.
  proposeCallIndexByToolUseId: Map<string, number>;
  // Fetch-before-modify + draft adoption bookkeeping.
  existingGoalIds: Set<string>;
  fetchedGoalIds: Set<string>;
  // Sanctioned cross-boundary moves (promote/demote/triage), ordered. Ops
  // append; the full list re-emits so the caller can replay it at Save.
  workingRelocations: DraftRelocation[];
  // Untriaged capture jots still available to triage_items; entries leave the
  // list as they are pulled into the forest.
  workingInbox: DraftInboxItem[];
  workingSettings: DraftSchedulingSettings;
  readonly recurringPlanIdSet: Set<string>;
  readonly validLocationIds: Set<string>;
  readonly templateExceptionIds: ReadonlySet<string>;
  readonly windowExceptionIds: ReadonlySet<string>;
  readonly send: SendFn;
}

export function getGoal(state: TurnState, id: string): DraftNode | undefined {
  return state.workingForest.goals.find((g) => g.id === id);
}

// Category ids and names must be read from the working state, not the
// turn-start snapshot — categories created or renamed by earlier tool calls in
// this same turn are immediately referenceable.
export function currentCategoryIds(state: TurnState): Set<string> {
  return new Set(state.workingWindows.categories.map((c) => c.id));
}

export function categoryName(state: TurnState, id: string): string {
  return state.workingWindows.categories.find((c) => c.id === id)?.name ?? id;
}

function isProposalGoalAllowed(state: TurnState, goal: unknown): boolean {
  const id = (goal as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id.length === 0) return true; // new goal
  if (!state.existingGoalIds.has(id)) return true; // unknown id -> new goal
  return state.fetchedGoalIds.has(id);
}

// A proposal touching an existing goal the model has NOT fetched this turn is
// filtered out and rejected — complete-tree replacement without the current
// subtree would silently delete children. Shared by the streaming partial
// parse and the propose_goals tool handler.
export function filterProposal(
  state: TurnState,
  partial: unknown,
): { goals: unknown[]; rejectedIds: string[]; deletedGoalIds: unknown } {
  const { goals, deletedGoalIds } = (partial ?? {}) as {
    goals?: unknown;
    deletedGoalIds?: unknown;
  };
  const allGoals = Array.isArray(goals) ? goals : [];
  return {
    goals: allGoals.filter((g) => isProposalGoalAllowed(state, g)),
    rejectedIds: allGoals
      .map((g) => (g as { id?: unknown } | null)?.id)
      .filter(
        (id): id is string =>
          typeof id === "string" &&
          state.existingGoalIds.has(id) &&
          !state.fetchedGoalIds.has(id),
      ),
    deletedGoalIds: deletedGoalIds ?? [],
  };
}

// Forest edits can orphan precedence references (a deleted or retyped root that
// was a queue member or dependency endpoint). Mirrors the thunk's central
// pruning inside the turn; the caller hears about it through the same
// full-state event ops use.
export function prunePrecedenceAgainstForest(state: TurnState): void {
  const pruned = pruneDraftPrecedence(state.workingPrecedence, state.workingForest);
  if (pruned.changed) {
    state.workingPrecedence = pruned.state;
    state.send("precedence", state.workingPrecedence);
  }
  const habitPruned = pruneDraftHabits(state.workingHabits, state.workingForest);
  if (habitPruned.changed) {
    state.workingHabits = habitPruned.state;
    state.send("habits", state.workingHabits);
  }
}
