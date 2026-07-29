import { v4 as uuidv4 } from "uuid";
import type { DraftNode } from "./plannerTreeToJson";
import type { DraftForest } from "./plannerForestToJson";
import {
  normalizeDraftTree,
  normalizeDraftRecurrence,
  coerceParentTypes,
} from "./normalizeDraftTree";
import {
  draftValidateSubtreeOrder,
  type DraftPrecedenceState,
} from "./draftPrecedence";
import { normalizeTaskSplittingSettings } from "@/utils/taskSplitting";
import { clampPriority } from "@/utils/plannerPriority";

// Deterministic operations on a DraftForest, executed server-side on the
// assistant's working copy so the model states intent (ids + fields) and code
// performs the tree surgery — no retyped trees, no transcription drift. All
// functions are pure (clone-then-mutate); sortOrder is not represented here
// at all — sibling order is array position, stamped as fractional keys once,
// at Save, by applyDraftForestToPlanner.

export interface DraftOpFailure {
  id: string | null;
  reason: string;
}

export interface DraftOpsResult {
  forest: DraftForest;
  // Roots whose trees changed — the route emits these as forest events.
  updatedRootIds: string[];
  // Top-level goals removed entirely.
  deletedGoalIds: string[];
  failures: DraftOpFailure[];
}

export interface DraftSearchHit {
  id: string;
  title: string;
  plannerType: DraftNode["plannerType"];
  rootId: string;
  rootTitle: string;
  // "Root > Branch > Node" — disambiguates same-titled items.
  path: string;
}

export interface DraftItemUpdate {
  id: string;
  title?: string;
  // "task" | "goal" only — plans need a fixed start time the draft contract
  // doesn't carry, so a node can never be turned INTO a plan here. A node with
  // children is forced back to "goal" regardless (coerceParentTypes).
  plannerType?: DraftNode["plannerType"];
  duration?: number;
  deadline?: string | null;
  priority?: number;
  isReady?: boolean | null;
  categoryId?: string | null;
  // Chunked scheduling on schedulable leaves: an object enables/updates it,
  // null turns it off. Rejected on nodes with children (only leaves place).
  splitting?: {
    minMinutes: number;
    maxMinutes: number;
    maxMinutesPerDay?: number | null;
    minSpacingMinutes?: number | null;
  } | null;
  // The goal's daily limit: a positive number of minutes sets it, null clears
  // it. Rejected on anything but a top-level goal.
  maxMinutesPerDay?: number | null;
  // Flexible repeat rule: an object sets it (clearing any deadline — each
  // occurrence derives its own from its period end), null stops repeating.
  // Rejected on subtasks and plans; top-level tasks and goals only.
  recurrence?: {
    freq: "daily" | "weekly" | "monthly";
    interval?: number;
    until?: string | null;
  } | null;
}

function coerceForestTypes(forest: DraftForest): DraftForest {
  return { ...forest, goals: forest.goals.map(coerceParentTypes) };
}

export interface DraftMoveArgs {
  itemId: string;
  newParentId: string;
  // Insert after this sibling (must be a child of newParentId); atStart wins
  // over it; neither -> append at the end.
  afterSiblingId?: string;
  atStart?: boolean;
}

export interface DraftAddArgs {
  parentId: string;
  items: unknown[];
  afterSiblingId?: string;
  atStart?: boolean;
}

function cloneForest(forest: DraftForest): DraftForest {
  return JSON.parse(JSON.stringify(forest)) as DraftForest;
}

interface NodeLocation {
  node: DraftNode;
  // null when the node is a top-level root.
  parent: DraftNode | null;
  root: DraftNode;
}

function locate(forest: DraftForest, id: string): NodeLocation | null {
  if (!id) return null;
  for (const root of forest.goals) {
    if (root.id === id) return { node: root, parent: null, root };
    const found = locateWithin(root, id);
    if (found) return { ...found, root };
  }
  return null;
}

function locateWithin(
  parent: DraftNode,
  id: string,
): { node: DraftNode; parent: DraftNode } | null {
  for (const child of parent.children) {
    if (child.id === id) return { node: child, parent };
    const found = locateWithin(child, id);
    if (found) return found;
  }
  return null;
}

function subtreeContains(node: DraftNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((child) => subtreeContains(child, id));
}

export function searchDraftItems(
  forest: DraftForest,
  query: string,
  limit = 25,
): DraftSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { hit: DraftSearchHit; score: number }[] = [];
  const visit = (node: DraftNode, root: DraftNode, path: string[]) => {
    const title = node.title.toLowerCase();
    const score =
      title === q ? 3 : title.startsWith(q) ? 2 : title.includes(q) ? 1 : 0;
    // Nodes without ids are unsaved additions from this session — they can't
    // be referenced by id, so surfacing them would only mislead the model.
    if (score > 0 && node.id) {
      scored.push({
        hit: {
          id: node.id,
          title: node.title,
          plannerType: node.plannerType,
          rootId: root.id,
          rootTitle: root.title,
          path: [...path, node.title].join(" > "),
        },
        score,
      });
    }
    for (const child of node.children) visit(child, root, [...path, node.title]);
  };
  for (const root of forest.goals) visit(root, root, []);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.hit);
}

export function updateDraftItems(
  forest: DraftForest,
  updates: DraftItemUpdate[],
  validCategoryIds: ReadonlySet<string>,
): DraftOpsResult {
  const next = cloneForest(forest);
  const updatedRootIds = new Set<string>();
  const failures: DraftOpFailure[] = [];

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const found = locate(next, id);
    if (!found) {
      failures.push({ id: id || null, reason: "item not found" });
      continue;
    }
    const { node, parent, root } = found;
    const isRoot = parent === null;

    if (typeof update.title === "string") {
      const trimmed = update.title.trim();
      if (trimmed.length === 0) {
        failures.push({ id, reason: "title must be non-empty" });
        continue;
      }
      node.title = trimmed;
    }
    if (update.plannerType !== undefined) {
      if (update.plannerType !== "task" && update.plannerType !== "goal") {
        failures.push({
          id,
          reason: 'plannerType must be "task" or "goal"',
        });
        continue;
      }
      node.plannerType = update.plannerType;
    }
    if (update.duration !== undefined) {
      if (typeof update.duration !== "number" || !isFinite(update.duration)) {
        failures.push({ id, reason: "duration must be a number of minutes" });
        continue;
      }
      node.duration = Math.max(1, Math.floor(update.duration));
    }
    if (update.deadline !== undefined) {
      if (update.deadline !== null && typeof update.deadline !== "string") {
        failures.push({ id, reason: "deadline must be a string or null" });
        continue;
      }
      node.deadline = update.deadline;
    }
    if (update.priority !== undefined) {
      if (typeof update.priority !== "number" || !isFinite(update.priority)) {
        failures.push({ id, reason: "priority must be an integer" });
        continue;
      }
      node.priority = clampPriority(update.priority);
    }
    if (update.categoryId !== undefined) {
      if (!isRoot) {
        failures.push({
          id,
          reason: "categoryId can only be set on top-level goals",
        });
        continue;
      }
      if (
        update.categoryId !== null &&
        !validCategoryIds.has(update.categoryId)
      ) {
        failures.push({ id, reason: "unknown categoryId" });
        continue;
      }
      node.categoryId = update.categoryId;
    }
    if (update.splitting !== undefined) {
      if (update.splitting === null) {
        node.splitting = null;
      } else {
        if (node.children.length > 0) {
          failures.push({
            id,
            reason:
              "splitting applies to schedulable leaf items only (this item has subtasks)",
          });
          continue;
        }
        if (node.plannerType === "plan") {
          failures.push({
            id,
            reason: "splitting does not apply to plans (fixed start times)",
          });
          continue;
        }
        const normalized = normalizeTaskSplittingSettings(update.splitting);
        if (!normalized) {
          failures.push({
            id,
            reason:
              "splitting requires minMinutes >= 5 and maxMinutes >= minMinutes or 0 for no upper bound (maxMinutesPerDay, minSpacingMinutes optional)",
          });
          continue;
        }
        node.splitting = normalized;
      }
    }
    if (update.maxMinutesPerDay !== undefined) {
      if (update.maxMinutesPerDay === null) {
        node.maxMinutesPerDay = null;
      } else {
        if (!isRoot || node.plannerType !== "goal") {
          failures.push({
            id,
            reason: "the daily limit applies to top-level goals only",
          });
          continue;
        }
        if (
          typeof update.maxMinutesPerDay !== "number" ||
          !isFinite(update.maxMinutesPerDay) ||
          update.maxMinutesPerDay <= 0
        ) {
          failures.push({
            id,
            reason: "the daily limit must be a positive number of minutes",
          });
          continue;
        }
        node.maxMinutesPerDay = Math.floor(update.maxMinutesPerDay);
      }
    }
    if (update.recurrence !== undefined) {
      if (update.recurrence === null) {
        node.recurrence = null;
      } else {
        if (!isRoot) {
          failures.push({
            id,
            reason:
              "a repeat rule applies to top-level items only (subtasks repeat with their goal)",
          });
          continue;
        }
        if (node.plannerType === "plan") {
          failures.push({
            id,
            reason:
              "plans repeat on their fixed schedule — this rule is for tasks and goals",
          });
          continue;
        }
        const rule = normalizeDraftRecurrence(update.recurrence);
        if (!rule) {
          failures.push({
            id,
            reason:
              'recurrence requires freq "daily"|"weekly"|"monthly" (interval and until optional)',
          });
          continue;
        }
        node.recurrence = rule;
        // Mutually exclusive with a deadline: each occurrence is bounded by
        // its own period end.
        node.deadline = null;
      }
    }
    if (update.isReady !== undefined) {
      if (update.isReady !== null && typeof update.isReady !== "boolean") {
        failures.push({ id, reason: "isReady must be a boolean or null" });
        continue;
      }
      // Same gate as the app's manual "Mark ready": a top-level goal needs
      // subtasks and a deadline OR a repeat rule. Tasks and plans are freely
      // readyable — readiness is just the scheduling gate for them.
      if (
        update.isReady === true &&
        isRoot &&
        node.plannerType === "goal" &&
        (node.children.length === 0 ||
          (node.deadline === null && (node.recurrence ?? null) === null))
      ) {
        failures.push({
          id,
          reason:
            "a goal can only be readied when it has at least one subtask and a deadline or repeat rule",
        });
        continue;
      }
      node.isReady = update.isReady;
    }

    updatedRootIds.add(root.id);
  }

  return {
    forest: coerceForestTypes(next),
    updatedRootIds: [...updatedRootIds],
    deletedGoalIds: [],
    failures,
  };
}

export function moveDraftItem(
  forest: DraftForest,
  args: DraftMoveArgs,
  // Canonical + working node-level dependency edges: a same-goal reorder can
  // close a loop through TWO goals' step orders, so the post-move forest is
  // validated before acceptance.
  precedence?: DraftPrecedenceState,
): DraftOpsResult {
  const fail = (id: string | null, reason: string): DraftOpsResult => ({
    forest,
    updatedRootIds: [],
    deletedGoalIds: [],
    failures: [{ id, reason }],
  });

  const next = cloneForest(forest);
  const itemLoc = locate(next, args.itemId);
  if (!itemLoc) return fail(args.itemId ?? null, "item not found");
  if (itemLoc.parent === null) {
    return fail(
      args.itemId,
      "top-level goals cannot be moved with this tool; use propose_goals",
    );
  }

  const parentLoc = locate(next, args.newParentId);
  if (!parentLoc) return fail(args.newParentId ?? null, "new parent not found");
  if (subtreeContains(itemLoc.node, args.newParentId)) {
    return fail(args.newParentId, "cannot move an item into its own subtree");
  }
  if (parentLoc.root.id !== itemLoc.root.id) {
    return fail(
      args.itemId,
      "cross-goal moves change item identity and are not supported; use propose_goals",
    );
  }

  const oldChildren = itemLoc.parent.children;
  oldChildren.splice(oldChildren.indexOf(itemLoc.node), 1);

  const target = parentLoc.node.children;
  if (args.atStart) {
    target.unshift(itemLoc.node);
  } else if (args.afterSiblingId) {
    const index = target.findIndex((c) => c.id === args.afterSiblingId);
    if (index === -1) {
      return fail(
        args.afterSiblingId,
        "afterSiblingId is not a child of the new parent",
      );
    }
    target.splice(index + 1, 0, itemLoc.node);
  } else {
    target.push(itemLoc.node);
  }

  if (precedence) {
    const cycle = draftValidateSubtreeOrder(next, precedence, itemLoc.root.id);
    if (cycle) {
      const titleById = new Map<string, string>();
      const collect = (node: DraftNode) => {
        if (node.id) titleById.set(node.id, node.title);
        for (const child of node.children) collect(child);
      };
      for (const goal of next.goals) collect(goal);
      const path = cycle
        .filter((e) => e.source !== "internal")
        .map(
          (e) =>
            `"${titleById.get(e.fromNodeId ?? e.fromId) ?? "an item"}" → "${titleById.get(e.toNodeId ?? e.toId) ?? "an item"}"`,
        )
        .join(", ");
      return fail(
        args.itemId,
        `that order would create a loop through existing dependencies (${path}); the move was not applied`,
      );
    }
  }

  return {
    forest: coerceForestTypes(next),
    updatedRootIds: [itemLoc.root.id],
    deletedGoalIds: [],
    failures: [],
  };
}

export function deleteDraftItems(
  forest: DraftForest,
  itemIds: string[],
): DraftOpsResult {
  const next = cloneForest(forest);
  const updatedRootIds = new Set<string>();
  const deletedGoalIds: string[] = [];
  const failures: DraftOpFailure[] = [];

  for (const id of [...new Set(itemIds)]) {
    const found = locate(next, id);
    if (!found) {
      // May have been inside a subtree already deleted this call.
      failures.push({ id, reason: "item not found (already deleted?)" });
      continue;
    }
    if (found.parent === null) {
      next.goals = next.goals.filter((g) => g.id !== id);
      deletedGoalIds.push(id);
      updatedRootIds.delete(id);
    } else {
      found.parent.children.splice(
        found.parent.children.indexOf(found.node),
        1,
      );
      updatedRootIds.add(found.root.id);
    }
  }

  return {
    forest: coerceForestTypes(next),
    updatedRootIds: [...updatedRootIds].filter(
      (id) => !deletedGoalIds.includes(id),
    ),
    deletedGoalIds,
    failures,
  };
}

export function addDraftItems(
  forest: DraftForest,
  args: DraftAddArgs,
): DraftOpsResult {
  const fail = (id: string | null, reason: string): DraftOpsResult => ({
    forest,
    updatedRootIds: [],
    deletedGoalIds: [],
    failures: [{ id, reason }],
  });

  const next = cloneForest(forest);
  const parentLoc = locate(next, args.parentId);
  if (!parentLoc) return fail(args.parentId ?? null, "parent not found");

  const items = (Array.isArray(args.items) ? args.items : [])
    .map((raw) => normalizeDraftTree(raw))
    .filter((node): node is DraftNode => node !== null)
    .map(mintDraftIds);
  if (items.length === 0) return fail(null, "no valid items to add");

  const target = parentLoc.node.children;
  let index = target.length;
  if (args.atStart) {
    index = 0;
  } else if (args.afterSiblingId) {
    const siblingIndex = target.findIndex((c) => c.id === args.afterSiblingId);
    if (siblingIndex === -1) {
      return fail(args.afterSiblingId, "afterSiblingId is not a child of the parent");
    }
    index = siblingIndex + 1;
  }
  target.splice(index, 0, ...items);

  return {
    forest: coerceForestTypes(next),
    updatedRootIds: [parentLoc.root.id],
    deletedGoalIds: [],
    failures: [],
  };
}

// Added nodes are new by definition, so any model-supplied id is discarded
// (which also blocks "moving" an existing item via add_items) and a fresh
// draft id is minted in its place — draft nodes stay addressable by every
// tool. Permanent UUIDs still replace draft ids at Save. add_items always
// inserts UNDER a parent, so root-only fields (categoryId, recurrence) are
// stripped here.
function mintDraftIds(node: DraftNode): DraftNode {
  return {
    ...node,
    id: uuidv4(),
    categoryId: null,
    recurrence: null,
    children: node.children.map(mintDraftIds),
  };
}
