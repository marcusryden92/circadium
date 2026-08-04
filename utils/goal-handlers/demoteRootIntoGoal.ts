import { Planner, PlannerType, Queue, PlannerDependency } from "@/types/prisma";
import {
  getRootParentId,
  getSubtasksById,
  getTaskTreeIds,
} from "@/utils/goalPageHandlers";
import { validateSubtreeOrder } from "@/utils/precedence/findCycle";
import { describeCycle } from "@/utils/precedence/describeCycle";
import { appendKey } from "./sortOrderKeys";

export interface DemoteError {
  error: string;
}

// Nest an existing top-level item as the LAST child of another top-level
// goal. Pure and immutable; dispatch the result through updatePlannerArray —
// the thunk's central pruning is the executor for the dropped queue
// membership and stale detour links (do not prune here). Dependency edges
// are PRESERVED — they become node-level edges gating through the new root —
// so a demote that would manufacture a same-goal edge or close a loop
// through the target's step order is refused.
export function demoteRootIntoGoal(
  planner: Planner[],
  rootId: string,
  targetRootId: string,
  queues: Queue[] = [],
  dependencies: PlannerDependency[] = [],
): Planner[] | DemoteError {
  const source = planner.find((p) => p.id === rootId);
  if (!source) return { error: "Item not found." };
  if (source.parentId != null) {
    return { error: "Only top-level items can be nested." };
  }
  if (source.plannerType === PlannerType.plan) {
    return { error: "Plans cannot be nested." };
  }
  if (rootId === targetRootId) {
    return { error: "An item cannot be nested into itself." };
  }
  const target = planner.find((p) => p.id === targetRootId);
  if (!target) return { error: "Target not found." };
  if (target.parentId != null) {
    return { error: "The target must be a top-level item." };
  }
  if (target.plannerType === PlannerType.plan) {
    return { error: "Plans cannot hold subtasks." };
  }

  const now = new Date().toISOString();
  const sortOrder = appendKey(getSubtasksById(planner, targetRootId));
  // Readiness is a whole-tree property — mixed flags inside one tree are
  // latent corruption (the engine reads only the root flag).
  const targetReady = target.isReady === true;
  const treeIds = new Set(getTaskTreeIds(planner, rootId));

  // Preserved dependency edges must stay legal after the move. An edge
  // between the demoted subtree and the target's tree becomes a same-goal
  // edge (banned outright); deeper node edges can close a loop through the
  // combined step order.
  const targetTreeIds = new Set(getTaskTreeIds(planner, targetRootId));
  const crossesIntoTarget = dependencies.some((d) => {
    const a = treeIds.has(d.predecessorId) && targetTreeIds.has(d.successorId);
    const b = targetTreeIds.has(d.predecessorId) && treeIds.has(d.successorId);
    return a || b;
  });
  if (crossesIntoTarget) {
    return {
      error: `A prerequisite links "${source.title || "this item"}" with an item inside "${target.title || "that goal"}" — remove the dependency first.`,
    };
  }

  // The subtree joins the target's calendar block, so it adopts its color.
  const targetColor = target.color ?? null;

  const result = planner.map((p) => {
    if (p.id === rootId) {
      return {
        ...p,
        parentId: targetRootId,
        sortOrder,
        // Resolution is own-value-first: a kept stale category would pin the
        // whole subtree to the old category, strict windows included. The
        // stale day cap is runtime-inert on nested rows but the draft
        // contract would silently heal it later — clear both.
        categoryId: null,
        maxMinutesPerDay: null,
        isReady: targetReady,
        color: targetColor ?? p.color,
        updatedAt: now,
      };
    }
    if (treeIds.has(p.id)) {
      const readyChanged = (p.isReady === true) !== targetReady;
      const colorChanged = targetColor !== null && p.color !== targetColor;
      if (readyChanged || colorChanged) {
        return {
          ...p,
          isReady: targetReady,
          color: colorChanged ? targetColor : p.color,
          updatedAt: now,
        };
      }
    }
    return p;
  });

  const cycle = validateSubtreeOrder(result, queues, dependencies, targetRootId);
  if (cycle) {
    return {
      error: `Nesting would create a loop: ${describeCycle(cycle, result, queues)}`,
    };
  }

  return result;
}

export interface DemoteLossManifest {
  queueTitle: string | null;
  // Titles of predecessors this item depends on (edges PRESERVED as
  // node-level edges — the demoted work still waits for them).
  dependsOnTitles: string[];
  // Titles of successors that depend on this item (edges PRESERVED — they
  // now wait for the demoted work inside its new goal).
  requiredByTitles: string[];
  // Roots whose placeholder links INTO the demoted item (links cleared).
  inboundHostTitles: string[];
  // Targets of placeholders INSIDE the demoted subtree (links survive but
  // their ordering context changes with the new root).
  outboundTargetTitles: string[];
}

// Everything the demote changes about the item's connections — computed
// BEFORE dispatch so the confirm can enumerate it. Queue membership and
// inbound detour links are dropped by the thunk's central pruning (root-only
// predicates); dependency edges survive as node-level edges.
export function buildDemoteLossManifest(
  planner: Planner[],
  queues: Queue[],
  dependencies: PlannerDependency[],
  rootId: string,
): DemoteLossManifest {
  const plannerById = new Map(planner.map((p) => [p.id, p]));
  const title = (id: string) => plannerById.get(id)?.title || "Untitled";

  const queue =
    queues.find((q) => q.members.some((m) => m.plannerId === rootId)) ?? null;

  const dependsOnTitles = dependencies
    .filter((d) => d.successorId === rootId)
    .map((d) => title(d.predecessorId));
  const requiredByTitles = dependencies
    .filter((d) => d.predecessorId === rootId)
    .map((d) => title(d.successorId));

  const treeIds = new Set(getTaskTreeIds(planner, rootId));
  const inboundHostTitles: string[] = [];
  const outboundTargetTitles: string[] = [];
  for (const p of planner) {
    if (!p.linkedItemId) continue;
    if (p.linkedItemId === rootId && !treeIds.has(p.id)) {
      const hostRootId = getRootParentId(planner, p.id) ?? p.id;
      inboundHostTitles.push(title(hostRootId));
    }
    if (treeIds.has(p.id)) {
      outboundTargetTitles.push(title(p.linkedItemId));
    }
  }

  return {
    queueTitle: queue ? queue.title || "Untitled queue" : null,
    dependsOnTitles,
    requiredByTitles,
    inboundHostTitles,
    outboundTargetTitles,
  };
}
