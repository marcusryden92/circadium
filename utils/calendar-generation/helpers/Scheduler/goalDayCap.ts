import { Planner, SimpleEvent, PlannerType } from "@/types/prisma";
import { ChunkSizing } from "../../models/SchedulingModels";
import { addIntervalMinutesByDay, dayKeyLocal } from "../../../taskSplitting";
import { plannerIdFromEventId } from "../../../planRecurrence";
import { getScheduledLeafSequence } from "../../../goalPageHandlers";

// Per-goal daily cap: Planner.maxMinutesPerDay on a goal root limits how many
// minutes of that goal's subtree may land on any single local day. Mirrors the
// split-task day cap one level up — a per-goal per-day ledger feeds the same
// ChunkSizing.dayBudget seam in selectBestSlot, so plain leaves shrink to
// "fits today or try another day" and split leaves compose it with their own
// per-task budget.

export interface GoalCapRelaxation {
  goalId: string;
  goalTitle: string;
  kind: "oversizedLeaf" | "dayCap";
  minutes: number;
  start: string;
  capMinutes: number;
}

export interface GoalCapState {
  /** goalId -> local dayKey -> subtree minutes consumed */
  dayMinutes: Map<string, Map<string, number>>;
  /** goals whose ledger has been seeded from pre-existing events this run */
  seeded: Set<string>;
  /** Cap compromises made while placing, surfaced as engine messages */
  relaxations: GoalCapRelaxation[];
}

export function createGoalCapState(): GoalCapState {
  return {
    dayMinutes: new Map(),
    seeded: new Set(),
    relaxations: [],
  };
}

export function goalDayCapMinutes(goal: Planner): number | null {
  if (goal.plannerType !== PlannerType.goal) return null;
  const cap = goal.maxMinutesPerDay;
  if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0) return null;
  return Math.floor(cap);
}

// Charges completed leaves, completed split segments, and memoized past leaf
// events against the ledger — all of them sit in context.scheduledEvents
// before any dynamic placement, so one scan covers today's history.
export function seedGoalDayLedger(
  goal: Planner,
  allPlanners: Planner[],
  scheduledEvents: SimpleEvent[],
  state: GoalCapState,
): void {
  if (state.seeded.has(goal.id)) return;
  state.seeded.add(goal.id);
  const dayMap = ledgerFor(goal.id, state);
  // Splice-aware: the cap meters the goal's scheduled sequence, so a completed
  // detour-target leaf placed under this goal seeds its day too. The raw-id
  // match covers recurring-goal occurrence clones, whose leaf ids ARE
  // composite (`${leafId}|${periodKey}`) — stripping the suffix would resolve
  // a frozen completed-occurrence event to the REAL leaf id and miss the
  // clone subtree entirely.
  const leafIds = new Set(
    getScheduledLeafSequence(allPlanners, goal.id).map((t) => t.id),
  );
  for (const event of scheduledEvents) {
    if (
      !leafIds.has(plannerIdFromEventId(event.id)) &&
      !leafIds.has(event.id)
    ) {
      continue;
    }
    addIntervalMinutesByDay(dayMap, new Date(event.start), new Date(event.end));
  }
}

export interface GoalCapContext {
  capMinutes: number;
  /** Remaining goal budget for the local day a slot starts on */
  budget: (slotStart: Date) => number;
  /** Charge a placement's minutes to the goal ledger, split at midnight */
  charge: (start: Date, end: Date) => void;
  recordRelaxation: (
    kind: GoalCapRelaxation["kind"],
    minutes: number,
    start: string,
  ) => void;
}

export function buildGoalCapContext(
  goal: Planner,
  capMinutes: number,
  state: GoalCapState,
): GoalCapContext {
  const dayMap = ledgerFor(goal.id, state);
  return {
    capMinutes,
    budget: (slotStart) =>
      Math.max(0, capMinutes - (dayMap.get(dayKeyLocal(slotStart)) ?? 0)),
    charge: (start, end) => addIntervalMinutesByDay(dayMap, start, end),
    recordRelaxation: (kind, minutes, start) =>
      state.relaxations.push({
        goalId: goal.id,
        goalTitle: goal.title,
        kind,
        minutes,
        start,
        capMinutes,
      }),
  };
}

// Fixed-grant sizing for a plain (non-split) leaf under a goal cap: the block
// places whole or not at all, so selectBestSlot's day-budget seam skips days
// without room and the grant never shrinks the block.
export function wholeBlockSizing(
  durationMinutes: number,
  budget: (slotStart: Date) => number,
): ChunkSizing {
  return {
    minMinutes: durationMinutes,
    grant: (headroom, dayBudget) =>
      headroom >= durationMinutes && dayBudget >= durationMinutes
        ? durationMinutes
        : 0,
    dayBudget: budget,
  };
}

// Flexible single-block sizing for a recurring-item occurrence: one block
// sized to the selected slot's headroom, clamped to [min, max]. Unlike split
// tasks this never loops into a second chunk — it grants the largest block
// that fits, so an occurrence fills its slot up to max and fails (skips the
// slot) below min. maxMinutes <= 0 means no upper bound.
export function flexibleBlockSizing(
  minMinutes: number,
  maxMinutes: number,
): ChunkSizing {
  return {
    minMinutes,
    grant: (headroom, dayBudget) => {
      const cap = maxMinutes > 0 ? maxMinutes : headroom;
      const granted = Math.min(headroom, cap, dayBudget);
      return granted >= minMinutes ? granted : 0;
    },
  };
}

function ledgerFor(goalId: string, state: GoalCapState): Map<string, number> {
  let dayMap = state.dayMinutes.get(goalId);
  if (!dayMap) {
    dayMap = new Map();
    state.dayMinutes.set(goalId, dayMap);
  }
  return dayMap;
}
