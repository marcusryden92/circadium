import type { Planner } from "@/types/prisma";
import { plannerTreeToJson, type DraftNode } from "./plannerTreeToJson";

export interface DraftForest {
  goals: DraftNode[];
}

// The full working set sent to the assistant: every triaged top-level row and
// its subtree. Untriaged rows are Capture-inbox jots — noise for planning —
// and the apply path leaves them untouched. Habits are excluded too: the
// assistant can't author them (the draft contract has no cadence/window
// fields), and a habit round-tripped as a goal would silently retype to a task
// on save (resolveRetainedRootType) and orphan its completion log. The apply
// path's deletion set must exclude habits by the SAME rule, or an untouched
// habit reads as a deleted root. Top-level order is not semantic; goals match
// by id everywhere downstream.
export function plannerForestToJson(planner: Planner[]): DraftForest {
  const roots = planner.filter(
    (p) => !p.parentId && p.isTriaged && p.plannerType !== "habit",
  );
  return {
    goals: roots
      .map((root) => plannerTreeToJson(planner, root.id))
      .filter((goal): goal is DraftNode => goal !== null),
  };
}
