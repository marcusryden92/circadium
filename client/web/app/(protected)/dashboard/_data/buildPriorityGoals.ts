import { format } from "date-fns";
import type { Planner, SimpleEvent, Category } from "@/types/prisma";
import { PlannerType } from "@/types/prisma";
import {
  getGoalDurationProgress,
  getGoalLeafCounts,
  getNextScheduledForGoal,
} from "@/utils/plannerStatus";
import type { DashboardGoal } from "./types";

export function buildPriorityGoals(args: {
  now: Date;
  planners: Planner[];
  categories: Category[];
  calendar: SimpleEvent[];
  plannerScores: Record<string, number>;
  limit?: number;
}): DashboardGoal[] {
  const { now, planners, categories, calendar, plannerScores, limit = 3 } =
    args;
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const rootGoals = planners.filter(
    (p) =>
      p.plannerType === PlannerType.goal && !p.parentId && !p.completedEndTime,
  );

  const hasScores = Object.keys(plannerScores).length > 0;
  const sorted = [...rootGoals].sort((a, b) => {
    if (hasScores) {
      const aScore = plannerScores[a.id] ?? -Infinity;
      const bScore = plannerScores[b.id] ?? -Infinity;
      if (aScore !== bScore) return bScore - aScore;
    }
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aDl = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bDl = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return aDl - bDl;
  });

  return sorted.slice(0, limit).map((goal) => {
    const pctRaw = getGoalDurationProgress(goal, planners);
    const pct = pctRaw == null ? 0 : Math.round(pctRaw * 100);
    const { done, total } = getGoalLeafCounts(goal, planners);
    const category = goal.categoryId
      ? categoryById.get(goal.categoryId)
      : undefined;
    const upcoming = getNextScheduledForGoal(goal, planners, calendar, now);

    const nextLabel = upcoming
      ? `${upcoming.title} · ${format(new Date(upcoming.start), "EEE h:mm a")}`
      : undefined;

    return {
      id: goal.id,
      name: goal.title,
      pct,
      fraction: total > 0 ? `${done} / ${total}` : "—",
      categoryName: category?.name,
      categoryColor: category?.color,
      next: nextLabel,
      deadline: goal.deadline
        ? format(new Date(goal.deadline), "MMM d")
        : undefined,
    };
  });
}
