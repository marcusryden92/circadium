import type { Planner } from "@/types/prisma";
import { plannerCompletedEnd } from "./plannerCompletion";

const DAY_MS = 86400000;

export type SmartView =
  | "today"
  | "this-week"
  | "inbox"
  | "overdue"
  | "all-goals"
  | "all-plans"
  | "done-7d";

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function isInSmartView(
  item: Planner,
  view: SmartView,
  now: Date,
): boolean {
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  const completedEnd = plannerCompletedEnd(item);
  switch (view) {
    case "today": {
      if (!item.deadline) return false;
      const dl = new Date(item.deadline);
      return dl >= today && dl <= todayEnd && !completedEnd;
    }
    case "this-week": {
      if (!item.deadline) return false;
      const weekEnd = endOfDay(new Date(today.getTime() + 6 * DAY_MS));
      const dl = new Date(item.deadline);
      return dl >= today && dl <= weekEnd && !completedEnd;
    }
    case "inbox":
      return !item.categoryId && !completedEnd;
    case "overdue": {
      if (!item.deadline || completedEnd) return false;
      return new Date(item.deadline) < today;
    }
    case "all-goals":
      return item.plannerType === "goal";
    case "all-plans":
      return item.plannerType === "plan";
    case "done-7d": {
      if (!completedEnd) return false;
      const cutoff = new Date(today.getTime() - 7 * DAY_MS);
      return new Date(completedEnd) >= cutoff;
    }
  }
}
