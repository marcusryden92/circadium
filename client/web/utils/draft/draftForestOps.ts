import { v4 as uuidv4 } from "uuid";
import type { DraftNode } from "./plannerTreeToJson";
import type { DraftForest } from "./plannerForestToJson";
import {
  normalizeDraftTree,
  normalizeDraftRecurrence,
  coerceParentTypes,
} from "./normalizeDraftTree";
import {
  draftDetourAdjacency,
  draftDetourReaches,
  draftPrecedencePathConnects,
  draftValidateSubtreeOrder,
  type DraftPrecedenceState,
} from "./draftPrecedence";
import type { DraftRelocation } from "./draftRelocations";
import { PRIORITY_DEFAULT } from "@/utils/plannerPriority";
import { normalizeTaskSplittingSettings } from "@/utils/taskSplitting";
import { clampPriority } from "@/utils/plannerPriority";
import { isHexColor } from "@/utils/colorUtils";
import {
  normalizeAllowedTimesSettings,
  parseEarliestStartDate,
} from "@/utils/allowedTimes";

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
  // "task" | "goal" | "plan". Retyping to "plan" requires a childless node
  // (pair it with `starts` for a real fixed time); a node with children is
  // forced back to "goal" regardless (coerceParentTypes).
  plannerType?: DraftNode["plannerType"];
  duration?: number;
  deadline?: string | null;
  priority?: number;
  isReady?: boolean | null;
  categoryId?: string | null;
  // The plan's fixed start instant (ISO). Plans only; null makes the plan
  // timeless (it stops appearing on the calendar until a time is set).
  starts?: string | null;
  // One of the user's location ids, or null to clear the item's own location.
  locationId?: string | null;
  // A 6-digit hex color. Top-level items only (the subtree inherits it).
  color?: string;
  // Free-form user notes: a string sets, null clears. Never wiped implicitly.
  notes?: string | null;
  // Mark done / not done. Tasks and goals only — never plans or repeating
  // items (those complete per occurrence on the calendar).
  completed?: boolean;
  // Detour link on a subtask: a top-level task/goal id redirects the
  // scheduler into that item's steps at this position; null unlinks.
  linkedItemId?: string | null;
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
  // Placement bounds, settable on any task/goal node (per-node, inherited down
  // the tree) — rejected on plans. null clears. earliestStartDate is an ISO
  // string; allowedTimes is the {days, ranges} shape.
  earliestStartDate?: string | null;
  allowedTimes?: {
    days?: number[] | null;
    ranges?: { startTime: string; endTime: string }[] | null;
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
  validLocationIds: ReadonlySet<string> = new Set(),
  // Needed only for linkedItemId patches (a detour makes host and target
  // mutually ordered, so existing queue/dependency paths refuse the link).
  precedence?: DraftPrecedenceState,
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
      if (
        update.plannerType !== "task" &&
        update.plannerType !== "goal" &&
        update.plannerType !== "plan"
      ) {
        failures.push({
          id,
          reason: 'plannerType must be "task", "goal", or "plan"',
        });
        continue;
      }
      if (update.plannerType === "plan" && node.children.length > 0) {
        failures.push({
          id,
          reason:
            "an item with subtasks cannot become a plan — plans are single fixed-time blocks",
        });
        continue;
      }
      if (node.plannerType === "plan" && update.plannerType !== "plan") {
        // Leaving plan-hood drops the fixed anchor; the flexible fields can
        // then be set by later patches in this same update.
        node.starts = null;
      }
      if (update.plannerType === "plan" && node.plannerType !== "plan") {
        // Entering plan-hood drops fields that only apply to auto-scheduled
        // work — a plan sits exactly where its start time puts it.
        node.splitting = null;
        node.earliestStartDate = null;
        node.allowedTimes = null;
        node.deadline = null;
      }
      node.plannerType = update.plannerType;
    }
    if (update.starts !== undefined) {
      if (update.starts === null) {
        if (node.plannerType === "plan") node.starts = null;
      } else {
        if (node.plannerType !== "plan") {
          failures.push({
            id,
            reason:
              'a fixed start time applies to plans only — retype the item to "plan" first (or in the same update), or use a deadline/earliest start for tasks and goals',
          });
          continue;
        }
        if (
          typeof update.starts !== "string" ||
          isNaN(new Date(update.starts).getTime())
        ) {
          failures.push({
            id,
            reason: "starts must be an ISO date-time string or null",
          });
          continue;
        }
        node.starts = update.starts;
      }
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
    if (update.locationId !== undefined) {
      if (update.locationId === null) {
        node.locationId = null;
      } else {
        if (!validLocationIds.has(update.locationId)) {
          failures.push({ id, reason: "unknown locationId" });
          continue;
        }
        node.locationId = update.locationId;
      }
    }
    if (update.color !== undefined) {
      if (!isRoot) {
        failures.push({
          id,
          reason:
            "color can only be set on top-level items (the subtree inherits it)",
        });
        continue;
      }
      if (!isHexColor(update.color)) {
        failures.push({
          id,
          reason: 'color must be a 6-digit hex string like "#1976D2"',
        });
        continue;
      }
      node.color = update.color;
    }
    if (update.notes !== undefined) {
      if (update.notes !== null && typeof update.notes !== "string") {
        failures.push({ id, reason: "notes must be a string or null" });
        continue;
      }
      node.notes =
        update.notes === null || update.notes.trim().length === 0
          ? null
          : update.notes;
    }
    if (update.completed !== undefined) {
      if (typeof update.completed !== "boolean") {
        failures.push({ id, reason: "completed must be a boolean" });
        continue;
      }
      if (node.plannerType === "plan") {
        failures.push({
          id,
          reason:
            "plans aren't completed this way — the user checks off each occurrence on the calendar",
        });
        continue;
      }
      if (isRoot && (node.recurrence ?? null) !== null) {
        failures.push({
          id,
          reason:
            "repeating items are completed per occurrence on the calendar, not as a whole",
        });
        continue;
      }
      node.completed = update.completed;
    }
    if (update.linkedItemId !== undefined) {
      if (update.linkedItemId === null) {
        node.linkedItemId = null;
      } else {
        if (isRoot) {
          failures.push({
            id,
            reason:
              "a detour link lives on a subtask inside a goal — top-level items already schedule on their own (use a dependency to order two top-level items)",
          });
          continue;
        }
        if (node.plannerType === "plan") {
          failures.push({
            id,
            reason: "a plan cannot redirect into other work",
          });
          continue;
        }
        const target = next.goals.find((g) => g.id === update.linkedItemId);
        if (
          !target ||
          (target.plannerType !== "task" && target.plannerType !== "goal")
        ) {
          failures.push({
            id,
            reason:
              "the linked target must be a top-level task or goal (use an id from the goal index)",
          });
          continue;
        }
        if ((target.recurrence ?? null) !== null) {
          failures.push({
            id,
            reason:
              "a repeating item cannot be spliced into another goal's flow — it schedules per occurrence",
          });
          continue;
        }
        if (target.id === root.id) {
          failures.push({
            id,
            reason: "cannot link a subtask back to its own goal",
          });
          continue;
        }
        const adjacency = draftDetourAdjacency(next);
        if (draftDetourReaches(adjacency, target.id, root.id)) {
          failures.push({
            id,
            reason: `linking would loop — "${target.title}" already leads back into "${root.title}" through existing links`,
          });
          continue;
        }
        if (
          precedence &&
          draftPrecedencePathConnects(next, precedence, root.id, target.id)
        ) {
          failures.push({
            id,
            reason: `a queue or prerequisite already orders "${root.title}" and "${target.title}" — linking them would deadlock; remove that ordering first`,
          });
          continue;
        }
        node.linkedItemId = update.linkedItemId;
      }
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
        if (node.plannerType === "plan" && (node.starts ?? null) === null) {
          failures.push({
            id,
            reason:
              "a plan repeats from its fixed start time — set starts first, then the repeat rule",
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
        // Mutually exclusive with a deadline on flexible items: each
        // occurrence is bounded by its own period end. (A plan's rule anchors
        // on starts; its deadline is inert.)
        if (node.plannerType !== "plan") node.deadline = null;
      }
    }
    if (update.earliestStartDate !== undefined) {
      if (update.earliestStartDate === null) {
        node.earliestStartDate = null;
      } else {
        if (node.plannerType === "plan") {
          failures.push({
            id,
            reason:
              "an earliest start date does not apply to plans (they have a fixed start time)",
          });
          continue;
        }
        const parsed = parseEarliestStartDate(update.earliestStartDate);
        if (!parsed) {
          failures.push({
            id,
            reason: "earliestStartDate must be an ISO date string or null",
          });
          continue;
        }
        node.earliestStartDate = update.earliestStartDate;
      }
    }
    if (update.allowedTimes !== undefined) {
      if (update.allowedTimes === null) {
        node.allowedTimes = null;
      } else {
        if (node.plannerType === "plan") {
          failures.push({
            id,
            reason:
              "allowed times do not apply to plans (they have a fixed start time)",
          });
          continue;
        }
        // An all-days / no-ranges pattern normalizes to null (no restriction) —
        // treated as a clear, not a rejection.
        node.allowedTimes = normalizeAllowedTimesSettings(update.allowedTimes);
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

// -- Relocations across the root boundary -------------------------------------
// Promote/demote/triage mirror the app's native helpers on the working forest
// and hand back a relocation record; at Save the records replay on the
// canonical planner array FIRST (replayDraftRelocations), so the regular
// apply sees each id exactly where the working forest holds it.

export interface DraftRelocationOpResult extends DraftOpsResult {
  relocation: DraftRelocation | null;
}

// Break a subtask out as its own top-level item — the draft mirror of
// promoteSubtree's fixups (type, readiness, category snapshot, color,
// link clear, emptied-source unready).
export function promoteDraftItem(
  forest: DraftForest,
  itemId: string,
): DraftRelocationOpResult {
  const fail = (reason: string): DraftRelocationOpResult => ({
    forest,
    updatedRootIds: [],
    deletedGoalIds: [],
    failures: [{ id: itemId || null, reason }],
    relocation: null,
  });

  const next = cloneForest(forest);
  const found = locate(next, itemId);
  if (!found) return fail("item not found");
  if (found.parent === null) return fail("this item is already at the top level");
  if (found.node.plannerType === "plan") return fail("plans cannot be promoted");
  const { node, parent, root } = found;

  parent.children.splice(parent.children.indexOf(node), 1);

  const hasChildren = node.children.length > 0;
  const promoted: DraftNode = {
    ...node,
    plannerType: hasChildren ? "goal" : "task",
    isReady: hasChildren
      ? node.deadline != null
        ? node.isReady === true
        : false
      : true,
    // The effective category is snapshotted on (root-only invariant); color
    // follows own -> old root's, with the save replay minting the
    // deterministic fallback when both are null.
    categoryId: root.categoryId ?? null,
    color: node.color || root.color || null,
    linkedItemId: null,
  };
  next.goals.push(promoted);

  // Emptied-source fixup: a childless ready goal root would start scheduling
  // its own stale duration.
  if (root.children.length === 0 && root.plannerType === "goal") {
    root.isReady = false;
  }

  return {
    forest: coerceForestTypes(next),
    updatedRootIds: [root.id, itemId],
    deletedGoalIds: [],
    failures: [],
    relocation: { kind: "promote", itemId },
  };
}

// Nest a top-level item as the LAST step of another top-level goal — the
// draft mirror of demoteRootIntoGoal. Dependency edges are preserved as
// node-level edges, so a demote that would manufacture a same-goal edge or
// close a loop through the combined step order is refused.
export function demoteDraftItem(
  forest: DraftForest,
  args: { itemId: string; targetRootId: string },
  precedence?: DraftPrecedenceState,
): DraftRelocationOpResult {
  const fail = (id: string, reason: string): DraftRelocationOpResult => ({
    forest,
    updatedRootIds: [],
    deletedGoalIds: [],
    failures: [{ id, reason }],
    relocation: null,
  });

  const next = cloneForest(forest);
  const source = next.goals.find((g) => g.id === args.itemId);
  if (!source) {
    return fail(
      args.itemId ?? "",
      "only top-level items can be nested (id not found at the top level)",
    );
  }
  if (source.plannerType === "plan") {
    return fail(args.itemId, "plans cannot be nested");
  }
  if (args.itemId === args.targetRootId) {
    return fail(args.itemId, "an item cannot be nested into itself");
  }
  const target = next.goals.find((g) => g.id === args.targetRootId);
  if (!target) return fail(args.targetRootId ?? "", "target not found at the top level");
  if (target.plannerType === "plan") {
    return fail(args.targetRootId, "plans cannot hold subtasks");
  }

  if (precedence) {
    const sourceIds = new Set<string>();
    const targetIds = new Set<string>();
    const collect = (node: DraftNode, into: Set<string>) => {
      if (node.id) into.add(node.id);
      for (const child of node.children) collect(child, into);
    };
    collect(source, sourceIds);
    collect(target, targetIds);
    const crosses = precedence.dependencies.some(
      (d) =>
        (sourceIds.has(d.predecessorId) && targetIds.has(d.successorId)) ||
        (targetIds.has(d.predecessorId) && sourceIds.has(d.successorId)),
    );
    if (crosses) {
      return fail(
        args.itemId,
        `a prerequisite links "${source.title}" with an item inside "${target.title}" — remove that dependency first`,
      );
    }
  }

  next.goals = next.goals.filter((g) => g.id !== args.itemId);
  const demoted: DraftNode = {
    ...source,
    // Own-value-first resolution would pin the subtree to a stale category;
    // the stale day cap and repeat rule are inert on nested rows but the
    // contract would heal them later — clear all three, plus the root-only
    // color/anchor (children inherit the target's color at save).
    categoryId: null,
    maxMinutesPerDay: null,
    recurrence: null,
    color: null,
    starts: null,
    isReady: null,
  };
  target.children.push(demoted);

  const validated = coerceForestTypes(next);
  if (precedence) {
    const cycle = draftValidateSubtreeOrder(validated, precedence, args.targetRootId);
    if (cycle) {
      return fail(
        args.itemId,
        "nesting would create a loop through existing dependencies and step orders — the move was not applied",
      );
    }
  }

  return {
    forest: validated,
    updatedRootIds: [args.targetRootId],
    deletedGoalIds: [args.itemId],
    failures: [],
    relocation: {
      kind: "demote",
      itemId: args.itemId,
      targetRootId: args.targetRootId,
    },
  };
}

// Pull capture-inbox jots into the working forest as plain top-level tasks.
// Entries are pre-resolved by the handler from the turn's inbox list; ids are
// the CANONICAL row ids (the save replay flips isTriaged on those rows, so
// the regular apply then retains them as roots).
export function triageDraftInboxItems(
  forest: DraftForest,
  entries: { id: string; title: string; notes: string | null }[],
): DraftOpsResult & { relocations: DraftRelocation[] } {
  const next = cloneForest(forest);
  const failures: DraftOpFailure[] = [];
  const relocations: DraftRelocation[] = [];
  const updatedRootIds: string[] = [];

  for (const entry of entries) {
    if (next.goals.some((g) => g.id === entry.id)) {
      failures.push({ id: entry.id, reason: "already in the library" });
      continue;
    }
    next.goals.push({
      id: entry.id,
      title: entry.title,
      plannerType: "task",
      // A placeholder the model is expected to right-size with update_items.
      duration: 30,
      deadline: null,
      priority: PRIORITY_DEFAULT,
      isReady: true,
      categoryId: null,
      color: null,
      splitting: null,
      maxMinutesPerDay: null,
      recurrence: null,
      earliestStartDate: null,
      allowedTimes: null,
      starts: null,
      locationId: null,
      notes: entry.notes,
      completed: false,
      linkedItemId: null,
      children: [],
    });
    updatedRootIds.push(entry.id);
    relocations.push({ kind: "triage", itemId: entry.id });
  }

  return {
    forest: next,
    updatedRootIds,
    deletedGoalIds: [],
    failures,
    relocations,
  };
}
