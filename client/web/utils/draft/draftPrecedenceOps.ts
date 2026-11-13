import { v4 as uuidv4 } from "uuid";
import { isHexColor } from "@/utils/colorUtils";
import { findCycleInGraph } from "@/utils/precedence/findCycle";
import type { PrecedenceEdge } from "@/utils/precedence/types";
import type { DraftOpFailure } from "./draftForestOps";
import type { DraftForest } from "./plannerForestToJson";
import type { DraftNode } from "./plannerTreeToJson";
import {
  buildDraftLeafGraph,
  dependencyKey,
  MAX_DRAFT_QUEUE_TITLE_CHARS,
  type DraftPrecedenceState,
  type DraftQueue,
} from "./draftPrecedence";

// Deterministic operations on the assistant's working precedence state,
// executed server-side like the other draft domains: the model states intent,
// code performs the mutation, and the route emits the full next state
// wholesale. Every mutation that could close a loop runs the shared cycle
// validators over the merged graph (queue chains + dependency edges) BEFORE
// accepting — a refused entry carries the closing path in its failure reason
// so the model can explain it in plain words.

export interface DraftPrecedenceOpsResult {
  state: DraftPrecedenceState;
  changed: boolean;
  failures: DraftOpFailure[];
}

export interface DraftQueueUpdate {
  id: string;
  title?: string;
  categoryId?: string | null;
  color?: string | null;
}

function collectNodeTitles(forest: DraftForest): Map<string, string> {
  const titles = new Map<string, string>();
  const walk = (node: DraftNode) => {
    if (node.id) titles.set(node.id, node.title);
    for (const child of node.children) walk(child);
  };
  for (const goal of forest.goals) walk(goal);
  return titles;
}

// Mirror of describeCycle for draft shapes: titles joined by arrows, queue
// hops named. Cycles come from the leaf-granular graph, so an edge's node ids
// (when present) name the authored endpoints and internal step-order hops are
// folded into the arrow rather than listed. The route feeds this to the
// model, which relays it in prose.
function describeDraftCycle(
  cycle: PrecedenceEdge[],
  state: DraftPrecedenceState,
  forest: DraftForest,
): string {
  const authored = cycle.filter((e) => e.source !== "internal");
  if (authored.length === 0) return "";
  const titles = collectNodeTitles(forest);
  const titleOf = (edge: PrecedenceEdge, which: "from" | "to") => {
    const id =
      which === "from" ? edge.fromNodeId ?? edge.fromId : edge.toNodeId ?? edge.toId;
    return titles.get(id) ?? "an item";
  };
  const queueById = new Map(state.queues.map((q) => [q.id, q]));
  const parts: string[] = [`"${titleOf(authored[0], "from")}"`];
  for (const edge of authored) {
    const hop = `"${titleOf(edge, "to")}"`;
    if (edge.source === "queue" && edge.queueId) {
      const queue = queueById.get(edge.queueId);
      parts.push(queue ? `${hop} (through the ${queue.title} queue)` : hop);
    } else {
      parts.push(hop);
    }
  }
  return parts.join(" → ");
}

// Endpoint eligibility for queue member adds. Null when valid.
function endpointFailure(
  forest: DraftForest,
  plannerId: string,
): string | null {
  const root = forest.goals.find((g) => g.id === plannerId);
  if (!root) {
    return "not a top-level item — only top-level tasks and goals qualify (use an id from the goal index)";
  }
  if (root.plannerType === "plan") {
    return "a plan — plans have fixed start times and cannot be sequenced";
  }
  if ((root.recurrence ?? null) !== null) {
    return "a repeating item — each occurrence schedules in its own period, so it cannot be sequenced";
  }
  return null;
}

// Dependency endpoints accept any node (subtasks included) — the mirror of
// isValidDependencyEndpoint: a non-plan node whose top-level root is a
// non-plan, non-repeating item. Returns the failure reason, or the node's
// structural root id for the same-goal check.
function resolveDependencyEndpoint(
  forest: DraftForest,
  plannerId: string,
): { failure: string } | { rootId: string } {
  for (const root of forest.goals) {
    const found = findNodeIn(root, plannerId);
    if (!found) continue;
    if (found.plannerType === "plan" || root.plannerType === "plan") {
      return {
        failure: "a plan — plans have fixed start times and cannot be sequenced",
      };
    }
    if ((root.recurrence ?? null) !== null) {
      return {
        failure:
          "part of a repeating item — each occurrence schedules in its own period, so it cannot be sequenced",
      };
    }
    return { rootId: root.id };
  }
  return {
    failure:
      "not in the library — use an id from the goal index or search_items (subtask ids work too)",
  };
}

function findNodeIn(node: DraftNode, id: string): DraftNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeIn(child, id);
    if (found) return found;
  }
  return null;
}

const inAnyQueue = (state: DraftPrecedenceState, plannerId: string): boolean =>
  state.queues.some((q) => q.memberPlannerIds.includes(plannerId));

// Simulate inserting `plannerId` at `index` of `queueId` and check the merged
// graph. Returns the failure reason (with path) or null when legal.
function memberInsertionCycle(
  state: DraftPrecedenceState,
  queueId: string,
  plannerId: string,
  index: number,
  forest: DraftForest,
): string | null {
  const simulated: DraftPrecedenceState = {
    dependencies: state.dependencies,
    queues: state.queues.map((q) => {
      if (q.id !== queueId) return q;
      const memberPlannerIds = [...q.memberPlannerIds];
      memberPlannerIds.splice(
        Math.max(0, Math.min(index, memberPlannerIds.length)),
        0,
        plannerId,
      );
      return { ...q, memberPlannerIds };
    }),
  };
  // The leaf-granular graph so a loop closing through a goal's internal step
  // order (via node-level dependency edges) is caught, not just root chains.
  const cycle = findCycleInGraph(buildDraftLeafGraph(forest, simulated).edges);
  return cycle
    ? `would create a loop: ${describeDraftCycle(cycle, simulated, forest)}`
    : null;
}

function cloneQueues(state: DraftPrecedenceState): DraftQueue[] {
  return state.queues.map((q) => ({
    ...q,
    memberPlannerIds: [...q.memberPlannerIds],
  }));
}

function validTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_DRAFT_QUEUE_TITLE_CHARS
  );
}

// Creates queues, optionally with initial members (validated and inserted one
// at a time, so one bad member fails alone rather than sinking the queue).
// Model-supplied ids are discarded — the minted uuid becomes the DB id at Save.
export function addDraftQueues(
  state: DraftPrecedenceState,
  items: unknown[],
  forest: DraftForest,
  validCategoryIds: ReadonlySet<string>,
): DraftPrecedenceOpsResult {
  const failures: DraftOpFailure[] = [];
  let current: DraftPrecedenceState = state;
  let changed = false;

  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "object" || raw === null) {
      failures.push({ id: null, reason: "queue must be an object" });
      continue;
    }
    const obj = raw as Record<string, unknown>;
    if (!validTitle(obj.title)) {
      failures.push({
        id: null,
        reason: `title must be a non-empty string of at most ${MAX_DRAFT_QUEUE_TITLE_CHARS} characters`,
      });
      continue;
    }
    const categoryId =
      obj.categoryId === undefined || obj.categoryId === null
        ? null
        : typeof obj.categoryId === "string"
          ? obj.categoryId
          : "";
    if (categoryId !== null && !validCategoryIds.has(categoryId)) {
      failures.push({ id: null, reason: `"${obj.title}": unknown categoryId` });
      continue;
    }

    if (obj.color !== undefined && obj.color !== null && !isHexColor(obj.color)) {
      failures.push({
        id: null,
        reason: `"${obj.title}": color must be a 6-digit hex string or null`,
      });
      continue;
    }
    const queue: DraftQueue = {
      id: uuidv4(),
      title: obj.title.trim(),
      categoryId,
      color: typeof obj.color === "string" ? obj.color : null,
      memberPlannerIds: [],
    };
    current = { queues: [...current.queues, queue], dependencies: current.dependencies };
    changed = true;

    const requestedMembers = Array.isArray(obj.memberPlannerIds)
      ? obj.memberPlannerIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    for (const plannerId of requestedMembers) {
      const result = tryInsertMember(current, queue.id, plannerId, Infinity, forest);
      if (typeof result === "string") {
        failures.push({ id: plannerId, reason: result });
      } else {
        current = result;
      }
    }
  }

  return { state: current, changed, failures };
}

export function updateDraftQueues(
  state: DraftPrecedenceState,
  updates: DraftQueueUpdate[],
  validCategoryIds: ReadonlySet<string>,
): DraftPrecedenceOpsResult {
  const queues = cloneQueues(state);
  const failures: DraftOpFailure[] = [];
  let changed = false;

  for (const update of updates) {
    const id = typeof update.id === "string" ? update.id : "";
    const target = queues.find((q) => q.id === id);
    if (!target) {
      failures.push({ id: id || null, reason: "queue not found" });
      continue;
    }
    if (update.title !== undefined && !validTitle(update.title)) {
      failures.push({
        id,
        reason: `title must be a non-empty string of at most ${MAX_DRAFT_QUEUE_TITLE_CHARS} characters`,
      });
      continue;
    }
    if (
      update.categoryId !== undefined &&
      update.categoryId !== null &&
      (typeof update.categoryId !== "string" ||
        !validCategoryIds.has(update.categoryId))
    ) {
      failures.push({ id, reason: "unknown categoryId" });
      continue;
    }
    if (
      update.color !== undefined &&
      update.color !== null &&
      !isHexColor(update.color)
    ) {
      failures.push({ id, reason: "color must be a 6-digit hex string or null" });
      continue;
    }
    if (
      update.title === undefined &&
      update.categoryId === undefined &&
      update.color === undefined
    ) {
      failures.push({ id, reason: "no fields to update" });
      continue;
    }
    if (update.title !== undefined) target.title = update.title.trim();
    if (update.categoryId !== undefined) target.categoryId = update.categoryId;
    if (update.color !== undefined) target.color = update.color;
    changed = true;
  }

  return { state: { queues, dependencies: state.dependencies }, changed, failures };
}

// Deleting a queue only removes ordering constraints — it can never close a
// loop, and the member items themselves are untouched.
export function deleteDraftQueues(
  state: DraftPrecedenceState,
  queueIds: string[],
): DraftPrecedenceOpsResult {
  const ids = [...new Set(queueIds.filter((id) => typeof id === "string"))];
  const failures: DraftOpFailure[] = [];
  const present = new Set(state.queues.map((q) => q.id));
  for (const id of ids) {
    if (!present.has(id)) failures.push({ id, reason: "queue not found" });
  }
  const remove = new Set(ids);
  const queues = state.queues.filter((q) => !remove.has(q.id));
  return {
    state: { queues, dependencies: state.dependencies },
    changed: queues.length !== state.queues.length,
    failures,
  };
}

// One member insertion: eligibility, one-queue rule, cycle simulation.
// Returns the next state, or the failure reason as a string.
function tryInsertMember(
  state: DraftPrecedenceState,
  queueId: string,
  plannerId: string,
  atIndex: number,
  forest: DraftForest,
): DraftPrecedenceState | string {
  const queue = state.queues.find((q) => q.id === queueId);
  if (!queue) return "queue not found";
  const eligibility = endpointFailure(forest, plannerId);
  if (eligibility) return eligibility;
  if (inAnyQueue(state, plannerId)) {
    return "already in a queue — an item can belong to only one queue (remove it from its current queue first)";
  }
  const index = Math.max(0, Math.min(atIndex, queue.memberPlannerIds.length));
  const cycleReason = memberInsertionCycle(
    state,
    queueId,
    plannerId,
    index,
    forest,
  );
  if (cycleReason) return cycleReason;

  return {
    dependencies: state.dependencies,
    queues: state.queues.map((q) => {
      if (q.id !== queueId) return q;
      const memberPlannerIds = [...q.memberPlannerIds];
      memberPlannerIds.splice(index, 0, plannerId);
      return { ...q, memberPlannerIds };
    }),
  };
}

export function addDraftQueueMembers(
  state: DraftPrecedenceState,
  args: { queueId: string; plannerIds: string[]; atIndex?: number },
  forest: DraftForest,
): DraftPrecedenceOpsResult {
  const failures: DraftOpFailure[] = [];
  let current = state;
  let changed = false;
  let index =
    typeof args.atIndex === "number" && Number.isInteger(args.atIndex)
      ? args.atIndex
      : Infinity;

  for (const plannerId of args.plannerIds) {
    const result = tryInsertMember(current, args.queueId, plannerId, index, forest);
    if (typeof result === "string") {
      failures.push({ id: plannerId, reason: result });
    } else {
      current = result;
      changed = true;
      if (index !== Infinity) index++;
    }
  }

  return { state: current, changed, failures };
}

// `toIndex` addresses the member order AFTER the moved entry is removed —
// the same convention as the UI choke point.
export function moveDraftQueueMember(
  state: DraftPrecedenceState,
  args: { queueId: string; plannerId: string; toIndex: number },
  forest: DraftForest,
): DraftPrecedenceOpsResult {
  const failures: DraftOpFailure[] = [];
  const queue = state.queues.find((q) => q.id === args.queueId);
  if (!queue) {
    return {
      state,
      changed: false,
      failures: [{ id: args.queueId || null, reason: "queue not found" }],
    };
  }
  if (!queue.memberPlannerIds.includes(args.plannerId)) {
    return {
      state,
      changed: false,
      failures: [{ id: args.plannerId || null, reason: "not a member of that queue" }],
    };
  }

  const withoutMoved = queue.memberPlannerIds.filter(
    (id) => id !== args.plannerId,
  );
  const index = Math.max(
    0,
    Math.min(
      Number.isInteger(args.toIndex) ? args.toIndex : withoutMoved.length,
      withoutMoved.length,
    ),
  );
  const memberPlannerIds = [...withoutMoved];
  memberPlannerIds.splice(index, 0, args.plannerId);

  const next: DraftPrecedenceState = {
    dependencies: state.dependencies,
    queues: state.queues.map((q) =>
      q.id === args.queueId ? { ...q, memberPlannerIds } : q,
    ),
  };
  const cycle = findCycleInGraph(buildDraftLeafGraph(forest, next).edges);
  if (cycle) {
    return {
      state,
      changed: false,
      failures: [
        {
          id: args.plannerId,
          reason: `would create a loop: ${describeDraftCycle(cycle, next, forest)}`,
        },
      ],
    };
  }
  return { state: next, changed: true, failures };
}

// Removals can never close a loop — no validation needed. Members are found
// by planner id across all queues (an item is in at most one).
export function removeDraftQueueMembers(
  state: DraftPrecedenceState,
  plannerIds: string[],
): DraftPrecedenceOpsResult {
  const ids = [...new Set(plannerIds.filter((id) => typeof id === "string"))];
  const failures: DraftOpFailure[] = [];
  for (const id of ids) {
    if (!inAnyQueue(state, id)) {
      failures.push({ id, reason: "not in any queue" });
    }
  }
  const remove = new Set(ids);
  let changed = false;
  const queues = state.queues.map((q) => {
    if (!q.memberPlannerIds.some((id) => remove.has(id))) return q;
    changed = true;
    return {
      ...q,
      memberPlannerIds: q.memberPlannerIds.filter((id) => !remove.has(id)),
    };
  });
  return {
    state: changed ? { queues, dependencies: state.dependencies } : state,
    changed,
    failures,
  };
}

// Adds prerequisite edges. Redundant with a queue's existing order is fine
// (decided semantics); contradictions are refused with the closing path.
export function addDraftDependencies(
  state: DraftPrecedenceState,
  items: unknown[],
  forest: DraftForest,
): DraftPrecedenceOpsResult {
  const failures: DraftOpFailure[] = [];
  let current = state;
  let changed = false;

  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "object" || raw === null) {
      failures.push({ id: null, reason: "dependency must be an object" });
      continue;
    }
    const obj = raw as Record<string, unknown>;
    const predecessorId =
      typeof obj.predecessorId === "string" ? obj.predecessorId : "";
    const successorId =
      typeof obj.successorId === "string" ? obj.successorId : "";
    if (!predecessorId || !successorId) {
      failures.push({
        id: null,
        reason: "predecessorId and successorId are required",
      });
      continue;
    }
    if (predecessorId === successorId) {
      failures.push({
        id: predecessorId,
        reason: "an item cannot depend on itself",
      });
      continue;
    }
    const predecessor = resolveDependencyEndpoint(forest, predecessorId);
    if ("failure" in predecessor) {
      failures.push({ id: predecessorId, reason: predecessor.failure });
      continue;
    }
    const successor = resolveDependencyEndpoint(forest, successorId);
    if ("failure" in successor) {
      failures.push({ id: successorId, reason: successor.failure });
      continue;
    }
    // Same-goal edges are banned outright — a goal's own steps are already
    // totally ordered by the subtask list (root <-> own-subtask included).
    if (predecessor.rootId === successor.rootId) {
      failures.push({
        id: successorId,
        reason:
          "both sides live in the same goal — its steps are already ordered by the subtask list (use move_item to reorder)",
      });
      continue;
    }
    const pair = { predecessorId, successorId };
    if (
      current.dependencies.some(
        (d) => dependencyKey(d) === dependencyKey(pair),
      )
    ) {
      failures.push({
        id: successorId,
        reason: "that dependency already exists",
      });
      continue;
    }
    const simulated: DraftPrecedenceState = {
      queues: current.queues,
      dependencies: [...current.dependencies, pair],
    };
    const cycle = findCycleInGraph(buildDraftLeafGraph(forest, simulated).edges);
    if (cycle) {
      failures.push({
        id: successorId,
        reason: `would create a loop: ${describeDraftCycle(cycle, simulated, forest)}`,
      });
      continue;
    }
    current = simulated;
    changed = true;
  }

  return { state: current, changed, failures };
}

export function removeDraftDependencies(
  state: DraftPrecedenceState,
  items: unknown[],
): DraftPrecedenceOpsResult {
  const failures: DraftOpFailure[] = [];
  const removeKeys = new Set<string>();

  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "object" || raw === null) {
      failures.push({ id: null, reason: "dependency must be an object" });
      continue;
    }
    const obj = raw as Record<string, unknown>;
    const predecessorId =
      typeof obj.predecessorId === "string" ? obj.predecessorId : "";
    const successorId =
      typeof obj.successorId === "string" ? obj.successorId : "";
    if (!predecessorId || !successorId) {
      failures.push({
        id: null,
        reason: "predecessorId and successorId are required",
      });
      continue;
    }
    const key = dependencyKey({ predecessorId, successorId });
    if (!state.dependencies.some((d) => dependencyKey(d) === key)) {
      failures.push({ id: successorId, reason: "no such dependency" });
      continue;
    }
    removeKeys.add(key);
  }

  const dependencies = state.dependencies.filter(
    (d) => !removeKeys.has(dependencyKey(d)),
  );
  return {
    state:
      dependencies.length === state.dependencies.length
        ? state
        : { queues: state.queues, dependencies },
    changed: dependencies.length !== state.dependencies.length,
    failures,
  };
}
