import type { Planner } from "@/types/prisma";
import { PlannerType } from "@/types/prisma";
import { plannerCompletedEnd } from "@/utils/plannerCompletion";

// Toggling completion for a leaf subtask is a two-step process: flip the
// leaf's own completedStartTime/completedEndTime, then walk up the parent
// chain re-deriving each ancestor's completion from its immediate children.
// All-complete children -> parent is complete (end = max child end, start =
// min child start). Anything not complete -> parent is cleared.

export function toggleSubtaskCompletion(
  planner: Planner[],
  taskId: string,
): Planner[] {
  const task = planner.find((p) => p.id === taskId);
  if (!task || task.plannerType === PlannerType.plan) return planner;

  const willComplete = !task.completedEndTime;
  const now = new Date();

  const next = planner.map((p) => {
    if (p.id !== taskId) return p;
    if (!willComplete) {
      return {
        ...p,
        completedStartTime: null,
        completedEndTime: null,
        updatedAt: now.toISOString(),
      };
    }
    const end = now;
    const start = new Date(end.getTime() - (p.duration ?? 0) * 60_000);
    return {
      ...p,
      completedStartTime: start.toISOString(),
      completedEndTime: end.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  return recomputeAncestors(next, task.parentId);
}

export function setSubtaskCompletedAt(
  planner: Planner[],
  taskId: string,
  endIso: string | null,
): Planner[] {
  const task = planner.find((p) => p.id === taskId);
  if (!task || task.plannerType === PlannerType.plan) return planner;

  const now = new Date();
  const next = planner.map((p) => {
    if (p.id !== taskId) return p;
    if (!endIso) {
      return {
        ...p,
        completedStartTime: null,
        completedEndTime: null,
        updatedAt: now.toISOString(),
      };
    }
    const end = new Date(endIso);
    const start = new Date(end.getTime() - (p.duration ?? 0) * 60_000);
    return {
      ...p,
      completedStartTime: start.toISOString(),
      completedEndTime: end.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  return recomputeAncestors(next, task.parentId);
}

// Re-time an already-completed leaf by dragging/resizing its calendar tile:
// write the dragged window verbatim (unlike setSubtaskCompletedAt, which
// derives the start from duration), then re-derive ancestor completion.
export function setCompletedWindow(
  planner: Planner[],
  taskId: string,
  startIso: string,
  endIso: string,
): Planner[] {
  const task = planner.find((p) => p.id === taskId);
  if (!task || task.plannerType === PlannerType.plan) return planner;

  const now = new Date();
  const next = planner.map((p) =>
    p.id === taskId
      ? {
          ...p,
          completedStartTime: startIso,
          completedEndTime: endIso,
          updatedAt: now.toISOString(),
        }
      : p,
  );

  return recomputeAncestors(next, task.parentId);
}

function recomputeAncestors(
  planner: Planner[],
  startParentId: string | null,
): Planner[] {
  let next = planner;
  let currentId: string | null = startParentId;
  const visited = new Set<string>();
  const now = new Date();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parent = next.find((p) => p.id === currentId);
    if (!parent) break;

    const children = next.filter((p) => p.parentId === currentId);
    if (children.length === 0) {
      currentId = parent.parentId;
      continue;
    }

    const allComplete = children.every((c) => !!plannerCompletedEnd(c));

    if (allComplete) {
      const endTimes = children.map((c) =>
        new Date(c.completedEndTime as string).getTime(),
      );
      const startTimes = children.map((c) =>
        c.completedStartTime
          ? new Date(c.completedStartTime).getTime()
          : new Date(c.completedEndTime as string).getTime(),
      );
      const maxEnd = new Date(Math.max(...endTimes)).toISOString();
      const minStart = new Date(Math.min(...startTimes)).toISOString();
      next = next.map((p) =>
        p.id === parent.id
          ? {
              ...p,
              completedStartTime: minStart,
              completedEndTime: maxEnd,
              updatedAt: now.toISOString(),
            }
          : p,
      );
    } else if (parent.completedEndTime) {
      next = next.map((p) =>
        p.id === parent.id
          ? {
              ...p,
              completedStartTime: null,
              completedEndTime: null,
              updatedAt: now.toISOString(),
            }
          : p,
      );
    }

    currentId = parent.parentId;
  }

  return next;
}
