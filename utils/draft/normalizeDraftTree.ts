import type { DraftNode } from "./plannerTreeToJson";
import { normalizeTaskSplittingSettings } from "@/utils/taskSplitting";
import { clampPriority, PRIORITY_DEFAULT } from "@/utils/plannerPriority";
import type { PlanRecurrenceRule } from "@/utils/planRecurrence";

// Model-supplied repeat rule -> a valid PlanRecurrenceRule or null. Kept local
// (rather than reusing parsePlanRecurrence, which takes a JSON string) because
// the draft contract carries the rule as a plain object.
export function normalizeDraftRecurrence(
  raw: unknown,
): PlanRecurrenceRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rule = raw as Record<string, unknown>;
  if (
    rule.freq !== "daily" &&
    rule.freq !== "weekly" &&
    rule.freq !== "monthly"
  ) {
    return null;
  }
  const interval =
    typeof rule.interval === "number" && rule.interval >= 1
      ? Math.floor(rule.interval)
      : 1;
  const until =
    typeof rule.until === "string" && !isNaN(new Date(rule.until).getTime())
      ? rule.until
      : null;
  return { freq: rule.freq, interval, until };
}

// Partial-JSON parses of a streaming tool input can hand back nodes with
// missing fields — most commonly `children` still undefined because the array
// hasn't started yet. Normalize the tree at the ingestion seam so downstream
// code (renderer, diff, save) can rely on a complete DraftNode shape.
export function normalizeDraftTree(raw: unknown): DraftNode | null {
  if (!raw || typeof raw !== "object") return null;
  const node = raw as Record<string, unknown>;

  const title = typeof node.title === "string" ? node.title : "";
  const plannerType =
    node.plannerType === "task" ||
    node.plannerType === "plan" ||
    node.plannerType === "goal"
      ? node.plannerType
      : "task";
  const duration = typeof node.duration === "number" ? node.duration : 0;
  const priority =
    typeof node.priority === "number"
      ? clampPriority(node.priority)
      : PRIORITY_DEFAULT;
  const id = typeof node.id === "string" ? node.id : "";
  const deadline = typeof node.deadline === "string" ? node.deadline : null;
  const isReady = typeof node.isReady === "boolean" ? node.isReady : null;
  const categoryId =
    typeof node.categoryId === "string" && node.categoryId.length > 0
      ? node.categoryId
      : null;
  const color =
    typeof node.color === "string" && node.color.length > 0 ? node.color : null;
  const splitting = normalizeTaskSplittingSettings(node.splitting);
  const maxMinutesPerDay =
    typeof node.maxMinutesPerDay === "number" &&
    Number.isFinite(node.maxMinutesPerDay) &&
    node.maxMinutesPerDay > 0
      ? Math.floor(node.maxMinutesPerDay)
      : null;
  const recurrence = normalizeDraftRecurrence(node.recurrence);

  const rawChildren = Array.isArray(node.children) ? node.children : [];
  const children = rawChildren
    .map((child) => normalizeDraftTree(child))
    .filter((child): child is DraftNode => child !== null);

  return {
    id,
    title,
    // Structure decides type: a node holding children is always a goal.
    plannerType: children.length > 0 ? "goal" : plannerType,
    duration,
    // Flexible recurrence and a deadline are mutually exclusive — each
    // occurrence derives its deadline from its own period end.
    deadline: recurrence ? null : deadline,
    priority,
    isReady,
    categoryId,
    color,
    splitting,
    maxMinutesPerDay,
    recurrence,
    children,
  };
}

// The same hasChildren-implies-goal rule applied to an already-built tree (the
// ops mutate DraftNodes in place rather than re-parsing them, so a former leaf
// that just gained children needs its type corrected). Mirrors the save-time
// normalizePlannerType so the review pane, the model's fetched trees, and the
// persisted rows all agree that anything with subtasks is a goal.
export function coerceParentTypes(node: DraftNode): DraftNode {
  if (node.children.length === 0) return node;
  return {
    ...node,
    plannerType: "goal",
    children: node.children.map(coerceParentTypes),
  };
}
