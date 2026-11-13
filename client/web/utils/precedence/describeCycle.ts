import type { Planner, Queue } from "@/types/prisma";
import type { PrecedenceEdge } from "./types";
import { getRootParentId } from "@/utils/goalPageHandlers";

// Human-readable cycle path for the block-and-explain surfaces (dependency
// picker, queue reorder refusal): titles joined by arrows, queue hops named
// ("through the Work queue"), internal hops named ("through <goal>'s step
// order" — consecutive internal edges inside one goal collapse to a single
// hop). Expanded edges display their authored endpoint (fromNodeId/toNodeId),
// not the boundary leaf. Null-safe on deleted rows.
export function describeCycle(
  cycle: PrecedenceEdge[],
  planners: Planner[],
  queues: Queue[],
): string {
  if (cycle.length === 0) return "";
  const plannerById = new Map(planners.map((p) => [p.id, p]));
  const queueById = new Map(queues.map((q) => [q.id, q]));
  const title = (id: string) => plannerById.get(id)?.title ?? "an item";

  const parts: string[] = [
    `"${title(cycle[0].fromNodeId ?? cycle[0].fromId)}"`,
  ];
  let pendingInternalRoot: string | null = null;
  for (const edge of cycle) {
    if (edge.source === "internal") {
      pendingInternalRoot =
        getRootParentId(planners, edge.toId) ?? pendingInternalRoot;
      continue;
    }
    const hopId = edge.toNodeId ?? edge.toId;
    let hop = `"${title(hopId)}"`;
    if (pendingInternalRoot) {
      hop = `${hop} (through "${title(pendingInternalRoot)}"'s step order)`;
      pendingInternalRoot = null;
    } else if (edge.source === "queue" && edge.queueId) {
      const queue = queueById.get(edge.queueId);
      if (queue) hop = `${hop} (through the ${queue.title} queue)`;
    }
    parts.push(hop);
  }
  if (pendingInternalRoot) {
    parts.push(`(through "${title(pendingInternalRoot)}"'s step order)`);
  }
  return parts.join(" → ");
}
