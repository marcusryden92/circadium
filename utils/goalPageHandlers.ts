import { Planner, SimpleEvent, Category, PlannerType } from "@/types/prisma";
import { v4 as uuidv4 } from "uuid";
import { calendarColors } from "@/data/calendarColors";
import { plannerIsCompleted } from "@/utils/plannerCompletion";

import {
  appendKey,
  compareSiblings,
} from "@/utils/goal-handlers/sortOrderKeys";

interface AddSubtaskInterface {
  userId?: string;
  planner: Planner[];
  updatePlannerArray: (
    planner: Planner[] | ((prev: Planner[]) => Planner[]),
  ) => void;
  task: Planner;
  taskDuration: number;
  taskTitle: string;
  resetTaskState: () => void;
}

export function addSubtask({
  userId,
  planner,
  updatePlannerArray,
  task,
  taskDuration,
  taskTitle,
  resetTaskState,
}: AddSubtaskInterface): string | undefined {
  const newId = uuidv4();
  const now = new Date();

  if (userId && taskDuration && taskTitle) {
    // Readiness cascades from the root: a subtree is ready or unready as one.
    const rootId = getRootParentId(planner, task.id);
    const rootItem = rootId ? planner.find((p) => p.id === rootId) : undefined;

    const newTask: Planner = {
      title: taskTitle,
      id: newId,
      parentId: task.id || null,
      plannerType: PlannerType.goal,
      isReady: rootItem?.isReady ?? false,
      isTriaged: true,
      duration: taskDuration < 15 ? 15 : taskDuration,
      deadline: null,
      starts: null,
      recurrence: null,
      recurrenceExceptions: null,
      splitting: null,
      completedSegments: null,
      maxMinutesPerDay: null,
      earliestStartDate: null,
      allowedTimes: null,
      linkedItemId: null,
      notes: null,
      sortOrder: appendKey(getSubtasksById(planner, task.id)),
      completedStartTime: null,
      completedEndTime: null,
      priority: Number(task.priority),
      color: (task?.color as string) || calendarColors[0],
      userId,
      locationId: null,
      useParentLocation: true,
      categoryId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // A task that gains a child stops scheduling as its own block — retype
    // the parent to goal so the subtree behaves like one.
    const nextPlanner =
      task.plannerType === PlannerType.task
        ? planner.map((p) =>
            p.id === task.id ? { ...p, plannerType: PlannerType.goal } : p,
          )
        : planner;

    updatePlannerArray([...nextPlanner, newTask]);
    resetTaskState();
    return newId;
  }
  return undefined;
}

interface DuplicateSubtreeInterface {
  planner: Planner[];
  taskId: string;
}

// Clone a subtask and all of its descendants with fresh IDs. Descendants keep
// their sortOrder (relative order clones for free); the copy's root is
// appended after the last sibling.
export function duplicateSubtree({
  planner,
  taskId,
}: DuplicateSubtreeInterface): {
  newPlanner: Planner[];
  newRootId: string;
} | null {
  const original = planner.find((p) => p.id === taskId);
  if (!original || !original.parentId) return null;

  const tree = getGoalTree(planner, taskId);
  if (tree.length === 0) return null;

  const now = new Date().toISOString();
  const idMap = new Map<string, string>();
  for (const t of tree) idMap.set(t.id, uuidv4());

  const rootSortOrder = appendKey(getSubtasksById(planner, original.parentId));

  const newTasks: Planner[] = tree.map((t) => {
    const isRoot = t.id === taskId;
    const newId = idMap.get(t.id)!;
    const parentId = isRoot
      ? original.parentId
      : t.parentId && idMap.has(t.parentId)
        ? idMap.get(t.parentId)!
        : t.parentId;
    return {
      ...t,
      id: newId,
      parentId,
      sortOrder: isRoot ? rootSortOrder : t.sortOrder,
      title: t.title,
      completedStartTime: null,
      completedEndTime: null,
      createdAt: now,
      updatedAt: now,
    };
  });

  const newRootId = idMap.get(taskId)!;
  return { newPlanner: [...planner, ...newTasks], newRootId };
}

interface DeleteGoalInterface {
  updateAll: (
    arg: Planner[] | ((prev: Planner[]) => Planner[]),
    manuallyUpdatedCalendar?: SimpleEvent[],
  ) => void;
  taskId: string;
  manuallyUpdatedCalendar?: SimpleEvent[];
}

export function deleteGoal({
  updateAll,
  taskId,
  manuallyUpdatedCalendar,
}: DeleteGoalInterface) {
  updateAll((planner: Planner[]) => {
    // Get goal-tree (all IDs under the goal to be deleted)
    const treeIds: string[] = getTaskTreeIds(planner, taskId);

    // Find the root parent
    const rootParent = getRootParentId(planner, taskId);

    // Filter out the tasks to be deleted
    let newTaskArray = planner.filter((t) => !treeIds.includes(t.id));

    // Check if root becomes empty
    if (rootParent && rootParent !== taskId) {
      const rootSubtasks = getSubtasksById(newTaskArray, rootParent);
      if (rootSubtasks.length === 0) {
        // Update the root parent's isReady property
        newTaskArray = newTaskArray.map((t) =>
          t.id === rootParent ? { ...t, isReady: false } : t,
        );
      }
    }

    return newTaskArray;
  }, manuallyUpdatedCalendar);
}

// CHECK IF GOAL IS READY
export const checkGoalForCompletion = (
  planner: Planner[],
  parentId: string,
): boolean => {
  const currentGoal = planner.find((t) => t.id === parentId); // Find current goal using parentId
  const subtasks = getSubtasksById(planner, parentId); // Get subtasks from the current goal's ID

  if (
    currentGoal &&
    subtasks &&
    subtasks.length > 1 &&
    currentGoal.deadline !== undefined
  ) {
    return true;
  }

  return false;
};

// GET GOAL SUBTASKS FROM GOAL ID
export function getSubtasksById(planner: Planner[], id: string): Planner[] {
  const subtasks = planner.filter((task) => task.parentId === id);
  return subtasks;
}

// Children are sorted by sortOrder when the tree index is built, so the
// depth-first bottom layer is already in schedule order. Kept as a separate
// export because the name documents intent at the engine call sites.
export function getSortedTreeBottomLayer(
  planner: Planner[],
  id: string,
): Planner[] {
  return getTreeBottomLayer(planner, id);
}

// Detour-aware leaf enumeration for the SCHEDULER only. Walks the tree in DFS
// order like the bottom layer, but a node carrying `linkedItemId` is a
// redirect: its own duration is ignored and the linked target's scheduled
// sequence is spliced in at that position (children added under a placeholder
// still schedule, after the splice). The splice is transparent for unready or
// completed targets — the readiness gate is universal and completed work never
// reschedules — so the chain simply flows through the placeholder. A TASK
// entry (walk root or redirect target) contributes its own block; its children
// are independent candidates, matching how the candidate filter admits tasks
// under non-goal roots. Real leaves are deduped (a target referenced twice
// inside one tree still schedules once) and detour chains are cycle-guarded.
// Kept separate from getTreeBottomLayer so structural walks (deletion, counts)
// never follow links — a host delete must not delete the linked target, and
// progress counts must not double.
// `interiorEntry` walks the starting node with INTERIOR semantics — the same
// treatment it gets inside its root's walk (a task-typed branch descends into
// its children instead of standing for its own block). Used by the leaf
// graph's node-anchor registration so an anchor's leaves match what the
// engine actually places for that subtree.
export function getScheduledLeafSequence(
  planner: Planner[],
  id: string,
  followedTargets?: Set<string>,
  interiorEntry = false,
): Planner[] {
  const index = getTreeIndex(planner);
  const result: Planner[] = [];
  const seen = new Set<string>();
  const visitingTargets = new Set<string>();

  const emit = (node: Planner) => {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      result.push(node);
    }
  };

  const follow = (targetId: string) => {
    const target = index.byId.get(targetId);
    if (!target || !shouldFollowDetourLink(target)) return;
    if (visitingTargets.has(targetId)) return;
    followedTargets?.add(targetId);
    visitingTargets.add(targetId);
    walkEntry(targetId);
    visitingTargets.delete(targetId);
  };

  const walkChildren = (nodeId: string) => {
    for (const child of index.childrenByParent.get(nodeId) ?? []) {
      walk(child.id);
    }
  };

  // Sequence entry (the walk root or a redirect target): a task stands for
  // its own block, a goal walks its subtree bottom layer.
  const walkEntry = (nodeId: string) => {
    const node = index.byId.get(nodeId);
    if (!node) return;
    if (node.linkedItemId) {
      follow(node.linkedItemId);
      walkChildren(nodeId);
      return;
    }
    if (node.plannerType === PlannerType.task) {
      emit(node);
      return;
    }
    walk(nodeId);
  };

  // Interior nodes: bottom-layer semantics (childless node is a leaf).
  const walk = (nodeId: string) => {
    const node = index.byId.get(nodeId);
    if (!node) return;
    if (node.linkedItemId) {
      follow(node.linkedItemId);
      walkChildren(nodeId);
      return;
    }
    const children = index.childrenByParent.get(nodeId);
    if (!children || children.length === 0) {
      emit(node);
      return;
    }
    for (const child of children) walk(child.id);
  };

  if (interiorEntry) walk(id);
  else walkEntry(id);
  return result;
}

// The engine follows a detour link only to a target that can actually
// schedule: unready targets are gated out (readiness is the universal
// scheduling gate) and completed targets never reschedule. Both cases are
// transparent — the host chain flows through the placeholder.
export function shouldFollowDetourLink(target: Planner): boolean {
  return target.isReady === true && !plannerIsCompleted(target);
}

// Root planner ids referenced by any placeholder's linkedItemId. Used for
// target-level bookkeeping (reverse views, leaf-graph outcome tracking) —
// candidacy exclusion instead derives from the ACTIVE candidates' walks via
// getScheduledLeafSequence's followedTargets, so a target whose only host is
// completed/unready schedules independently.
export function collectLinkedTargetIds(planner: Planner[]): Set<string> {
  const targets = new Set<string>();
  for (const p of planner) {
    if (p.linkedItemId) targets.add(p.linkedItemId);
  }
  return targets;
}

// GET GOAL ROOT PARENT
export function getRootParentId(
  planner: Planner[],
  id: string,
): string | undefined {
  // Find the task by its id
  const task = planner.find((task) => task.id === id);

  if (!task) {
    return undefined;
  }

  // If task is not found or it has no parentId, return the task itself (root task)
  if (!task.parentId) {
    return task.id;
  }

  // Recursively find the root parent by looking at the parentId
  return getRootParentId(planner, task.parentId);
}

// Memoized tree index, keyed on planner-array identity. Safe because planner
// updates are immutable everywhere (Redux + handler copies produce fresh
// arrays); an in-place mutation of an existing array would serve stale trees.
type PlannerTreeIndex = {
  byId: Map<string, Planner>;
  childrenByParent: Map<string, Planner[]>;
  bottomLayer: Map<string, Planner[]>;
};

const treeIndexCache = new WeakMap<Planner[], PlannerTreeIndex>();

function getTreeIndex(planner: Planner[]): PlannerTreeIndex {
  let index = treeIndexCache.get(planner);
  if (index) return index;

  const byId = new Map<string, Planner>();
  const childrenByParent = new Map<string, Planner[]>();
  for (const task of planner) {
    byId.set(task.id, task);
    if (task.parentId) {
      const siblings = childrenByParent.get(task.parentId);
      if (siblings) siblings.push(task);
      else childrenByParent.set(task.parentId, [task]);
    }
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort(compareSiblings);
  }

  index = {
    byId,
    childrenByParent,
    bottomLayer: new Map(),
  };
  treeIndexCache.set(planner, index);
  return index;
}

function bottomLayerOf(index: PlannerTreeIndex, id: string): Planner[] {
  const cached = index.bottomLayer.get(id);
  if (cached) return cached;

  const children = index.childrenByParent.get(id);
  let result: Planner[];
  if (!children || children.length === 0) {
    const self = index.byId.get(id);
    result = self ? [self] : [];
  } else {
    result = [];
    for (const child of children) {
      for (const leaf of bottomLayerOf(index, child.id)) result.push(leaf);
    }
  }

  index.bottomLayer.set(id, result);
  return result;
}

// GET BOTTOM (ACTIONABLE) LAYER OF GOAL
export function getTreeBottomLayer(planner: Planner[], id: string): Planner[] {
  // Slice so callers can't mutate the cached array.
  return bottomLayerOf(getTreeIndex(planner), id).slice();
}

// GET ALL IDs IN THE TREE
export function getTaskTreeIds(planner: Planner[], id: string): string[] {
  const index = getTreeIndex(planner);
  const ids: string[] = [];
  const walk = (nodeId: string) => {
    ids.push(nodeId);
    const children = index.childrenByParent.get(nodeId);
    if (children) for (const child of children) walk(child.id);
  };
  walk(id);
  return ids;
}

export function getCompleteTaskTreeIds(
  planner: Planner[],
  id: string,
): string[] {
  const task = planner.find((task) => task.id === id);

  if (!task?.parentId) {
    return getTaskTreeIds(planner, id);
  } else {
    const rootParent = getRootParentId(planner, id);
    return rootParent ? getTaskTreeIds(planner, rootParent) : [];
  }
}

// GET ALL TASKS IN THE TREE
export function getGoalTree(planner: Planner[], id: string): Planner[] {
  const index = getTreeIndex(planner);
  const tasks: Planner[] = [];
  const walk = (nodeId: string) => {
    const node = index.byId.get(nodeId);
    if (node) tasks.push(node);
    const children = index.childrenByParent.get(nodeId);
    if (children) for (const child of children) walk(child.id);
  };
  walk(id);
  return tasks;
}

// `queueCategoryByRootId` (buildQueueCategoryByRootId) resolves the queue's
// inherited default when the parent-chain walk finds no own category — so UI
// badges agree with the engine's applyQueueCategoryInheritance.
export function getEffectiveCategoryId(
  planner: Planner[],
  id: string,
  queueCategoryByRootId?: Map<string, string>,
): string | null {
  const visited = new Set<string>();
  let currentId: string | null = id;
  let rootId: string = id;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const task = planner.find((t) => t.id === currentId);
    if (!task) break;

    if (task.categoryId) return task.categoryId;
    rootId = task.id;
    currentId = task.parentId;
  }

  return queueCategoryByRootId?.get(rootId) ?? null;
}

export interface InheritedLocationInfo {
  locationName: string;
  fromLabel: string;
}

/**
 * Build a map of planner ID -> InheritedLocationInfo for all planners.
 * Computed once and shared via context so each component just reads from it.
 */
export function buildInheritedLocationMap(
  planners: Planner[],
  categories: Category[],
  locations: { id: string; name: string }[],
  queueCategoryByRootId?: Map<string, string>,
): Map<string, InheritedLocationInfo> {
  const result = new Map<string, InheritedLocationInfo>();
  const plannerMap = new Map(planners.map((p) => [p.id, p]));
  const findLocation = (id: string) => locations.find((l) => l.id === id);

  for (const planner of planners) {
    // Plan items always use their own location (no inheritance)
    if (planner.plannerType === PlannerType.plan) continue;

    // Walk up parent chain for an ancestor with a custom location
    const visited = new Set<string>();
    let currentId = planner.parentId;
    let info: InheritedLocationInfo | null = null;

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const parent = plannerMap.get(currentId);
      if (!parent) break;
      if (!parent.useParentLocation && parent.locationId) {
        const loc = findLocation(parent.locationId);
        if (loc) {
          info = { locationName: loc.name, fromLabel: parent.title };
          break;
        }
      }
      currentId = parent.parentId;
    }

    if (!info) {
      const effectiveCategoryId = getEffectiveCategoryId(
        planners,
        planner.id,
        queueCategoryByRootId,
      );
      if (effectiveCategoryId) {
        const category = categories.find((c) => c.id === effectiveCategoryId);
        if (category?.locationId) {
          const loc = findLocation(category.locationId);
          if (loc) info = { locationName: loc.name, fromLabel: category.name };
        }
      }
    }

    if (info) result.set(planner.id, info);
  }

  return result;
}
