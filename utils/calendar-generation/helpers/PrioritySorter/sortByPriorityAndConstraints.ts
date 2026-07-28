import { Planner, PlannerType } from "@/types/prisma";
import { URGENCY_CONFIG } from "../../constants";
import type { PrecedenceEdge } from "@/utils/precedence/types";
import { placementBlockMinutes } from "../Scheduler/capacityCheck";
import {
  compareSchedulingOrder,
  edfSlackMinutes,
  resolveInheritedDeadline,
} from "./schedulingOrder";

function calculateTaskUrgency(
  task: Planner,
  context: { currentDate: Date; totalEstimatedTime: number },
): number {
  if (!task.deadline) {
    return task.priority * URGENCY_CONFIG.MIN_URGENCY_MULTIPLIER;
  }

  const deadline = new Date(task.deadline);
  const minutesUntilDeadline =
    (deadline.getTime() - context.currentDate.getTime()) / (1000 * 60);

  let timeRatio = minutesUntilDeadline / context.totalEstimatedTime;
  timeRatio = Math.max(0, Math.min(1, timeRatio));

  const sigmoid =
    1 /
    (1 +
      Math.exp(
        -URGENCY_CONFIG.CURVE_STEEPNESS *
          (timeRatio - URGENCY_CONFIG.CRITICAL_THRESHOLD),
      ));
  const urgencyMultiplier = 1 - sigmoid;

  const scaledUrgency =
    URGENCY_CONFIG.URGENCY_SCALE_MIN +
    (URGENCY_CONFIG.URGENCY_SCALE_MAX - URGENCY_CONFIG.URGENCY_SCALE_MIN) *
      urgencyMultiplier;

  return task.priority * scaledUrgency;
}

// Compute the urgency score for an arbitrary subset of planners using the
// same normalization (sum of all planner durations) the scheduler uses.
// Caller decides which items to score, so the same denominator can drive both
// the scheduler's candidate sort and the dashboard's "priority goals" list
// without recomputing.
export function computeUrgencyScores(
  allPlanners: Planner[],
  itemsToScore: Planner[],
  currentDate: Date,
): Map<string, number> {
  const totalPlannerTime = allPlanners.reduce((acc, p) => acc + p.duration, 0);
  const scores = new Map<string, number>();
  for (const item of itemsToScore) {
    scores.set(
      item.id,
      calculateTaskUrgency(item, {
        currentDate,
        totalEstimatedTime: totalPlannerTime,
      }),
    );
  }
  return scores;
}

// Scores active scheduling candidates (root goals with isReady + standalone
// tasks) plus every top-level uncompleted goal, so consumers like the
// dashboard can rank goals that the scheduler intentionally skipped (e.g.
// not-yet-ready goals). Single pass against allPlanners' duration sum.
export function scoreCandidatesAndRootGoals(
  allPlanners: Planner[],
  currentDate: Date,
): Map<string, number> {
  const toScore = new Map<string, Planner>();
  for (const p of allPlanners) {
    const isStandaloneTask = p.plannerType === PlannerType.task && !p.parentId;
    const isReadyRootGoal =
      p.plannerType === PlannerType.goal && !p.parentId && p.isReady === true;
    const isAnyRootGoal =
      p.plannerType === PlannerType.goal &&
      !p.parentId &&
      !p.completedEndTime;
    if (isStandaloneTask || isReadyRootGoal || isAnyRootGoal) {
      toScore.set(p.id, p);
    }
  }
  return computeUrgencyScores(allPlanners, [...toScore.values()], currentDate);
}

// Priority inheritance along precedence edges (queues + dependencies). A
// prerequisite inherits the max score of everything downstream that needs it —
// `effectiveScore(n) = max(rawScore(n), max over transitive successors)` — so
// a high-priority chain's low-scored prerequisite isn't starved for slots by
// unrelated medium-priority work. Propagation is backward-only: successors are
// never pulled up by their predecessors. The edges are the transparency-gated
// ones (buildPrecedenceEdges), so a completed successor no longer propagates.
// The graph is validated acyclic at authoring time; the visiting guard is
// defensive (a stray cycle degrades to the raw score, never loops).
export function computeEffectiveScores(
  rawScores: Map<string, number>,
  edges: Array<Pick<PrecedenceEdge, "fromId" | "toId">>,
): Map<string, number> {
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    const list = successors.get(edge.fromId);
    if (list) list.push(edge.toId);
    else successors.set(edge.fromId, [edge.toId]);
  }

  const effective = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    const cached = effective.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return rawScores.get(id) ?? 0;
    visiting.add(id);
    let score = rawScores.get(id) ?? 0;
    for (const successorId of successors.get(id) ?? []) {
      const successorScore = resolve(successorId);
      if (successorScore > score) score = successorScore;
    }
    visiting.delete(id);
    effective.set(id, score);
    return score;
  };

  for (const id of rawScores.keys()) resolve(id);
  return effective;
}

function hasCategoryConstraint(
  item: Planner,
  allPlanners: Planner[],
  plannerCategoryMap?: Map<string, string | null>,
): boolean {
  const effectiveCategoryId =
    plannerCategoryMap?.get(item.id) ?? item.categoryId;
  if (effectiveCategoryId !== null) return true;

  if (item.plannerType === PlannerType.goal) {
    return hasChildWithCategoryConstraint(
      item.id,
      allPlanners,
      plannerCategoryMap,
    );
  }

  return false;
}

function hasChildWithCategoryConstraint(
  parentId: string,
  allPlanners: Planner[],
  plannerCategoryMap?: Map<string, string | null>,
): boolean {
  const children = allPlanners.filter((p) => p.parentId === parentId);

  for (const child of children) {
    const effectiveCategoryId =
      plannerCategoryMap?.get(child.id) ?? child.categoryId;
    if (effectiveCategoryId !== null) return true;

    if (
      hasChildWithCategoryConstraint(child.id, allPlanners, plannerCategoryMap)
    ) {
      return true;
    }
  }

  return false;
}

export function sortByPriorityAndConstraints(
  allPlanners: Planner[],
  goalsAndTasks: Planner[],
  urgencyScores: Map<string, number>,
  plannerCategoryMap: Map<string, string | null> | undefined,
  currentDate: Date,
): Planner[] {
  const plannerById = new Map(allPlanners.map((p) => [p.id, p]));
  const deadlineCache = new Map<string, Date | null>();

  const withMeta = goalsAndTasks.map((item, index) => ({
    item,
    key: {
      constrained: hasCategoryConstraint(item, allPlanners, plannerCategoryMap),
      slackMinutes: edfSlackMinutes(
        item,
        resolveInheritedDeadline(item, plannerById, deadlineCache),
        currentDate,
        placementBlockMinutes(item),
      ),
      score: urgencyScores.get(item.id) ?? 0,
      index,
    },
  }));

  return withMeta
    .sort((a, b) => compareSchedulingOrder(a.key, b.key))
    .map((row) => row.item);
}
