import type Anthropic from "@anthropic-ai/sdk";
import { draftHabitsStateEqual } from "@/utils/draft/draftHabits";
import {
  addDraftHabitBuckets,
  addDraftHabitItems,
  addDraftHabits,
  deleteDraftHabitBuckets,
  deleteDraftHabits,
  removeDraftHabitItems,
  updateDraftHabitBuckets,
  updateDraftHabits,
  type DraftHabitBucketUpdate,
  type DraftHabitOpsResult,
  type DraftHabitUpdate,
} from "@/utils/draft/draftHabitOps";
import { MAX_OP_ITEMS } from "../constants";
import { parseStringArray } from "../helpers";
import type { TurnState } from "../turnState";

// Habit sibling — same full-state contract as templates/windows/precedence.
function applyHabitOpResult(
  state: TurnState,
  result: DraftHabitOpsResult,
  appliedVerb: string,
): string {
  const changed = !draftHabitsStateEqual(state.workingHabits, result.state);
  state.workingHabits = result.state;
  if (changed) {
    state.send("habits", state.workingHabits);
  }
  const parts: string[] = [];
  if (changed) {
    parts.push(
      `${appliedVerb} — the user sees it as a pending change on the Habits tab.`,
    );
  }
  if (result.failures.length > 0) {
    parts.push(
      `Failed: ${result.failures
        .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
        .join("; ")}.`,
    );
  }
  return parts.join(" ") || "Nothing changed.";
}

export function handleAddHabitBuckets(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.buckets) ? input.buckets : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  const result = addDraftHabitBuckets(state.workingHabits, items);
  const mintedNote =
    result.added.length > 0
      ? ` Assigned ids: ${result.added
          .map((b) => `"${b.name}" = ${b.id}`)
          .join(", ")}.`
      : "";
  return (
    applyHabitOpResult(state, result, `Created ${result.added.length} bucket(s)`) +
    mintedNote
  );
}

export function handleUpdateHabitBuckets(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftHabitBucketUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  return applyHabitOpResult(
    state,
    updateDraftHabitBuckets(state.workingHabits, updates),
    `Updated ${updates.length} bucket(s)`,
  );
}

export function handleDeleteHabitBuckets(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const bucketIds = parseStringArray(input?.bucketIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: bucketIds.length });
  return applyHabitOpResult(
    state,
    deleteDraftHabitBuckets(state.workingHabits, bucketIds),
    `Deleted ${bucketIds.length} bucket(s) (their habits are now unsorted)`,
  );
}

export function handleAddHabits(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.habits) ? input.habits : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  const result = addDraftHabits(
    state.workingHabits,
    items,
    state.workingForest,
    state.recurringPlanIdSet,
  );
  const mintedNote =
    result.added.length > 0
      ? ` Assigned ids: ${result.added
          .map((h) => `"${h.name}" = ${h.id}`)
          .join(", ")}.`
      : "";
  return (
    applyHabitOpResult(state, result, `Created ${result.added.length} habit(s)`) +
    mintedNote
  );
}

export function handleUpdateHabits(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftHabitUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  return applyHabitOpResult(
    state,
    updateDraftHabits(
      state.workingHabits,
      updates,
      state.workingForest,
      state.recurringPlanIdSet,
    ),
    `Updated ${updates.length} habit(s)`,
  );
}

export function handleDeleteHabits(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const habitIds = parseStringArray(input?.habitIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: habitIds.length });
  return applyHabitOpResult(
    state,
    deleteDraftHabits(state.workingHabits, habitIds),
    `Deleted ${habitIds.length} habit(s)`,
  );
}

export function handleAddHabitItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const itemIds = parseStringArray(input?.itemIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: itemIds.length });
  return applyHabitOpResult(
    state,
    addDraftHabitItems(
      state.workingHabits,
      {
        habitId: typeof input?.habitId === "string" ? input.habitId : "",
        itemIds,
      },
      state.workingForest,
      state.recurringPlanIdSet,
    ),
    `Added ${itemIds.length} tracked item(s)`,
  );
}

export function handleRemoveHabitItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const itemIds = parseStringArray(input?.itemIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: itemIds.length });
  return applyHabitOpResult(
    state,
    removeDraftHabitItems(state.workingHabits, {
      habitId: typeof input?.habitId === "string" ? input.habitId : "",
      itemIds,
    }),
    `Removed ${itemIds.length} tracked item(s)`,
  );
}
