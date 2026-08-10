import type { Planner } from "@/types/prisma";
import type { PlannerType } from "@/generated/client";
import { getSubtasksById } from "@/utils/goalPageHandlers";
import { sortSiblings } from "@/utils/goal-handlers/sortOrderKeys";
import {
  parseTaskSplitting,
  type TaskSplittingSettings,
} from "@/utils/taskSplitting";
import {
  parsePlanRecurrence,
  type PlanRecurrenceRule,
} from "@/utils/planRecurrence";
import {
  parseAllowedTimes,
  type AllowedTimesSettings,
} from "@/utils/allowedTimes";
import { plannerIsCompleted } from "@/utils/plannerCompletion";

// The JSON shape sent to the AI and rendered in the right pane of the draft
// modal. `sortOrder` is intentionally omitted — sibling order is array order,
// and fractional keys are stamped from array position on save.
// `categoryId` is meaningful on top-level goal roots only; children inherit
// via the existing category-inheritance logic and always carry null here.
export interface DraftNode {
  id: string;
  title: string;
  plannerType: PlannerType;
  duration: number;
  deadline: string | null;
  priority: number;
  isReady: boolean | null;
  categoryId: string | null;
  // Meaningful on top-level goal roots only, like categoryId — children inherit
  // the root's color at save time and always carry null here. Optional so the
  // many hand-built DraftNode literals (tests, ops) don't all need updating.
  color?: string | null;
  // Chunked-scheduling settings on schedulable leaves (never plans; inert on
  // parents). Part of the full-tree contract like deadline/priority: a
  // retained node re-emitted without it clears it. Optional so hand-built
  // literals stay valid; absent reads as null.
  splitting?: TaskSplittingSettings | null;
  // The goal's daily limit — max minutes of its subtree scheduled on any one
  // day. Top-level goal roots only (children carry null); full-tree contract
  // like splitting: a retained goal re-emitted without it clears it.
  maxMinutesPerDay?: number | null;
  // Repeat rule for top-level roots: on task/goal roots one flexibly
  // auto-placed occurrence per period (the whole subtree for a goal); on PLAN
  // roots the fixed-anchor repeat stepping from `starts`. Splitting-style
  // null contract — a retained root re-emitted without it stops repeating.
  // Children always carry null (nested plan recurrence stays outside the
  // contract, spread-preserved on retained rows).
  recurrence?: PlanRecurrenceRule | null;
  // The fixed start instant of a plan (ISO), null for a timeless plan. Plans
  // only — always null on tasks and goals. Rides every plan node so the
  // engine's anchor survives assistant round-trips.
  starts?: string | null;
  // The node's OWN location id (null = none set; the effective location may
  // still inherit from an ancestor or category). Rides every node; setting a
  // different value at save time pins the item there.
  locationId?: string | null;
  // Placement bounds for tasks and goals (never plans). UNLIKE the root-only
  // fields above, these ride EVERY node and inherit down the tree — a leaf is
  // bound by its own values AND every ancestor's, so buildDraftNode emits them
  // for every node and update_items can set them at any depth. Full-tree
  // contract like splitting: a retained node re-emitted without one clears it.
  // `earliestStartDate` is an ISO string (like deadline); `allowedTimes` is the
  // parsed {days, ranges} shape (like splitting carries the parsed object).
  earliestStartDate?: string | null;
  allowedTimes?: AllowedTimesSettings | null;
  // Free-form user notes. UNDEFINED-PRESERVE semantics, unlike every other
  // field: undefined (absent) means "leave as is" at apply time, null clears,
  // a string sets — so a model re-emit that omits notes can never wipe them.
  notes?: string | null;
  // Whether the item is completed (derived, type-aware — always false for
  // plans and flexibly recurring roots). Same undefined-preserve semantics:
  // only an explicit true/false changes completion at apply time.
  completed?: boolean;
  children: DraftNode[];
}

export function plannerTreeToJson(
  planner: Planner[],
  rootId: string,
): DraftNode | null {
  const root = planner.find((p) => p.id === rootId);
  if (!root) return null;
  const node = buildDraftNode(planner, root);
  return {
    ...node,
    categoryId: root.categoryId ?? null,
    color: root.color ?? null,
    maxMinutesPerDay: root.maxMinutesPerDay ?? null,
    recurrence: parsePlanRecurrence(root.recurrence),
  };
}

export function buildDraftNode(planner: Planner[], node: Planner): DraftNode {
  const orderedChildren = sortSiblings(getSubtasksById(planner, node.id));
  return {
    id: node.id,
    title: node.title,
    plannerType: node.plannerType,
    duration: node.duration,
    deadline: node.deadline ?? null,
    priority: node.priority,
    isReady: node.isReady ?? null,
    categoryId: null,
    color: null,
    splitting: parseTaskSplitting(node.splitting),
    maxMinutesPerDay: null,
    recurrence: null,
    // Per-node, inherited: emitted from every row's own columns (root override
    // in plannerTreeToJson is not needed, unlike categoryId/color/recurrence).
    // Never on plans (fixed anchors), mirroring plannerHasAllowedTimes.
    earliestStartDate:
      node.plannerType === "plan" ? null : node.earliestStartDate ?? null,
    allowedTimes:
      node.plannerType === "plan" ? null : parseAllowedTimes(node.allowedTimes),
    starts: node.plannerType === "plan" ? node.starts ?? null : null,
    locationId: node.locationId ?? null,
    notes: node.notes ?? null,
    completed: plannerIsCompleted(node),
    children: orderedChildren.map((child) => buildDraftNode(planner, child)),
  };
}
