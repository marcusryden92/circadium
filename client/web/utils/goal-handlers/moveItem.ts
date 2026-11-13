import {
  Planner,
  PlannerType,
  Queue,
  PlannerDependency,
} from "@/types/prisma";

import {
  getRootParentId,
  getSubtasksById,
  getTaskTreeIds,
} from "@/utils/goalPageHandlers";
import {
  insertKeyAt,
  sortSiblings,
} from "@/utils/goal-handlers/sortOrderKeys";
import { validateSubtreeOrder } from "@/utils/precedence/findCycle";
import { describeCycle } from "@/utils/precedence/describeCycle";

import { ClickedItem } from "@/lib/taskItem";
import { historyMessages } from "@/utils/historyMessages";

type UpdatePlannerArray = (
  planner: Planner[] | ((prev: Planner[]) => Planner[]),
  label: string,
) => void;

// With node-level dependency edges, a reorder can close a loop through TWO
// goals' internal step orders even though every edge is individually legal.
// Callers pass this guard so the proposed array is validated before dispatch;
// the check short-circuits when the touched subtree carries no node-edge
// endpoint (the common case).
export interface MovePrecedenceGuard {
  queues: Queue[];
  dependencies: PlannerDependency[];
  onRefused?: (message: string) => void;
}

interface MoveToEdgeProps {
  planner: Planner[];
  updatePlannerArray: UpdatePlannerArray;
  currentlyClickedItem: ClickedItem;
  targetId: string;
  mouseLocationInItem: "top" | "bottom";
  precedence?: MovePrecedenceGuard;
}

// Drop on a TaskDivider: the moved subtree becomes a sibling of the target,
// placed just before ("top") or after ("bottom") it. Only the moved root row
// changes, unless the neighboring keys forced a sibling-group reindex.
// Returns true when a move was actually dispatched.
export function moveToEdge({
  planner,
  updatePlannerArray,
  currentlyClickedItem,
  targetId,
  mouseLocationInItem,
  precedence,
}: MoveToEdgeProps): boolean {
  if (!planner || !currentlyClickedItem || !targetId) return false;
  if (targetId === currentlyClickedItem.taskId) return false;

  const movedTask = planner.find((t) => t.id === currentlyClickedItem.taskId);
  const targetTask = planner.find((t) => t.id === targetId);
  if (!movedTask || !targetTask) return false;

  // A subtree can't be moved into itself.
  if (getTaskTreeIds(planner, movedTask.id).includes(targetId)) return false;

  const siblingPool = targetTask.parentId
    ? getSubtasksById(planner, targetTask.parentId)
    : planner.filter((t) => !t.parentId);
  const siblings = sortSiblings(
    siblingPool.filter((t) => t.id !== movedTask.id),
  );
  const targetIndex = siblings.findIndex((t) => t.id === targetId);
  if (targetIndex === -1) return false;

  const insertIndex =
    mouseLocationInItem === "top" ? targetIndex : targetIndex + 1;
  const { key, reindexed } = insertKeyAt(siblings, insertIndex);

  return commitMove(
    planner,
    movedTask.id,
    targetTask.parentId ?? null,
    key,
    reindexed,
    updatePlannerArray,
    historyMessages.item.reorder(movedTask.title),
    precedence,
  );
}

interface MoveToMiddleProps {
  planner: Planner[];
  updatePlannerArray: UpdatePlannerArray;
  currentlyClickedItem: ClickedItem;
  currentlyHoveredItem: string;
  precedence?: MovePrecedenceGuard;
}

// Drop into an item: the moved subtree becomes the target's last child —
// matching addSubtask's append, and keeping repeated drag-ins in drag order.
// Returns true when a move was actually dispatched.
export function moveToMiddle({
  planner,
  updatePlannerArray,
  currentlyClickedItem,
  currentlyHoveredItem,
  precedence,
}: MoveToMiddleProps): boolean {
  if (!planner || !currentlyClickedItem || !currentlyHoveredItem) return false;
  if (currentlyClickedItem.taskId === currentlyHoveredItem) return false;

  const movedTask = planner.find((t) => t.id === currentlyClickedItem.taskId);
  const targetTask = planner.find((t) => t.id === currentlyHoveredItem);
  if (!movedTask || !targetTask) return false;

  if (movedTask.parentId === targetTask.id) return false;
  if (getTaskTreeIds(planner, movedTask.id).includes(targetTask.id))
    return false;

  const children = sortSiblings(
    getSubtasksById(planner, targetTask.id).filter(
      (t) => t.id !== movedTask.id,
    ),
  );
  const { key, reindexed } = insertKeyAt(children, children.length);

  return commitMove(
    planner,
    movedTask.id,
    targetTask.id,
    key,
    reindexed,
    updatePlannerArray,
    historyMessages.item.move(movedTask.title),
    precedence,
  );
}

// Removing a subtree from its old root cannot create a cycle (the remaining
// chain reconnects), so validating the DESTINATION root covers both same-root
// reorders and cross-root reparents.
function commitMove(
  planner: Planner[],
  movedId: string,
  parentId: string | null,
  key: number,
  reindexed: Map<string, number> | null,
  updatePlannerArray: UpdatePlannerArray,
  label: string,
  precedence?: MovePrecedenceGuard,
): boolean {
  const proposed = applyMove(planner, movedId, parentId, key, reindexed);
  const rootId = getRootParentId(proposed, movedId) ?? movedId;
  if (precedence) {
    const cycle = validateSubtreeOrder(
      proposed,
      precedence.queues,
      precedence.dependencies,
      rootId,
    );
    if (cycle) {
      precedence.onRefused?.(
        `That order would create a loop: ${describeCycle(cycle, proposed, precedence.queues)}`,
      );
      return false;
    }
  }
  updatePlannerArray(inheritRootColor(proposed, movedId, rootId), label);
  return true;
}

// A goal and its subtasks read as one block on the calendar, so a subtree
// nested under a new root adopts that root's color.
function inheritRootColor(
  planner: Planner[],
  movedId: string,
  rootId: string,
): Planner[] {
  if (rootId === movedId) return planner;
  const rootColor = planner.find((p) => p.id === rootId)?.color;
  if (!rootColor) return planner;
  const treeIds = new Set(getTaskTreeIds(planner, movedId));
  const now = new Date().toISOString();
  return planner.map((p) =>
    treeIds.has(p.id) && p.color !== rootColor
      ? { ...p, color: rootColor, updatedAt: now }
      : p,
  );
}

// A task that gains a child stops scheduling as its own block, so the new
// parent is retyped to goal — matching addSubtask's goal-typed mints.
function applyMove(
  planner: Planner[],
  movedId: string,
  parentId: string | null,
  key: number,
  reindexed: Map<string, number> | null,
): Planner[] {
  return planner.map((t) => {
    if (t.id === movedId) return { ...t, parentId, sortOrder: key };
    if (t.id === parentId && t.plannerType === PlannerType.task)
      return { ...t, plannerType: PlannerType.goal };
    const re = reindexed?.get(t.id);
    return re !== undefined && re !== t.sortOrder ? { ...t, sortOrder: re } : t;
  });
}
