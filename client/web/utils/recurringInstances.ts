import type { OccurrenceCompletion, Planner } from "@/types/prisma";
import { enumerateRecurrencePeriods } from "@/utils/recurringPeriods";
import { plannerHasFlexibleRecurrence } from "@/utils/planRecurrence";
import { getTreeBottomLayer } from "@/utils/goalPageHandlers";
import { SCHEDULING_CONFIG } from "@/utils/calendar-generation/constants";

// Item-detail completion surface for flexibly recurring tasks/goals: the same
// period model the engine and habit stats use, resolved against the occurrence
// log into a per-instance status list. A task is its own single leaf; a goal's
// instance is done when every structural bottom-layer leaf is logged for that
// period. Kept out of the /habits stats module because this is a plain
// per-item view (no bucket/tracker context) and both surfaces must agree on
// what "done" means — they share enumerateRecurrencePeriods + getTreeBottomLayer.

// How far ahead the list looks, matching the engine's recurrence horizon so it
// surfaces exactly the upcoming occurrences the calendar already shows (parity)
// — completing one ahead is valid here, clamped to now like the calendar tile.
const DAY_MS = 86_400_000;
export const INSTANCE_HORIZON_DAYS = SCHEDULING_CONFIG.RECURRENCE_HORIZON_DAYS;
// Row cap shared by both completion surfaces (Schedule-tab list + goal modal)
// so a click on one always resolves to a period the other also shows.
export const INSTANCE_MAX_ROWS = 60;

export type RecurringInstanceStatus =
  | "completed"
  | "missed"
  | "pending"
  | "upcoming";

export interface RecurringLeafState {
  id: string;
  completedAt: Date | null;
}

export interface RecurringInstance {
  /** Period key (createdAt-anchored, immutable) — the occurrence log key. */
  key: string;
  /** Period bounds. */
  start: Date;
  end: Date;
  status: RecurringInstanceStatus;
  /** Latest logged end across this period's leaves, when fully complete. */
  completedAt: Date | null;
  doneLeaves: number;
  totalLeaves: number;
}

function leavesOf(item: Planner, planners: Planner[]): Planner[] {
  if (item.plannerType === "goal") return getTreeBottomLayer(planners, item.id);
  return [item];
}

// A recurring item's periods with per-period completion status, ordered
// current-and-upcoming first (soonest actionable at the top, so "today" leads),
// then elapsed periods most-recent-first as history. `horizonDays` extends the
// window into the future so the list mirrors the calendar's forecast tiles;
// pass 0 (the default) for history + the open current period only. `limit` caps
// the rows shown.
export function buildRecurringInstances(args: {
  item: Planner;
  planners: Planner[];
  completions: OccurrenceCompletion[];
  now: Date;
  horizonDays?: number;
  limit?: number;
}): RecurringInstance[] {
  const { item, planners, completions, now, horizonDays = 0, limit } = args;
  if (!plannerHasFlexibleRecurrence(item)) return [];

  const leaves = leavesOf(item, planners);
  const totalLeaves = leaves.length;

  // (plannerId|key) -> completion, for O(1) per-leaf-per-period lookup.
  const byKey = new Map<string, OccurrenceCompletion>();
  for (const row of completions) {
    byKey.set(`${row.plannerId}|${row.occurrenceKey}`, row);
  }

  const until =
    horizonDays > 0 ? new Date(now.getTime() + horizonDays * DAY_MS) : now;
  const periods = enumerateRecurrencePeriods({ item, until });

  const instances: RecurringInstance[] = periods.map((period) => {
    let doneLeaves = 0;
    let latestEnd: Date | null = null;
    for (const leaf of leaves) {
      const completion = byKey.get(`${leaf.id}|${period.key}`);
      if (!completion) continue;
      doneLeaves += 1;
      const end = new Date(completion.end);
      if (!isNaN(end.getTime()) && (!latestEnd || end > latestEnd)) {
        latestEnd = end;
      }
    }
    const completed = totalLeaves > 0 && doneLeaves === totalLeaves;
    let status: RecurringInstanceStatus;
    if (completed) status = "completed";
    else if (period.start > now) status = "upcoming";
    else if (period.end <= now) status = "missed";
    else status = "pending";
    return {
      key: period.key,
      start: period.start,
      end: period.end,
      status,
      completedAt: completed ? latestEnd : null,
      doneLeaves,
      totalLeaves,
    };
  });

  // Current + future ascending (next thing to do first), then elapsed periods
  // descending (recent history first) — keeps today at the top while showing
  // the same upcoming occurrences the calendar does.
  const ahead = instances
    .filter((i) => i.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const past = instances
    .filter((i) => i.end <= now)
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  const ordered = [...ahead, ...past];
  return limit != null ? ordered.slice(0, limit) : ordered;
}

// Whether a single leaf is logged for a period (drives the goal modal's
// per-leaf toggles).
export function isLeafLoggedForPeriod(
  completions: OccurrenceCompletion[],
  leafId: string,
  periodKey: string,
): OccurrenceCompletion | null {
  return (
    completions.find(
      (r) => r.plannerId === leafId && r.occurrenceKey === periodKey,
    ) ?? null
  );
}

// The window to record when a completion is logged from item detail (no
// calendar tile to read a time from): end at now while the period is still
// open, else at the period's close; start back-dated by the item's duration so
// the frozen tile and habit-grid dot land inside the period. The occurrence key
// pins the period regardless — this only sets where it renders.
export function manualCompletionWindow(
  period: { start: Date; end: Date },
  durationMinutes: number,
  now: Date,
): { start: string; end: string } {
  const end = now < period.end ? now : period.end;
  const start = new Date(
    end.getTime() - Math.max(1, durationMinutes) * 60_000,
  );
  return { start: start.toISOString(), end: end.toISOString() };
}
