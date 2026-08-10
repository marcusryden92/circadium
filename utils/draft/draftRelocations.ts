import type { Planner, PlannerDependency, Queue } from "@/types/prisma";
import { promoteSubtree } from "@/utils/goal-handlers/promoteSubtree";
import { demoteRootIntoGoal } from "@/utils/goal-handlers/demoteRootIntoGoal";
import { fallbackCalendarColor } from "@/utils/colorUtils";
import { plannerTreeToJson, type DraftNode } from "./plannerTreeToJson";
import type { DraftForest } from "./plannerForestToJson";

// Sanctioned moves across the draft-contract boundary. The forest contract
// deliberately re-mints any id that crosses a root boundary (a nested id
// surfacing as a root, or vice versa) — identity-preserving promote/demote
// and inbox triage therefore travel as an ordered side-channel of relocation
// records. The ops mirror the move on the working forest for display and
// model reasoning; at Save the records replay on the CANONICAL planner array
// through the app's own helpers FIRST, so the regular forest apply then sees
// every id exactly where the working forest says it is.
export type DraftRelocation =
  | { kind: "promote"; itemId: string }
  | { kind: "demote"; itemId: string; targetRootId: string }
  | { kind: "triage"; itemId: string };

export interface RelocationReplayFailure {
  relocation: DraftRelocation;
  error: string;
}

// Replay the records in the order the ops made them (order is semantic:
// demote-then-promote round-trips). A record whose itemId matches no
// canonical row is a draft-id relocation — skipped silently, because the
// regular apply already handles it correctly (a draft node is minted wherever
// the working forest holds it). Real failures (a helper refusal on canonical
// data — possible only via concurrent edits mid-conversation) are reported so
// the caller can revert the working forest for that item.
export function replayDraftRelocations({
  planner,
  relocations,
  queues,
  dependencies,
  now,
}: {
  planner: Planner[];
  relocations: DraftRelocation[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  now: string;
}): { planner: Planner[]; failures: RelocationReplayFailure[] } {
  let current = planner;
  const failures: RelocationReplayFailure[] = [];

  for (const relocation of relocations) {
    const row = current.find((p) => p.id === relocation.itemId);
    if (!row) continue;

    if (relocation.kind === "promote") {
      const result = promoteSubtree(current, relocation.itemId);
      if ("error" in result) {
        failures.push({ relocation, error: result.error });
      } else {
        current = result;
      }
    } else if (relocation.kind === "demote") {
      if (!current.some((p) => p.id === relocation.targetRootId)) continue;
      const result = demoteRootIntoGoal(
        current,
        relocation.itemId,
        relocation.targetRootId,
        queues,
        dependencies,
      );
      if ("error" in result) {
        failures.push({ relocation, error: result.error });
      } else {
        current = result;
      }
    } else {
      if (row.isTriaged) continue;
      current = current.map((p) =>
        p.id === relocation.itemId
          ? {
              ...p,
              isTriaged: true,
              // Inbox jots are uncolored; give the row a real color the same
              // way every other create surface does (the model may recolor).
              color: p.color || fallbackCalendarColor(p.id),
              updatedAt: now,
            }
          : p,
      );
    }
  }

  return { planner: current, failures };
}

function removeNodeById(nodes: DraftNode[], id: string): DraftNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNodeById(n.children, id) }));
}

// A failed demote leaves the working forest claiming the item is nested while
// the canonical array still holds it as a root — the regular apply would then
// both duplicate it under the target AND delete nothing. Revert the working
// forest for that item: splice it out of wherever it sits and restore its
// canonical tree as a root. Failed promotes need no fixup (the only refusals
// are draft ids — skipped upstream — or shapes the op layer already refused).
export function revertFailedRelocations(
  workingForest: DraftForest,
  failures: RelocationReplayFailure[],
  plannerBase: Planner[],
): DraftForest {
  let goals = workingForest.goals;
  for (const failure of failures) {
    if (failure.relocation.kind !== "demote") continue;
    const id = failure.relocation.itemId;
    goals = removeNodeById(goals, id);
    const canonical = plannerTreeToJson(plannerBase, id);
    if (canonical) goals = [...goals, canonical];
  }
  return goals === workingForest.goals ? workingForest : { goals };
}
