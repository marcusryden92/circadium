import type Anthropic from "@anthropic-ai/sdk";
import {
  addDraftItems,
  deleteDraftItems,
  moveDraftItem,
  updateDraftItems,
  type DraftItemUpdate,
  type DraftOpsResult,
} from "@/utils/draft/draftForestOps";
import { MAX_OP_ITEMS } from "../constants";
import { parseStringArray } from "../helpers";
import {
  currentCategoryIds,
  getGoal,
  prunePrecedenceAgainstForest,
  type TurnState,
} from "../turnState";

// Adopt an edit-tool result: advance the working copy, mirror changed goals to
// the caller through the same forest-event path proposals use (fromOps marks
// the trees as code-computed — the caller merge then trusts null categoryId as
// an intentional clear rather than backfilling it), and summarize for the
// model's tool_result.
export function applyOpResult(
  state: TurnState,
  result: DraftOpsResult,
  appliedVerb: string,
): string {
  state.workingForest = result.forest;
  const changed =
    result.updatedRootIds.length > 0 || result.deletedGoalIds.length > 0;
  if (changed) {
    state.send("forest", {
      callIndex: state.proposeCallCounter++,
      goals: result.updatedRootIds
        .map((id) => getGoal(state, id))
        .filter(Boolean),
      deletedGoalIds: result.deletedGoalIds,
      fromOps: true,
    });
    prunePrecedenceAgainstForest(state);
  }
  const parts: string[] = [];
  if (changed) {
    parts.push(`${appliedVerb} — the user sees it as a pending change.`);
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

export function handleUpdateItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const updates = (Array.isArray(input?.updates) ? input.updates : []).slice(
    0,
    MAX_OP_ITEMS,
  ) as DraftItemUpdate[];
  state.send("status", { tool: tu.name, count: updates.length });
  return applyOpResult(
    state,
    updateDraftItems(
      state.workingForest,
      updates,
      currentCategoryIds(state),
      state.validLocationIds,
      state.workingPrecedence,
    ),
    `Updated ${updates.length} item(s)`,
  );
}

export function handleMoveItem(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  state.send("status", { tool: tu.name, count: 1 });
  return applyOpResult(
    state,
    moveDraftItem(
      state.workingForest,
      {
        itemId: typeof input?.itemId === "string" ? input.itemId : "",
        newParentId:
          typeof input?.newParentId === "string" ? input.newParentId : "",
        afterSiblingId:
          typeof input?.afterSiblingId === "string"
            ? input.afterSiblingId
            : undefined,
        atStart: input?.atStart === true,
      },
      state.workingPrecedence,
    ),
    "Moved the item",
  );
}

export function handleAddItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const items = (Array.isArray(input?.items) ? input.items : []).slice(
    0,
    MAX_OP_ITEMS,
  );
  state.send("status", { tool: tu.name, count: items.length });
  return applyOpResult(
    state,
    addDraftItems(state.workingForest, {
      parentId: typeof input?.parentId === "string" ? input.parentId : "",
      items,
      afterSiblingId:
        typeof input?.afterSiblingId === "string"
          ? input.afterSiblingId
          : undefined,
      atStart: input?.atStart === true,
    }),
    `Added ${items.length} item(s) with draft ids (fetch the goal tree to read them)`,
  );
}

export function handleDeleteItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  const itemIds = parseStringArray(input?.itemIds).slice(0, MAX_OP_ITEMS);
  state.send("status", { tool: tu.name, count: itemIds.length });
  return applyOpResult(
    state,
    deleteDraftItems(state.workingForest, itemIds),
    `Deleted ${itemIds.length} item(s)`,
  );
}
