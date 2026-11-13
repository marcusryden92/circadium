import { v4 as uuidv4 } from "uuid";
import type { DraftNode } from "./plannerTreeToJson";

export interface AssignedDraftRoot {
  id: string;
  title: string;
}

// Stamp draft UUIDs on every id-less node in a model proposal so unsaved
// goals are first-class in the id-keyed pipeline: they appear in the goal
// index with a usable handle, get_goal_trees / the edit ops / replace-by-id /
// deletedGoalIds all work on them, and a later turn revising a draft replaces
// it instead of appending a rebuilt duplicate. Draft ids never reach the
// database: at Save, applyDraftForestToPlanner treats any id that matches no
// canonical row as new and mints the permanent UUIDs.
export function assignDraftIds(goals: DraftNode[]): {
  goals: DraftNode[];
  newRoots: AssignedDraftRoot[];
} {
  const newRoots: AssignedDraftRoot[] = [];
  const stamped = goals.map((goal) => {
    const isNewRoot = goal.id.length === 0;
    const next = stampNode(goal);
    if (isNewRoot) newRoots.push({ id: next.id, title: next.title });
    return next;
  });
  return { goals: stamped, newRoots };
}

function stampNode(node: DraftNode): DraftNode {
  return {
    ...node,
    id: node.id.length > 0 ? node.id : uuidv4(),
    children: node.children.map(stampNode),
  };
}
