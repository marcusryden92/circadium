import type Anthropic from "@anthropic-ai/sdk";
import {
  addDraftDependencies,
  addDraftQueueMembers,
  addDraftQueues,
  deleteDraftQueues,
  moveDraftQueueMember,
  removeDraftDependencies,
  removeDraftQueueMembers,
  updateDraftQueues,
  type DraftPrecedenceOpsResult,
  type DraftQueueUpdate,
} from "@/utils/draft/draftPrecedenceOps";
import { MAX_OP_ITEMS } from "../constants";
import { parseStringArray } from "../helpers";
import { currentCategoryIds, type TurnState } from "../turnState";

// Precedence sibling — same full-state contract as templates/windows. Cycle
// refusals arrive as failures whose reason carries the closing path; the model
// is instructed to relay it in plain words.
function applyPrecedenceOpResult(
  state: TurnState,
  result: DraftPrecedenceOpsResult,
  appliedVerb: string,
): string {
  state.workingPrecedence = result.state;
  if (result.changed) {
    state.send("precedence", state.workingPrecedence);
  }
  const parts: string[] = [];
  if (result.changed) {
    parts.push(
      `${appliedVerb} — the user sees it as a pending change on the Queues tab.`,
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

export function handleAddQueues(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.queues) ? input.queues : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  const before = new Set(state.workingPrecedence.queues.map((q) => q.id));
  const result = addDraftQueues(
    state.workingPrecedence,
    items,
    state.workingForest,
    currentCategoryIds(state),
  );
  const minted = result.state.queues.filter((q) => !before.has(q.id));
  const mintedNote =
    minted.length > 0
      ? ` Assigned ids: ${minted
          .map((q) => `"${q.title}" = ${q.id}`)
          .join(", ")}.`
      : "";
  return (
    applyPrecedenceOpResult(state, result, `Created ${minted.length} queue(s)`) +
    mintedNote
  );
}

export function handleUpdateQueues(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftQueueUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  return applyPrecedenceOpResult(
    state,
    updateDraftQueues(
      state.workingPrecedence,
      updates,
      currentCategoryIds(state),
    ),
    `Updated ${updates.length} queue(s)`,
  );
}

export function handleDeleteQueues(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const queueIds = parseStringArray(input?.queueIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: queueIds.length });
  return applyPrecedenceOpResult(
    state,
    deleteDraftQueues(state.workingPrecedence, queueIds),
    `Deleted ${queueIds.length} queue(s)`,
  );
}

export function handleAddQueueMembers(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const plannerIds = parseStringArray(input?.plannerIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: plannerIds.length });
  return applyPrecedenceOpResult(
    state,
    addDraftQueueMembers(
      state.workingPrecedence,
      {
        queueId: typeof input?.queueId === "string" ? input.queueId : "",
        plannerIds,
        atIndex: typeof input?.atIndex === "number" ? input.atIndex : undefined,
      },
      state.workingForest,
    ),
    `Added ${plannerIds.length} queue member(s)`,
  );
}

export function handleMoveQueueMember(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  state.send("status", { tool: tu.name, count: 1 });
  return applyPrecedenceOpResult(
    state,
    moveDraftQueueMember(
      state.workingPrecedence,
      {
        queueId: typeof input?.queueId === "string" ? input.queueId : "",
        plannerId: typeof input?.plannerId === "string" ? input.plannerId : "",
        toIndex: typeof input?.toIndex === "number" ? input.toIndex : Number.NaN,
      },
      state.workingForest,
    ),
    "Moved the queue member",
  );
}

export function handleRemoveQueueMembers(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const plannerIds = parseStringArray(input?.plannerIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: plannerIds.length });
  return applyPrecedenceOpResult(
    state,
    removeDraftQueueMembers(state.workingPrecedence, plannerIds),
    `Removed ${plannerIds.length} queue member(s)`,
  );
}

export function handleAddDependencies(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (
    Array.isArray(input?.dependencies) ? input.dependencies : []
  ).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: items.length });
  return applyPrecedenceOpResult(
    state,
    addDraftDependencies(state.workingPrecedence, items, state.workingForest),
    `Added ${items.length} dependenc${items.length === 1 ? "y" : "ies"}`,
  );
}

export function handleRemoveDependencies(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (
    Array.isArray(input?.dependencies) ? input.dependencies : []
  ).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: items.length });
  return applyPrecedenceOpResult(
    state,
    removeDraftDependencies(state.workingPrecedence, items),
    `Removed ${items.length} dependenc${items.length === 1 ? "y" : "ies"}`,
  );
}
