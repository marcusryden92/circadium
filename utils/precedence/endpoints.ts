import type { Planner } from "@/types/prisma";

// The canonical precedence-endpoint shape: an existing, root-level, triaged,
// task or goal. Queue members, dependency endpoints, the engine's gated
// builder, the draft save apply, and the UI pickers all gate on this ONE
// predicate (each composing its own extra filters on top — e.g. completion
// for pickers). Completed and unready rows deliberately pass: transparency
// affects gating, never membership. Plans and habits are excluded: neither is
// a scheduling candidate the gate can bound (a plan is a fixed anchor, a habit
// scheduls per-occurrence, never as its bare row), so admitting one seeds a
// spurious broken-gate and leaves the successor unbounded. Detour targets keep
// their own predicate (isValidDetourTarget) — root-only permanently.
export const isValidPrecedenceEndpoint = (
  planner: Planner | undefined,
): planner is Planner =>
  !!planner &&
  planner.parentId == null &&
  planner.plannerType !== "plan" &&
  planner.plannerType !== "habit" &&
  planner.isTriaged;

// Node-level dependency endpoints: any existing task/goal node whose
// STRUCTURAL ROOT is a triaged task/goal. Dependencies alone are relaxed to
// this node shape — queue members and detour targets keep the root predicate
// above. Plans and habits are excluded at both the endpoint and the root (same
// reason as isValidPrecedenceEndpoint). A dangling parent chain (orphaned row)
// is invalid.
export function isValidDependencyEndpoint(
  byId: Map<string, Planner>,
  id: string,
): boolean {
  const row = byId.get(id);
  if (!row || row.plannerType === "plan" || row.plannerType === "habit") {
    return false;
  }
  const seen = new Set<string>([row.id]);
  let current = row;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || seen.has(parent.id)) return false;
    seen.add(parent.id);
    current = parent;
  }
  return (
    current.plannerType !== "plan" &&
    current.plannerType !== "habit" &&
    current.isTriaged
  );
}
