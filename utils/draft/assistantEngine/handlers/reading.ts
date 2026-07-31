import type Anthropic from "@anthropic-ai/sdk";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import { searchDraftItems } from "@/utils/draft/draftForestOps";
import { MAX_SEARCH_RESULTS, MAX_TREES_PER_FETCH } from "../constants";
import { parseGoalIds } from "../helpers";
import { getGoal, type TurnState } from "../turnState";

function executeGetGoalTrees(state: TurnState, input: unknown): string {
  const ids = parseGoalIds(input).slice(0, MAX_TREES_PER_FETCH);
  const trees: DraftNode[] = [];
  const missingIds: string[] = [];
  for (const id of ids) {
    const goal = getGoal(state, id);
    if (goal) {
      trees.push(goal);
      state.fetchedGoalIds.add(id);
    } else {
      missingIds.push(id);
    }
  }
  return JSON.stringify({ trees, missingIds });
}

export function handleGetGoalTrees(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  state.send("status", { tool: tu.name, count: parseGoalIds(tu.input).length });
  return executeGetGoalTrees(state, tu.input);
}

export function handleSearchItems(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const input = tu.input as Record<string, unknown>;
  state.send("status", { tool: tu.name, count: 1 });
  const query = typeof input?.query === "string" ? input.query : "";
  return JSON.stringify({
    hits: searchDraftItems(state.workingForest, query, MAX_SEARCH_RESULTS),
  });
}
