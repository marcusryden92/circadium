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
import {
  parseRecurrenceExceptions,
  serializePlanRecurrence,
  serializeRecurrenceExceptions,
  shiftRecurrenceExceptions,
} from "@/utils/planRecurrence";
import { serializeAllowedTimes } from "@/utils/allowedTimes";

// Splitting rides the full-tree contract like deadline/priority: the node's
// value (null when absent) becomes the row value. completedSegments is never
// part of the draft contract — retained rows keep theirs untouched.
function splittingColumn(node: DraftNode): string | null {
  return node.splitting ? serializeTaskSplitting(node.splitting) : null;
}

// The repeat rule rides top-level roots only, splitting-style null semantics:
// the node's value (null when absent) becomes the row value, so a retained
// root re-emitted without it stops repeating. On task/goal roots it is the
// flexible per-period rule; on plan roots the fixed-anchor repeat stepping
// from `starts`. Every descendant stamps null EXCEPT nested plans, whose
// fixed-anchor recurrence stays outside the contract (spread-preserved).
function recurrenceColumn(node: DraftNode): string | null {
  const rule = node.recurrence ?? null;
  if (!rule) return null;
  return serializePlanRecurrence({
    freq: rule.freq,
    interval: rule.interval >= 1 ? Math.floor(rule.interval) : 1,
    until: rule.until ?? null,
  });
}

// A plan's fixed start instant: valid ISO or null (a timeless plan is legal —
// the engine warns rather than erroring). Non-plan rows keep whatever the row
// already held (the engine ignores it, and the app's own type picker leaves
// stale fields behind the same way — so plan -> task -> plan round-trips keep
// the time); new non-plan rows get null.
function startsColumn(
  node: DraftNode,
  type: PlannerType,
  existing?: Planner,
): string | null {
  if (type !== PlannerType.plan) return existing?.starts ?? null;
  const value = node.starts ?? null;
  return value && !isNaN(new Date(value).getTime()) ? value : null;
}

// The node's own location. An id outside the user's set is ignored (existing
// value kept — mirrors categoryId). Changing the value pins the item there
// (useParentLocation off); an unchanged value preserves both columns as they
// were, so inherit-from-parent setups survive round-trips untouched.
function resolveLocation(
  node: DraftNode,
  existing: Planner | undefined,
  validLocationIds: ReadonlySet<string> | undefined,
): { locationId: string | null; useParentLocation: boolean } {
  const raw = node.locationId ?? null;
  const value =
    raw && validLocationIds && !validLocationIds.has(raw)
      ? existing?.locationId ?? null
      : raw;
  if (existing && value === (existing.locationId ?? null)) {
    return {
      locationId: existing.locationId ?? null,
      useParentLocation: existing.useParentLocation,
    };
  }
  return { locationId: value, useParentLocation: false };
}

// Undefined-preserve fields (notes, completed): only an explicit value in the
// working node changes the row; absence keeps whatever the row had.
function resolveNotes(node: DraftNode, existing: Planner | undefined): string | null {
  if (node.notes === undefined) return existing?.notes ?? null;
  return node.notes;
}

function resolveCompletionColumns(
  node: DraftNode,
  existing: Planner | undefined,
  type: PlannerType,
  now: string,
): {
  completedStartTime: string | null;
  completedEndTime: string | null;
  completedSegments: string | null;
} {
  const preserved = {
    completedStartTime: existing?.completedStartTime ?? null,
    completedEndTime: existing?.completedEndTime ?? null,
    completedSegments: existing?.completedSegments ?? null,
  };
  // Completion never applies to plans or repeating roots; the op layer
  // refuses those, this is the save-time backstop.
  if (node.completed === undefined || type === PlannerType.plan) {
    return preserved;
  }
  if ((node.recurrence ?? null) !== null) return preserved;
  if (node.completed === false) {
    return {
      completedStartTime: null,
      completedEndTime: null,
      // A split task with exhausted segments would still read completed, so
      // un-completing clears the segment record too.
      completedSegments: null,
    };
  }
  if (preserved.completedStartTime && preserved.completedEndTime) {
    return preserved;
  }
  const durationMinutes = Math.max(1, Math.floor(node.duration));
  const end = new Date(now);
  const start = new Date(end.getTime() - durationMinutes * 60_000);
  return {
    completedStartTime: start.toISOString(),
    completedEndTime: end.toISOString(),
    completedSegments: preserved.completedSegments,
  };
}

// Placement bounds ride EVERY node (per-node, inherited down the tree), unlike
// the root-only fields above — but never apply to plans (fixed anchors). The
// contract carries the ISO string / parsed {days, ranges}; serialize back to
// the string columns, null when absent so a retained node re-emitted without
// one clears it (this replaces the former spread-preserve-only behavior).
function earliestStartColumn(
  node: DraftNode,
  type: PlannerType,
): string | null {
  if (type === PlannerType.plan) return null;
  const value = node.earliestStartDate ?? null;
  return value && !isNaN(new Date(value).getTime()) ? value : null;
}

function allowedTimesColumn(node: DraftNode, type: PlannerType): string | null {
  if (type === PlannerType.plan) return null;
  return node.allowedTimes ? serializeAllowedTimes(node.allowedTimes) : null;
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
// stays gated on subtasks + a deadline OR a repeat rule (each period's end
// bounds a recurring goal's occurrences), matching the manual "Mark ready".
function resolveAppliedReady(node: DraftNode, rootType: PlannerType): boolean {
  if (rootType === PlannerType.goal) {
    return (
      node.isReady === true &&
      node.children.length > 0 &&
      (node.deadline !== null || (node.recurrence ?? null) !== null)
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
  // The user's location ids; a locationId outside the set is ignored the same
  // way. Optional — when absent, contract values are trusted as-is.
  validLocationIds?: ReadonlySet<string>;
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
  validLocationIds,
  categoryColorById,
  dependencies = [],
  nodeIdMap,
}: ApplyForestArgs): Planner[] {
  const now = new Date().toISOString();
  let current = planner;

  // 1. Deleted roots: every triaged top-level row (what plannerForestToJson
  // sent out) whose id no longer appears in the working forest. The filter
  // must mirror plannerForestToJson exactly.
  const workingIds = new Set(
    workingForest.goals.map((g) => g.id).filter((id) => id.length > 0),
  );
  const canonicalRootIds = planner
    .filter((p) => !p.parentId && p.isTriaged)
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
        validLocationIds,
        now,
        nodeIdMap,
      });
    } else {
      const { rootId, rows } = buildNewRootRows(
        goal,
        userId,
        validCategoryIds,
        validLocationIds,
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
  validLocationIds?: ReadonlySet<string>;
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
  validLocationIds,
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
  // task <-> goal <-> plan retypes are all legal now that the contract
  // carries `starts`; children still force goal.
  const resolvedRootType = normalizePlannerType(
    workingTree.plannerType,
    workingTree.children.length > 0,
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
    const nodeType = normalizePlannerType(
      node.plannerType,
      node.children.length > 0,
    );

    node.children.forEach((child, i) => {
      processNode(child, nodeId, (i + 1) * SORT_ORDER_STEP);
    });

    const location = resolveLocation(node, existing, validLocationIds);
    const completion = resolveCompletionColumns(node, existing, nodeType, now);
    const row: Planner = existing
      ? {
          ...existing,
          title: node.title,
          plannerType: nodeType,
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
          // The flexible rule is root-only, like categoryId — clearing
          // retained non-plan descendants heals rows that predate that
          // invariant. A nested PLAN keeps its fixed-anchor recurrence
          // (outside the contract, spread-preserved).
          recurrence:
            nodeType === PlannerType.plan ? existing.recurrence : null,
          recurrenceExceptions:
            nodeType === PlannerType.plan
              ? existing.recurrenceExceptions
              : null,
          starts: startsColumn(node, nodeType, existing),
          locationId: location.locationId,
          useParentLocation: location.useParentLocation,
          notes: resolveNotes(node, existing),
          completedStartTime: completion.completedStartTime,
          completedEndTime: completion.completedEndTime,
          completedSegments: completion.completedSegments,
          // Placement bounds ride the contract per-node now: write (or clear)
          // them instead of spread-preserving the old row value.
          earliestStartDate: earliestStartColumn(node, nodeType),
          allowedTimes: allowedTimesColumn(node, nodeType),
          updatedAt: now,
        }
      : {
          id: nodeId,
          title: node.title,
          parentId,
          plannerType: nodeType,
          isReady: appliedReady,
          isTriaged: true,
          duration: Math.max(1, Math.floor(node.duration)),
          deadline: node.deadline,
          starts: startsColumn(node, nodeType),
          recurrence: null,
          recurrenceExceptions: null,
          splitting: splittingColumn(node),
          completedSegments: null,
          maxMinutesPerDay: null,
          earliestStartDate: earliestStartColumn(node, nodeType),
          allowedTimes: allowedTimesColumn(node, nodeType),
          linkedItemId: null,
          notes: node.notes ?? null,
          sortOrder,
          completedStartTime: null,
          completedEndTime: null,
          priority: node.priority,
          userId,
          color: nextColor,
          locationId: location.locationId,
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

  // Recurrence and a deadline are mutually exclusive on flexible roots (each
  // occurrence derives its deadline from its own period end); a plan root's
  // rule is the fixed-anchor repeat stepping from `starts`. Changing or
  // clearing the rule drops per-occurrence exceptions — their keys only mean
  // anything under the rule that minted them. Moving a plan's anchor shifts
  // the exception keys with it (matching the calendar's "every occurrence"
  // move), so the user's moved/deleted one-offs keep pointing at their
  // occurrences.
  const nextRecurrence = recurrenceColumn(workingTree);
  const nextStarts = startsColumn(workingTree, resolvedRootType, rootRow);
  let nextRecurrenceExceptions: string | null = null;
  // A retype invalidates exception keys too (flexible per-period skips mean
  // nothing on a plan and vice versa), so preservation requires the same type
  // AND the same rule.
  if (
    nextRecurrence === rootRow.recurrence &&
    resolvedRootType === rootRow.plannerType
  ) {
    nextRecurrenceExceptions = rootRow.recurrenceExceptions;
    if (
      resolvedRootType === PlannerType.plan &&
      nextStarts !== rootRow.starts
    ) {
      if (nextStarts && rootRow.starts && rootRow.recurrenceExceptions) {
        const deltaMs =
          new Date(nextStarts).getTime() - new Date(rootRow.starts).getTime();
        nextRecurrenceExceptions = serializeRecurrenceExceptions(
          shiftRecurrenceExceptions(
            parseRecurrenceExceptions(rootRow.recurrenceExceptions),
            deltaMs,
          ),
        );
      } else {
        nextRecurrenceExceptions = null;
      }
    }
  }
  const nextDeadline =
    resolvedRootType !== PlannerType.plan && nextRecurrence
      ? null
      : workingTree.deadline;
  const rootLocation = resolveLocation(workingTree, rootRow, validLocationIds);
  const rootCompletion = resolveCompletionColumns(
    workingTree,
    rootRow,
    resolvedRootType,
    now,
  );

  // Root row: update the fields the assistant may have changed. Preserve
  // sortOrder and parentId — those are part of root's position/identity in
  // the outer tree, not its subtask structure.
  const updatedRoot: Planner = {
    ...rootRow,
    title: workingTree.title,
    plannerType: resolvedRootType,
    duration: Math.max(1, Math.floor(workingTree.duration)),
    deadline: nextDeadline,
    priority: workingTree.priority,
    isReady: appliedReady,
    categoryId: nextCategoryId,
    color: nextColor,
    splitting: splittingColumn(workingTree),
    maxMinutesPerDay: goalDayCapColumn(workingTree, resolvedRootType),
    recurrence: nextRecurrence,
    recurrenceExceptions: nextRecurrenceExceptions,
    starts: nextStarts,
    locationId: rootLocation.locationId,
    useParentLocation: rootLocation.useParentLocation,
    notes: resolveNotes(workingTree, rootRow),
    completedStartTime: rootCompletion.completedStartTime,
    completedEndTime: rootCompletion.completedEndTime,
    completedSegments: rootCompletion.completedSegments,
    earliestStartDate: earliestStartColumn(workingTree, resolvedRootType),
    allowedTimes: allowedTimesColumn(workingTree, resolvedRootType),
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
  validLocationIds: ReadonlySet<string> | undefined,
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
  const rootType = normalizePlannerType(
    node.plannerType,
    node.children.length > 0,
  );
  const rootIsReady = resolveAppliedReady(node, rootType);

  function build(child: DraftNode, parentId: string, sortOrder: number): void {
    const childId = uuidv4();
    if (child.id.length > 0) nodeIdMap?.set(child.id, childId);
    const childType = normalizePlannerType(
      child.plannerType,
      child.children.length > 0,
    );

    child.children.forEach((grandchild, i) => {
      build(grandchild, childId, (i + 1) * SORT_ORDER_STEP);
    });

    rows.push({
      id: childId,
      title: child.title,
      parentId,
      plannerType: childType,
      isReady: rootIsReady,
      isTriaged: true,
      duration: Math.max(1, Math.floor(child.duration)),
      deadline: child.deadline,
      starts: startsColumn(child, childType),
      recurrence: null,
      recurrenceExceptions: null,
      splitting: splittingColumn(child),
      completedSegments: null,
      maxMinutesPerDay: null,
      earliestStartDate: earliestStartColumn(child, childType),
      allowedTimes: allowedTimesColumn(child, childType),
      linkedItemId: null,
      notes: child.notes ?? null,
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

  const newRootRecurrence = recurrenceColumn(node);
  const rootRow: Planner = {
    id: rootId,
    title: node.title,
    parentId: null,
    plannerType: rootType,
    isReady: rootIsReady,
    isTriaged: true,
    duration: Math.max(1, Math.floor(node.duration)),
    deadline:
      newRootRecurrence && rootType !== PlannerType.plan ? null : node.deadline,
    starts: startsColumn(node, rootType),
    recurrence: newRootRecurrence,
    recurrenceExceptions: null,
    splitting: splittingColumn(node),
    completedSegments: null,
    maxMinutesPerDay: goalDayCapColumn(node, rootType),
    earliestStartDate: earliestStartColumn(node, rootType),
    allowedTimes: allowedTimesColumn(node, rootType),
    linkedItemId: null,
    notes: node.notes ?? null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: node.priority,
    userId,
    color: rootColor,
    locationId: resolveLocation(node, undefined, validLocationIds).locationId,
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

