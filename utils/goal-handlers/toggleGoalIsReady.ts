import { Planner } from "@/types/prisma";
import { getTaskTreeIds } from "@/utils/goalPageHandlers";

type UpdatePlannerArrayFn = (
  planner: Planner[] | ((prev: Planner[]) => Planner[]),
  label: string,
  options?: { engineMode?: "inline" | "worker" },
) => void;

// Readiness is a whole-subtree property: a root goal and its descendants are
// always ready (or unready) together. Both setters apply the value to the
// entire tree under taskId. The undo label comes from the caller, which knows
// the item's title and the direction of the flip.
export function toggleGoalIsReady(
  updatePlannerArray: UpdatePlannerArrayFn,
  taskId: string,
  label: string,
) {
  updatePlannerArray((prev) => {
    const root = prev.find((task) => task.id === taskId);
    if (!root) return prev;
    const nextIsReady = !root.isReady;
    const treeIds = new Set(getTaskTreeIds(prev, taskId));
    return prev.map((task) =>
      treeIds.has(task.id) ? { ...task, isReady: nextIsReady } : task
    );
  }, label);
}

export function setGoalIsReady(
  updatePlannerArray: UpdatePlannerArrayFn,
  taskId: string,
  isReady: boolean | null,
  label: string,
) {
  updatePlannerArray((prev) => {
    const treeIds = new Set(getTaskTreeIds(prev, taskId));
    return prev.map((task) =>
      treeIds.has(task.id) ? { ...task, isReady } : task
    );
  }, label);
}
