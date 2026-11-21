import type { Planner, SimpleEvent } from "@/types/prisma";
import { EventType } from "@/types/prisma";
import { startOfDay } from "@/utils/dateUtils";
import { plannerCompletedEnd } from "@/utils/plannerCompletion";

/**
 * Items needing triage in the capture queue: top-level, not completed, not
 * yet triaged. `isTriaged` is the explicit signal set by Capture on save,
 * which works uniformly across task/plan/goal regardless of duration.
 */
export function isUnprocessed(item: Planner): boolean {
  if (item.parentId) return false;
  if (plannerCompletedEnd(item)) return false;
  return !item.isTriaged;
}

export function isItemOverdue(item: Planner, now: Date): boolean {
  if (!item.deadline) return false;
  if (plannerCompletedEnd(item)) return false;
  return new Date(item.deadline) < startOfDay(now);
}

/**
 * Duration-weighted progress for a goal: sum of completed-leaf durations
 * over sum of all-leaf durations across the goal's descendant subtree.
 * Returns null for non-goals. For a leaf goal or a goal whose subtree has
 * zero total duration, falls back to the goal's own completion (0 or 1).
 */
export function getGoalDurationProgress(
  goal: Planner,
  allItems: Planner[],
): number | null {
  if (goal.plannerType !== "goal") return null;

  const childrenByParent = new Map<string, Planner[]>();
  for (const p of allItems) {
    if (!p.parentId) continue;
    const arr = childrenByParent.get(p.parentId);
    if (arr) arr.push(p);
    else childrenByParent.set(p.parentId, [p]);
  }

  let totalDuration = 0;
  let completedDuration = 0;

  const stack: Planner[] = [goal];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop() as Planner;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const children = childrenByParent.get(node.id);
    if (!children || children.length === 0) {
      if (node.id === goal.id) continue;
      const d = node.duration ?? 0;
      totalDuration += d;
      if (plannerCompletedEnd(node)) completedDuration += d;
    } else {
      for (const c of children) stack.push(c);
    }
  }

  if (totalDuration === 0) {
    return plannerCompletedEnd(goal) ? 1 : 0;
  }
  return completedDuration / totalDuration;
}

/**
 * Total remaining duration for an item with descendants: sum of leaf
 * durations whose `completedEndTime` is unset. Returns null for items with
 * no children (caller should fall back to the item's own duration).
 */
export function getRolledUpRemainingDuration(
  item: Planner,
  allItems: Planner[],
): number | null {
  const childrenByParent = new Map<string, Planner[]>();
  for (const p of allItems) {
    if (!p.parentId) continue;
    const arr = childrenByParent.get(p.parentId);
    if (arr) arr.push(p);
    else childrenByParent.set(p.parentId, [p]);
  }

  if (!childrenByParent.get(item.id)?.length) return null;

  let remaining = 0;
  const stack: Planner[] = [item];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop() as Planner;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const children = childrenByParent.get(node.id);
    if (!children || children.length === 0) {
      if (node.id === item.id) continue;
      if (!plannerCompletedEnd(node)) remaining += node.duration ?? 0;
    } else {
      for (const c of children) stack.push(c);
    }
  }

  return remaining;
}

/**
 * Leaf-count progress for a goal's descendant subtree: {done, total} where
 * done is the number of leaves with completedEndTime set. The goal itself
 * is excluded when it has no children (so a leaf goal returns 0/0). Pairs
 * with getGoalDurationProgress when the UI wants a count rather than a
 * duration ratio.
 */
export function getGoalLeafCounts(
  goal: Planner,
  allItems: Planner[],
): { done: number; total: number } {
  const childrenByParent = new Map<string, Planner[]>();
  for (const p of allItems) {
    if (!p.parentId) continue;
    const arr = childrenByParent.get(p.parentId);
    if (arr) arr.push(p);
    else childrenByParent.set(p.parentId, [p]);
  }

  let total = 0;
  let done = 0;
  const stack: Planner[] = [goal];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop() as Planner;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    const children = childrenByParent.get(node.id);
    if (!children || children.length === 0) {
      if (node.id === goal.id) continue;
      total++;
      if (plannerCompletedEnd(node)) done++;
    } else {
      for (const c of children) stack.push(c);
    }
  }
  return { done, total };
}

/**
 * Earliest planner-type SimpleEvent at or after `now` whose event id maps
 * to a descendant of `goal` (engine emits planner events with
 * `event.id === planner.id`). Used to surface "what's the next thing
 * scheduled toward this goal."
 */
export function getNextScheduledForGoal(
  goal: Planner,
  allItems: Planner[],
  calendar: SimpleEvent[],
  now: Date,
): SimpleEvent | undefined {
  const childrenByParent = new Map<string, string[]>();
  for (const p of allItems) {
    if (!p.parentId) continue;
    const arr = childrenByParent.get(p.parentId);
    if (arr) arr.push(p.id);
    else childrenByParent.set(p.parentId, [p.id]);
  }

  const descendants = new Set<string>();
  const stack = [goal.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (descendants.has(id)) continue;
    descendants.add(id);
    const children = childrenByParent.get(id);
    if (children) for (const c of children) stack.push(c);
  }

  const nowMs = now.getTime();
  let best: { event: SimpleEvent; startMs: number } | undefined;
  for (const event of calendar) {
    if (event.extendedProps?.eventType !== EventType.planner) continue;
    if (!descendants.has(event.id)) continue;
    const startMs = new Date(event.start).getTime();
    if (startMs < nowMs) continue;
    if (!best || startMs < best.startMs) best = { event, startMs };
  }
  return best?.event;
}
