import { v4 as uuidv4 } from "uuid";
import type { Planner, PlannerDependency } from "@/types/prisma";
import { PlannerType } from "@/generated/client";
import { getTaskTreeIds } from "@/utils/goalPageHandlers";
import { SORT_ORDER_STEP } from "@/utils/goal-handlers/sortOrderKeys";
import { dependencyReadyBlockers } from "@/utils/precedence/readinessBlockers";
import { plannerTreeToJson, type DraftNode } from "./plannerTreeToJson";
import type { DraftForest } from "./plannerForestToJson";
import { draftTreesEqual } from "./diffDraftTree";
import { fallbackCalendarColor, isHexColor } from "@/utils/colorUtils";
import { serializeTaskSplitting } from "@/utils/taskSplitting";

// Splitting rides the full-tree contract like deadline/priority: the node's
// value (null when absent) becomes the row value. completedSegments is never
// part of the draft contract — retained rows keep theirs untouched.
function splittingColumn(node: DraftNode): string | null {
  return node.splitting ? serializeTaskSplitting(node.splitting) : null;
}

// The daily limit rides top-level goal roots only, splitting-style null
// semantics: the node's value (null when absent) becomes the row value, so a
// retained goal re-emitted without it clears it. Non-goal roots and all
// descendants stamp null.
function goalDayCapColumn(
  node: DraftNode,
  rootType: PlannerType,
): number | null {
  if (rootType !== PlannerType.goal) return null;
  const cap = node.maxMinutesPerDay;
  return typeof cap === "number" && Number.isFinite(cap) && cap > 0
    ? Math.floor(cap)
    : null;
}

// Readiness the apply layer stamps across a whole subtree — it cascades from
// the root, matching the manual toggle and the create defaults. A task/plan
// root is ready unless the assistant explicitly set it false; a goal root
// stays gated on subtasks + a deadline, matching the manual "Mark ready".
function resolveAppliedReady(node: DraftNode, rootType: PlannerType): boolean {
  if (rootType === PlannerType.goal) {
    return (
      node.isReady === true &&
      node.children.length > 0 &&
      node.deadline !== null
    );
  }
  return node.isReady !== false;
}

interface ApplyForestArgs {
  planner: Planner[];
  workingForest: DraftForest;
  userId: string;
  // The user's category ids. A model-supplied categoryId outside this set is
  // ignored (existing value kept / null for new roots).
  validCategoryIds: ReadonlySet<string>;
  // Category id -> its hex color, used to color a new goal after its own
  // color and before the deterministic palette fallback. Optional so callers
  // that don't care about coloring can omit it.
  categoryColorById?: ReadonlyMap<string, string | null>;
  // Dependency edges, used to clamp isReady at save time — mirrors the UI's
  // readiness gate for edges the assistant's proposal may conflict with.
  dependencies?: PlannerDependency[];
  // Populated (when provided) with draft id -> minted permanent id at EVERY
  // level: new top-level goals, and any child re-minted on the
  // delete+recreate path. The precedence apply uses it to remap queue
  // members (roots) and node-level dependency endpoints (any level) that
  // reference drafts from the same conversation.
  nodeIdMap?: Map<string, string>;
}

// A new top-level item's color: the model's explicit pick, else its category's
// color, else a deterministic palette color keyed on its id — never the silent
// red default. Cascades to the goal's whole subtree at save time.
function resolveNewRootColor(
  node: DraftNode,
  rootId: string,
  rootCategoryId: string | null,
  categoryColorById: ReadonlyMap<string, string | null> | undefined,
): string {
  if (isHexColor(node.color)) return node.color;
  const categoryColor = rootCategoryId
    ? categoryColorById?.get(rootCategoryId)
    : null;
  if (isHexColor(categoryColor)) return categoryColor;
  return fallbackCalendarColor(rootId);
}

// Reverse of plannerForestToJson: takes the accepted working forest and
// produces the full Planner[] the app should now hold. Applied sequentially —
// deleted roots first (a pure subtree filter), then retained goals (only
// those that actually changed, so untouched goals see zero updatedAt churn),
// then new roots. Sibling order is stamped as fractional sortOrder keys from
// array position. Preserves existing planner UUIDs for retained nodes and
// mints fresh ones for new nodes; that invariant is load-bearing for future
// inter-goal dependencies.
export function applyDraftForestToPlanner({
  planner,
  workingForest,
  userId,
  validCategoryIds,
  categoryColorById,
  dependencies = [],
  nodeIdMap,
}: ApplyForestArgs): Planner[] {
  const now = new Date().toISOString();
  let current = planner;

  // 1. Deleted roots: every triaged top-level row (what plannerForestToJson
  // sent out) whose id no longer appears in the working forest. Habits are
  // never sent, so they must never be considered deleted here — the filter
  // must mirror plannerForestToJson exactly.
  const workingIds = new Set(
    workingForest.goals.map((g) => g.id).filter((id) => id.length > 0),
  );
  const canonicalRootIds = planner
    .filter(
      (p) => !p.parentId && p.isTriaged && p.plannerType !== PlannerType.habit,
    )
    .map((p) => p.id);
  for (const rootId of canonicalRootIds) {
    if (!workingIds.has(rootId)) {
      const treeIds = new Set(getTaskTreeIds(current, rootId));
      current = current.filter((p) => !treeIds.has(p.id));
    }
  }

  // 2 + 3. Retained edits and new roots, in working order. A working goal is
  // "retained" only if its id matches a current top-level row — an id that
  // matches some nested row is out of contract (the model moved a subtree
  // across goals) and is handled safely as a brand-new goal with fresh ids.
  for (const goal of workingForest.goals) {
    const isRetainedRoot =
      goal.id.length > 0 &&
      current.some((p) => p.id === goal.id && !p.parentId);
    if (isRetainedRoot) {
      const canonicalGoal = plannerTreeToJson(current, goal.id);
      if (canonicalGoal && draftTreesEqual(goal, canonicalGoal)) continue;
      current = applyTreeToExistingRoot({
        planner: current,
        rootId: goal.id,
        workingTree: goal,
        userId,
        validCategoryIds,
        now,
        nodeIdMap,
      });
    } else {
      const { rootId, rows } = buildNewRootRows(
        goal,
        userId,
        validCategoryIds,
        categoryColorById,
        now,
        nodeIdMap,
      );
      if (goal.id.length > 0) nodeIdMap?.set(goal.id, rootId);
      current = [...current, ...rows];
    }
  }

  return clampReadinessAgainstDependencies(current, dependencies, now);
}

// Containment clamp: a goal the assistant marked ready may still have an
// unready-goal prerequisite. Mirror the UI gate against the SAVED array (a
// predecessor legitimately readied in this same save doesn't block) and
// un-ready the whole subtree — the cascade keeps readiness a consistent
// whole-tree property. Runs to a fixed point: clamping one goal can newly
// block a goal that depends on it. Terminates because each pass strictly
// shrinks the ready set. Identity-preserving on no-op. Exported so handleSave
// can re-run it after the precedence apply — dependencies the assistant
// created this conversation only exist (with permanent ids) at that point.
export function clampReadinessAgainstDependencies(
  planner: Planner[],
  dependencies: PlannerDependency[],
  now: string,
): Planner[] {
  if (dependencies.length === 0) return planner;
  let current = planner;
  let clampedSomething = true;
  while (clampedSomething) {
    clampedSomething = false;
    for (const root of current) {
      if (root.parentId != null) continue;
      if (root.plannerType !== PlannerType.goal) continue;
      if (root.isReady !== true) continue;
      const blockers = dependencyReadyBlockers(root.id, dependencies, current);
      if (blockers.length === 0) continue;
      const treeIds = new Set(getTaskTreeIds(current, root.id));
      current = current.map((p) =>
        treeIds.has(p.id) ? { ...p, isReady: false, updatedAt: now } : p,
      );
      clampedSomething = true;
      // Restart the scan — the for..of is iterating a stale snapshot now.
      break;
    }
  }
  return current;
}

interface ApplyTreeArgs {
  planner: Planner[];
  rootId: string;
  workingTree: DraftNode;
  userId: string;
  validCategoryIds: ReadonlySet<string>;
  now: string;
  nodeIdMap?: Map<string, string>;
}

// Apply an accepted DraftNode tree onto an existing root. Preserves existing
// planner UUIDs for retained nodes, mints fresh UUIDs for new ones, and
// stamps sibling sortOrder keys from array position.
function applyTreeToExistingRoot({
  planner,
  rootId,
  workingTree,
  userId,
  validCategoryIds,
  now,
  nodeIdMap,
}: ApplyTreeArgs): Planner[] {
  const canonicalById = new Map<string, Planner>(planner.map((p) => [p.id, p]));
  const rootRow = canonicalById.get(rootId);
  if (!rootRow) return planner;

  // Everything inside the root subtree (excluding the root itself). These are
  // the rows we may keep, update, or discard.
  const oldDescendantIds = new Set(
    getTaskTreeIds(planner, rootId).filter((id) => id !== rootId),
  );

  // Root row categoryId: applied only when it names one of the user's
  // categories; null means "unspecified" (mergeDraftForest already backfills
  // retained roots, so a null here keeps the existing value).
  const nextCategoryId =
    workingTree.categoryId && validCategoryIds.has(workingTree.categoryId)
      ? workingTree.categoryId
      : rootRow.categoryId;

  // Root row color: the assistant may recolor a goal (isHexColor gate), else
  // the existing color stands. New descendants added this turn inherit it so
  // the goal stays one color; retained descendants keep their own.
  const nextColor = isHexColor(workingTree.color)
    ? workingTree.color
    : rootRow.color;

  // Readiness cascades from the root across the whole subtree, resolved from
  // the root's (possibly retyped) type.
  const resolvedRootType = resolveRetainedRootType(
    workingTree.plannerType,
    workingTree.children.length > 0,
    rootRow.plannerType,
  );
  const appliedReady = resolveAppliedReady(workingTree, resolvedRootType);

  const newRows: Planner[] = [];

  // Preorder traversal that mints/reuses ids, builds Planner rows, and stamps
  // sibling sortOrder from array position. Descendants never carry their own
  // categoryId — the category lives on the root and the engine/UI resolve it
  // by walking the parent chain — so retained rows are cleared here too,
  // healing rows stamped before that invariant held.
  function processNode(node: DraftNode, parentId: string, sortOrder: number): void {
    const canRetain = node.id.length > 0 && oldDescendantIds.has(node.id);
    const nodeId = canRetain ? node.id : uuidv4();
    if (!canRetain && node.id.length > 0) nodeIdMap?.set(node.id, nodeId);
    const existing = canonicalById.get(nodeId);

    node.children.forEach((child, i) => {
      processNode(child, nodeId, (i + 1) * SORT_ORDER_STEP);
    });

    const row: Planner = existing
      ? {
          ...existing,
          title: node.title,
          plannerType: normalizePlannerType(
            node.plannerType,
            node.children.length > 0,
          ),
          duration: Math.max(1, Math.floor(node.duration)),
          deadline: node.deadline,
          priority: node.priority,
          // Readiness cascades from the root: the subtree is ready or
          // unready as one, matching the manual toggle's semantics.
          isReady: appliedReady,
          parentId,
          sortOrder,
          categoryId: null,
          splitting: splittingColumn(node),
          maxMinutesPerDay: null,
          updatedAt: now,
        }
      : {
          id: nodeId,
          title: node.title,
          parentId,
          plannerType: normalizePlannerType(
            node.plannerType,
            node.children.length > 0,
          ),
          isReady: appliedReady,
          isTriaged: true,
          duration: Math.max(1, Math.floor(node.duration)),
          deadline: node.deadline,
          starts: null,
          recurrence: null,
          recurrenceExceptions: null,
          splitting: splittingColumn(node),
          completedSegments: null,
          maxMinutesPerDay: null,
          earliestStartDate: null,
          allowedTimes: null,
          linkedItemId: null,
          notes: null,
          sortOrder,
          completedStartTime: null,
          completedEndTime: null,
          priority: node.priority,
          userId,
          color: nextColor,
          locationId: null,
          useParentLocation: false,
          categoryId: null,
          createdAt: now,
          updatedAt: now,
        };
    newRows.push(row);
  }

  workingTree.children.forEach((child, i) => {
    processNode(child, rootId, (i + 1) * SORT_ORDER_STEP);
  });

  // Root row: update the fields the assistant may have changed. Preserve
  // sortOrder, parentId, locationId — those are part of root's position/identity
  // in the outer tree, not its subtask structure.
  const updatedRoot: Planner = {
    ...rootRow,
    title: workingTree.title,
    plannerType: resolvedRootType,
    duration: Math.max(1, Math.floor(workingTree.duration)),
    deadline: workingTree.deadline,
    priority: workingTree.priority,
    isReady: appliedReady,
    categoryId: nextCategoryId,
    color: nextColor,
    splitting: splittingColumn(workingTree),
    maxMinutesPerDay: goalDayCapColumn(workingTree, resolvedRootType),
    updatedAt: now,
  };

  const outsideSubtree = planner.filter(
    (p) => p.id !== rootId && !oldDescendantIds.has(p.id),
  );

  return [...outsideSubtree, updatedRoot, ...newRows];
}

// Build the rows for a brand-new top-level goal. The root gets top-level
// creation semantics (parentId null, sortOrder 0 — top-level order is
// non-semantic, matching Capture's behavior). Children are stamped with
// sibling sortOrder keys from array position, with the same defaults as new
// nodes inside an existing goal.
function buildNewRootRows(
  node: DraftNode,
  userId: string,
  validCategoryIds: ReadonlySet<string>,
  categoryColorById: ReadonlyMap<string, string | null> | undefined,
  now: string,
  nodeIdMap?: Map<string, string>,
): { rootId: string; rows: Planner[] } {
  const rootId = uuidv4();
  const rootCategoryId =
    node.categoryId && validCategoryIds.has(node.categoryId)
      ? node.categoryId
      : null;
  // Every row in a new goal shares one color (the root's), the same way they
  // share the root's category — so the goal reads as one block on the calendar.
  const rootColor = resolveNewRootColor(
    node,
    rootId,
    rootCategoryId,
    categoryColorById,
  );

  const rows: Planner[] = [];

  // Readiness cascades from the root: every row in the subtree carries the
  // same value. A goal is held to the manual gate (subtasks + deadline); a
  // task/plan root defaults ready unless the assistant set it false.
  const rootType = normalizeRootType(node.plannerType, node.children.length > 0);
  const rootIsReady = resolveAppliedReady(node, rootType);

  function build(child: DraftNode, parentId: string, sortOrder: number): void {
    const childId = uuidv4();
    if (child.id.length > 0) nodeIdMap?.set(child.id, childId);

    child.children.forEach((grandchild, i) => {
      build(grandchild, childId, (i + 1) * SORT_ORDER_STEP);
    });

    rows.push({
      id: childId,
      title: child.title,
      parentId,
      plannerType: normalizePlannerType(
        child.plannerType,
        child.children.length > 0,
      ),
      isReady: rootIsReady,
      isTriaged: true,
      duration: Math.max(1, Math.floor(child.duration)),
      deadline: child.deadline,
      starts: null,
      recurrence: null,
      recurrenceExceptions: null,
      splitting: splittingColumn(child),
      completedSegments: null,
      maxMinutesPerDay: null,
      earliestStartDate: null,
      allowedTimes: null,
      linkedItemId: null,
      notes: null,
      sortOrder,
      completedStartTime: null,
      completedEndTime: null,
      priority: child.priority,
      userId,
      color: rootColor,
      locationId: null,
      useParentLocation: false,
      // categoryId lives on the root only; descendants inherit via the
      // parent-chain walk (buildPlannerCategoryMap / getEffectiveCategoryId).
      categoryId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const rootRow: Planner = {
    id: rootId,
    title: node.title,
    parentId: null,
    plannerType: rootType,
    isReady: rootIsReady,
    isTriaged: true,
    duration: Math.max(1, Math.floor(node.duration)),
    deadline: node.deadline,
    starts: null,
    recurrence: null,
    recurrenceExceptions: null,
    splitting: splittingColumn(node),
    completedSegments: null,
    maxMinutesPerDay: goalDayCapColumn(node, rootType),
    earliestStartDate: null,
    allowedTimes: null,
    linkedItemId: null,
    notes: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: node.priority,
    userId,
    color: rootColor,
    locationId: null,
    useParentLocation: false,
    categoryId: rootCategoryId,
    createdAt: now,
    updatedAt: now,
  };
  rows.push(rootRow);

  node.children.forEach((child, i) => {
    build(child, rootId, (i + 1) * SORT_ORDER_STEP);
  });

  return { rootId, rows };
}

// Structure wins over the model's label: any node that holds children is a
// goal (goals hold subtasks; tasks and plans are leaves). This keeps a nested
// item from persisting as a "task" just because the assistant mislabeled it.
function normalizePlannerType(
  raw: DraftNode["plannerType"],
  hasChildren: boolean,
): PlannerType {
  if (hasChildren) return PlannerType.goal;
  if (raw === "goal") return PlannerType.goal;
  if (raw === "plan") return PlannerType.plan;
  return PlannerType.task;
}

// A retained root may now have its type edited from the assistant (task <->
// goal, or plan -> task). The draft contract still can't MINT a plan (no
// `starts`), so a working "plan" is honored only when the row was already a
// plan — an unchanged plan root round-trips as "plan" and survives; anything
// else falls back to task. Children still force goal.
function resolveRetainedRootType(
  working: DraftNode["plannerType"],
  hasChildren: boolean,
  existing: PlannerType,
): PlannerType {
  if (hasChildren) return PlannerType.goal;
  if (working === "goal") return PlannerType.goal;
  if (working === "plan") {
    return existing === PlannerType.plan ? PlannerType.plan : PlannerType.task;
  }
  return PlannerType.task;
}

// New top-level rows must never be plans — a plan needs a fixed `starts`,
// which the draft contract doesn't carry. A root with children is a goal; a
// leaf root falls back to task (goal only when explicitly labeled).
function normalizeRootType(
  raw: DraftNode["plannerType"],
  hasChildren: boolean,
): PlannerType {
  if (hasChildren) return PlannerType.goal;
  if (raw === "goal") return PlannerType.goal;
  return PlannerType.task;
}
