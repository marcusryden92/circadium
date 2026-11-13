import type { Planner } from "@/types/prisma";
import { plannerTreeToJson, type DraftNode } from "./plannerTreeToJson";

export interface DraftForest {
  goals: DraftNode[];
}

// The full working set sent to the assistant: every triaged top-level row and
// its subtree (recurring tasks and goals included — the recurrence rule rides
// the node contract). Untriaged rows are Capture-inbox jots — noise for
// planning — and the apply path leaves them untouched. The apply path's
// deletion set must mirror this filter exactly, or an excluded row reads as a
// deleted root. Top-level order is not semantic; goals match by id everywhere
// downstream.
export function plannerForestToJson(planner: Planner[]): DraftForest {
  const roots = planner.filter((p) => !p.parentId && p.isTriaged);
  return {
    goals: roots
      .map((root) => plannerTreeToJson(planner, root.id))
      .filter((goal): goal is DraftNode => goal !== null),
  };
}
