import { PlannerType } from "@/types/prisma";

// Readiness (isReady === true) is the universal scheduling gate. A task or
// plan is ready to schedule the moment it is created; a goal stays unready
// until it has subtasks and a deadline (that gate is enforced at the item
// detail, capture, and AI-apply surfaces). This is the single default every
// create surface should use.
export function defaultReadyForType(plannerType: PlannerType): boolean {
  return plannerType !== PlannerType.goal;
}
