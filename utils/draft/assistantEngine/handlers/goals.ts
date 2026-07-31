import type Anthropic from "@anthropic-ai/sdk";
import { assignDraftIds } from "@/utils/draft/assignDraftIds";
import { normalizeDraftForest } from "@/utils/draft/normalizeDraftForest";
import { mergeDraftForest } from "@/utils/draft/mergeDraftForest";
import {
  filterProposal,
  prunePrecedenceAgainstForest,
  type TurnState,
} from "../turnState";

export function handleProposeGoals(
  state: TurnState,
  tu: Anthropic.ToolUseBlock,
): string {
  const filtered = filterProposal(state, tu.input);
  // Stamp draft ids on the accepted goals, adopt them into the turn's working
  // copy (so same-turn fetches and edit ops see them), and re-emit the stamped
  // proposal under the callIndex its id-less partials streamed with — the
  // caller fold replaces those partials with the final stamped trees.
  const normalized = normalizeDraftForest({
    goals: filtered.goals,
    deletedGoalIds: filtered.deletedGoalIds,
  });
  let assignedNote = "";
  if (normalized) {
    const { goals: stampedGoals, newRoots } = assignDraftIds(normalized.goals);
    state.workingForest = mergeDraftForest(state.workingForest, {
      ...normalized,
      goals: stampedGoals,
    });
    prunePrecedenceAgainstForest(state);
    for (const root of newRoots) {
      // The model authored these trees this turn — no fetch required before
      // revising them.
      state.existingGoalIds.add(root.id);
      state.fetchedGoalIds.add(root.id);
    }
    state.send("forest", {
      callIndex:
        state.proposeCallIndexByToolUseId.get(tu.id) ??
        state.proposeCallCounter++,
      goals: stampedGoals,
      deletedGoalIds: normalized.deletedGoalIds,
      // Lets the caller tell finalized proposals from truncated partials when a
      // stream is aborted.
      complete: true,
    });
    if (newRoots.length > 0) {
      assignedNote = ` New goals were assigned draft ids: ${newRoots
        .map((r) => `"${r.title}" = ${r.id}`)
        .join(
          ", ",
        )}. Draft ids work with every tool; permanent ids replace them when the user saves.`;
    }
  }
  return filtered.rejectedIds.length > 0
    ? `Proposal received, EXCEPT these goals were REJECTED because you have not fetched their trees this message: ${filtered.rejectedIds.join(", ")}. Call get_goal_trees for them, then re-propose only those goals.`
    : `Proposal received. The user sees it as a pending diff; do not repeat it.${assignedNote}`;
}
