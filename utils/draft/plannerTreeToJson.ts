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
  // Flexible repeat rule for top-level task/goal roots: one auto-placed
  // occurrence per period (the whole subtree for a goal). Splitting-style
  // null contract — a retained root re-emitted without it stops repeating.
  // Children always carry null, and PLAN recurrence never rides this field
  // (a plan's fixed-anchor repeat + exceptions stay outside the contract,
  // spread-preserved on retained rows).
  recurrence?: PlanRecurrenceRule | null;
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
    recurrence:
      root.plannerType === "plan" ? null : parsePlanRecurrence(root.recurrence),
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
    children: orderedChildren.map((child) => buildDraftNode(planner, child)),
  };
}
