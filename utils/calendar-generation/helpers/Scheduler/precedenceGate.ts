import type { Planner, SimpleEvent } from "@/types/prisma";
import type { PrecedenceEdge } from "@/utils/precedence/types";
import { plannerIdFromEventId } from "../../../planRecurrence";
import { plannerCompletedEnd } from "../../../plannerCompletion";
import { getTaskTreeIds } from "../../../goalPageHandlers";

// Placement-gate bookkeeping for precedence chains. The gate bounds each
// candidate to start after the max end across all PLACED predecessors; a
// failed predecessor breaks the chain loudly (sequence break), and a
// predecessor with no outcome yet keeps the successor waiting. Keys are
// anchors — root ids for queue edges, any node id for dependency edges.

export type ChainFailCause = "failed" | "unready" | "horizon";

export type ChainOutcome =
  | { status: "placed"; lastEnd?: Date }
  // A failed predecessor still carries the max end of whatever it DID place
  // (its scheduled leaves) so the successor is bounded after that work rather
  // than scheduling unbounded — a broken sequence must not let the successor
  // slot in BEFORE the predecessor's placed events. Absent when it placed
  // nothing (then the successor is genuinely unbounded).
  | { status: "failed"; failCause: ChainFailCause; lastEnd?: Date };

export type SequenceBreak = {
  source: "queue" | "dependency";
  queueId?: string;
  fromId: string;
  toId: string;
  cause: ChainFailCause;
};

/**
 * Seed outcomes for edge sources that are NOT scheduling candidates this run
 * (a source may be any node, not just a root):
 * - A completed source node resolves `placed` at its own completion end
 *   (completedEndTime or the last completed segment).
 * - Sources with pre-existing subtree events (memoized past placements,
 *   completed split segments) resolve `placed` with the max end across the
 *   subtree — past-only, effectively unconstraining. Events are matched to
 *   their source planner via the composite-id prefix (chunk `|chunk:n` /
 *   segment `|done:start` ids), never raw id equality.
 * - A source under an unready CONTAINING ROOT goal resolves
 *   `failed`/`unready` so the defensive fallback is loud (a prerequisite
 *   never stops being a prerequisite) — the cause comes from the root's
 *   readiness, not the endpoint row's own type, so a task-typed subtask
 *   under an unready goal reports `unready`, not `failed`. Queue edges never
 *   reach here with an unready goal — the edge builder chains through them
 *   silently.
 * - Anything else unseedable resolves `failed` — a starvation guard so a
 *   successor never waits forever on a source that cannot produce events.
 *
 * The caller deletes premature seeds for sources whose leaves ARE in this
 * run's pool (interior anchors of active candidates, spliced detour
 * targets) — the loop resolves those as their leaves place.
 */
export function seedChainOutcomes(
  edges: PrecedenceEdge[],
  candidates: Planner[],
  allPlanners: Planner[],
  scheduledEvents: SimpleEvent[],
): Map<string, ChainOutcome> {
  const outcomes = new Map<string, ChainOutcome>();
  const candidateIds = new Set(candidates.map((c) => c.id));
  const plannerById = new Map(allPlanners.map((p) => [p.id, p]));

  const sourceIds = new Set<string>();
  for (const edge of edges) sourceIds.add(edge.fromId);

  const unseededSources = [...sourceIds].filter(
    (id) => !candidateIds.has(id) && !outcomes.has(id),
  );
  if (unseededSources.length === 0) return outcomes;

  // Containing-root row with cycle guard.
  const rootRowOf = (id: string): Planner | undefined => {
    const seen = new Set<string>([id]);
    let current = plannerById.get(id);
    while (current?.parentId) {
      const parent = plannerById.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current;
  };

  const eventEnds: { plannerId: string; end: Date }[] = [];
  for (const event of scheduledEvents) {
    if (event.extendedProps?.eventType !== "planner") continue;
    eventEnds.push({
      plannerId: plannerIdFromEventId(event.id),
      end: new Date(event.end),
    });
  }

  for (const sourceId of unseededSources) {
    const planner = plannerById.get(sourceId);

    const completedEnd = planner ? plannerCompletedEnd(planner) : null;
    if (completedEnd) {
      outcomes.set(sourceId, {
        status: "placed",
        lastEnd: new Date(completedEnd),
      });
      continue;
    }

    let lastEnd: Date | undefined;
    if (planner) {
      const subtree = new Set(getTaskTreeIds(allPlanners, sourceId));
      for (const e of eventEnds) {
        if (!subtree.has(e.plannerId)) continue;
        if (!lastEnd || e.end > lastEnd) lastEnd = e.end;
      }
    }
    if (lastEnd) {
      outcomes.set(sourceId, { status: "placed", lastEnd });
      continue;
    }

    const root = planner ? rootRowOf(sourceId) : undefined;
    if (root && root.plannerType === "goal" && root.isReady !== true) {
      outcomes.set(sourceId, { status: "failed", failCause: "unready" });
    } else {
      outcomes.set(sourceId, { status: "failed", failCause: "failed" });
    }
  }

  return outcomes;
}

export type GateDecision =
  | { blocked: true }
  | {
      blocked: false;
      afterTime: Date | undefined;
      failedEdges: { edge: PrecedenceEdge; cause: ChainFailCause }[];
    };

/**
 * Gate a candidate against its incoming edges. Blocked (predecessor outcome
 * still missing) means "skip this pass, stay a candidate"; otherwise the
 * candidate schedules bounded by the max end over the PLACED subset
 * (unbounded when none placed), with one recorded break per failed edge.
 */
export function gateCandidate(
  plannerId: string,
  predecessorMap: Map<string, PrecedenceEdge[]>,
  chainOutcome: Map<string, ChainOutcome>,
): GateDecision {
  const incoming = predecessorMap.get(plannerId);
  if (!incoming || incoming.length === 0) {
    return { blocked: false, afterTime: undefined, failedEdges: [] };
  }

  let afterTime: Date | undefined;
  const failedEdges: { edge: PrecedenceEdge; cause: ChainFailCause }[] = [];

  for (const edge of incoming) {
    const outcome = chainOutcome.get(edge.fromId);
    if (!outcome) return { blocked: true };
    // Both placed and failed outcomes bound the successor after the
    // predecessor's placed work; a failed one additionally records the break.
    if (outcome.lastEnd && (!afterTime || outcome.lastEnd > afterTime)) {
      afterTime = outcome.lastEnd;
    }
    if (outcome.status === "failed") {
      failedEdges.push({ edge, cause: outcome.failCause });
    }
  }

  return { blocked: false, afterTime, failedEdges };
}

/** Dedupe-and-record sequence breaks (one per edge+cause across passes). */
export function recordSequenceBreaks(
  breaks: SequenceBreak[],
  seen: Set<string>,
  failedEdges: { edge: PrecedenceEdge; cause: ChainFailCause }[],
): void {
  for (const { edge, cause } of failedEdges) {
    // The gated builder only emits queue/dependency edges — `internal` is a
    // validation-graph concept and never reaches the gate.
    if (edge.source === "internal") continue;
    const key = `${edge.source}|${edge.queueId ?? ""}|${edge.fromId}|${edge.toId}|${cause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    breaks.push({
      source: edge.source,
      queueId: edge.queueId,
      fromId: edge.fromId,
      toId: edge.toId,
      cause,
    });
  }
}
