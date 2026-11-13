import type { DraftNode } from "./plannerTreeToJson";
import type { DraftForest } from "./plannerForestToJson";
import type { DraftForestProposal } from "./normalizeDraftForest";

// Overlay a (possibly partial) streamed proposal onto the turn-start snapshot
// of the working forest. Called on every SSE tick against the SAME turn-start
// base, so partial re-parses replace rather than compound:
// - proposal goals whose id matches a base root replace it in place
// - unknown/absent ids append as new goals, in proposal order
// - deletedGoalIds drop matching base roots
// - a retained root whose proposed categoryId is null keeps the base value;
//   null means "unspecified", not "clear it" — the contract has no clear op
export function mergeDraftForest(
  base: DraftForest,
  proposal: DraftForestProposal,
): DraftForest {
  const baseById = new Map<string, DraftNode>();
  for (const goal of base.goals) {
    if (goal.id) baseById.set(goal.id, goal);
  }

  const replacedById = new Map<string, DraftNode>();
  const appended: DraftNode[] = [];
  for (const goal of proposal.goals) {
    const baseGoal = goal.id ? baseById.get(goal.id) : undefined;
    if (baseGoal) {
      replacedById.set(goal.id, {
        ...goal,
        categoryId: proposal.trustNullCategoryId
          ? goal.categoryId
          : goal.categoryId ?? baseGoal.categoryId,
        // Same "null means unspecified, keep base" rule as categoryId, unless
        // the tree came from a deterministic edit op (authoritative nulls).
        color: proposal.trustNullCategoryId
          ? goal.color ?? null
          : goal.color ?? baseGoal.color ?? null,
        // A plan's anchor and an item's location get the same protection — a
        // model re-emit that forgets them must not silently unschedule or
        // relocate the item. Clearing goes through update_items (fromOps).
        starts: proposal.trustNullCategoryId
          ? goal.starts ?? null
          : goal.starts ?? baseGoal.starts ?? null,
        locationId: proposal.trustNullCategoryId
          ? goal.locationId ?? null
          : goal.locationId ?? baseGoal.locationId ?? null,
      });
    } else {
      appended.push(goal);
    }
  }

  const deleted = new Set(proposal.deletedGoalIds);
  const goals: DraftNode[] = [];
  for (const goal of base.goals) {
    if (goal.id && deleted.has(goal.id)) continue;
    goals.push(replacedById.get(goal.id) ?? goal);
  }

  return { goals: [...goals, ...appended] };
}

// One model turn can contain several propose_goals calls (the tool-use loop
// feeds results back and the model may continue). Each call streams its own
// partial re-parses keyed by callIndex; folding the latest snapshot of every
// call in order over the same turn-start base keeps calls from clobbering
// each other while keeping each call's own re-parses replace-not-compound.
export function foldDraftProposals(
  base: DraftForest,
  orderedProposals: DraftForestProposal[],
): DraftForest {
  return orderedProposals.reduce(
    (forest, proposal) => mergeDraftForest(forest, proposal),
    base,
  );
}
