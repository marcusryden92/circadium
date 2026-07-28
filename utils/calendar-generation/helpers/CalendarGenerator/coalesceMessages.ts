/**
 * buildEngineMessages
 *
 * Per-type emit functions that produce already-coalesced EngineMessage rows.
 * There is no post-hoc fold: each function iterates its source grouped by
 * the identity tuple that also serves as the row id. For recurring sources
 * (travel legs) this collapses 400 raw instances into one row per unique
 * (from, to, actualMinutes, timeOfDay, dayOfWeek); for one-shot sources
 * (task failures, planner-level lateness) each row is naturally distinct.
 *
 * Dismissal carry-forward: user-owned `dismissed` flag is preserved across
 * regens by looking each candidate id up in `previousMessages` and copying
 * the flag forward. The engine never flips dismissed from true to false —
 * only a fresh id (situation shifted) surfaces as a new, undismissed row.
 */

import {
  SimpleEvent,
  Planner,
  TravelEvent,
  EngineMessage,
} from "@/types/prisma";
import { SchedulingFailure } from "../../models/SchedulingModels";
import { SchedulingFailureReason } from "../../constants";
import { taskIsCompleted } from "../../../taskHelpers";
import { plannerIdFromEventId } from "../../../planRecurrence";
import { resolveInheritedDeadline } from "../PrioritySorter/schedulingOrder";
import type { SplitRelaxation } from "../Scheduler/scheduleSplitTask";
import type { GoalCapRelaxation } from "../Scheduler/goalDayCap";
import type { SequenceBreak } from "../Scheduler/precedenceGate";
import {
  CAPACITY_LIMITING_AXES,
  type CapacityLimitingAxis,
  EngineMessageEmit,
  dependencyBrokenId,
  goalDayCapRelaxedId,
  insufficientTravelId,
  queueSequenceBrokenId,
  scheduledLateId,
  scheduledOkId,
  sequencePastHorizonId,
  splitConstraintRelaxedId,
  taskTooLargeId,
  taskUnschedulableId,
} from "../../models/EngineMessage";

export function buildEngineMessages(
  userId: string,
  schedulerFailures: SchedulingFailure[],
  travelEvents: TravelEvent[],
  planners: Planner[],
  finalEvents: SimpleEvent[],
  currentDate: Date,
  previousMessages: EngineMessage[],
  splitRelaxations: SplitRelaxation[] = [],
  goalCapRelaxations: GoalCapRelaxation[] = [],
  sequenceBreaks: SequenceBreak[] = [],
): EngineMessage[] {
  const priorDismissed = buildDismissedSet(previousMessages);

  const emits: EngineMessageEmit[] = [
    ...emitSchedulerFailureMessages(schedulerFailures),
    ...emitScheduledLateMessages(planners, finalEvents, currentDate),
    ...emitInsufficientTravelMessages(travelEvents),
    ...emitSplitRelaxationMessages(splitRelaxations),
    ...emitGoalCapRelaxationMessages(goalCapRelaxations),
    ...emitSequenceBreakMessages(sequenceBreaks),
    ...emitScheduledOkMessages(finalEvents),
  ];

  // Dedupe by id (keep-first) — id is the DB primary key, so duplicate ids in
  // one emit array become a double-create in the sync transaction. The known
  // producer: a never-scheduled task fails once per expansion pass in the
  // retry loop, pushing one identical NO_SLOTS failure per pass.
  const seenIds = new Set<string>();
  const uniqueEmits = emits.filter((m) => {
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });

  return uniqueEmits.map((m) => ({
    id: m.id,
    type: m.type,
    tone: m.tone,
    payload: m.payload,
    // Carry forward the user-owned flag. A brand-new id is naturally
    // undismissed; a re-emit of a previously dismissed id stays hidden.
    dismissed: priorDismissed.has(m.id) ? true : m.dismissed,
    userId,
    // createdAt/updatedAt are DB-owned. compareCalendarData strips both
    // sides before comparing so these empty placeholders don't spuriously
    // mark rows as changed.
    createdAt: "",
    updatedAt: "",
  }));
}

function buildDismissedSet(previous: EngineMessage[]): Set<string> {
  const dismissed = new Set<string>();
  for (const m of previous) {
    if (m.dismissed) dismissed.add(m.id);
  }
  return dismissed;
}

/**
 * Scheduler failures are one-per-planner+reason per scheduling pass, but the
 * retry loop re-attempts unscheduled tasks after each horizon expansion and
 * pushes a fresh failure each time — so a never-scheduled task arrives here
 * with duplicates. The id-level dedupe in buildEngineMessages collapses them.
 */
function emitSchedulerFailureMessages(
  failures: SchedulingFailure[],
): EngineMessageEmit[] {
  const emits: EngineMessageEmit[] = [];
  for (const f of failures) {
    if (f.reason === SchedulingFailureReason.TOO_LARGE) {
      const maxCapacity = numberFromContext(f.context, "maxCapacity") ?? 0;
      const duration = numberFromContext(f.context, "duration") ?? 0;
      const axisRaw = f.context?.["limitingAxis"];
      const limitingAxis =
        typeof axisRaw === "string" &&
        (CAPACITY_LIMITING_AXES as readonly string[]).includes(axisRaw)
          ? (axisRaw as CapacityLimitingAxis)
          : undefined;
      emits.push({
        id: taskTooLargeId(f.taskId),
        type: "TASK_TOO_LARGE",
        tone: "fail",
        dismissed: false,
        payload: {
          type: "TASK_TOO_LARGE",
          plannerId: f.taskId,
          duration,
          maxCapacity,
          ...(limitingAxis ? { limitingAxis } : {}),
        },
      });
      continue;
    }
    // Split-task partials report how much stayed unplaced; the placed
    // chunks remain on the calendar.
    const remainingMinutes = numberFromContext(f.context, "remainingMinutes");
    const placedMinutes = numberFromContext(f.context, "placedMinutes");
    emits.push({
      id: taskUnschedulableId(f.taskId, f.reason),
      type: "TASK_UNSCHEDULABLE",
      tone: "fail",
      dismissed: false,
      payload: {
        type: "TASK_UNSCHEDULABLE",
        plannerId: f.taskId,
        reason: f.reason,
        ...(remainingMinutes !== undefined ? { remainingMinutes } : {}),
        ...(placedMinutes !== undefined ? { placedMinutes } : {}),
      },
    });
  }
  return emits;
}

/**
 * SPLIT_CONSTRAINT_RELAXED coalesces per (plannerId, kind): N compromised
 * chunks of one task fold into a single row carrying count and total minutes.
 * Both ride in the id, so a changed compromise supersedes the prior row
 * (fresh, undismissed) while an identical regen is a no-op diff.
 */
function emitSplitRelaxationMessages(
  relaxations: SplitRelaxation[],
): EngineMessageEmit[] {
  type Bucket = {
    plannerId: string;
    kind: "maxChunk" | "dayCap";
    affectedCount: number;
    totalMinutes: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of relaxations) {
    const key = `${r.plannerId}|${r.kind}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.affectedCount += 1;
      existing.totalMinutes += r.chunkMinutes;
    } else {
      buckets.set(key, {
        plannerId: r.plannerId,
        kind: r.kind,
        affectedCount: 1,
        totalMinutes: r.chunkMinutes,
      });
    }
  }

  const emits: EngineMessageEmit[] = [];
  for (const b of buckets.values()) {
    emits.push({
      id: splitConstraintRelaxedId(b),
      type: "SPLIT_CONSTRAINT_RELAXED",
      tone: "warn",
      dismissed: false,
      payload: {
        type: "SPLIT_CONSTRAINT_RELAXED",
        plannerId: b.plannerId,
        kind: b.kind,
        affectedCount: b.affectedCount,
        totalMinutes: b.totalMinutes,
      },
    });
  }
  return emits;
}

/**
 * GOAL_DAY_CAP_RELAXED coalesces per (goalId, kind), same shape as the split
 * variant: N compromised placements of one goal's subtree fold into a single
 * row carrying count and total minutes. capMinutes is an emit-time fact
 * (excluded from the id, like TASK_TOO_LARGE.maxCapacity) — a cap edit alone
 * doesn't resurface a dismissed row; a changed compromise does.
 */
function emitGoalCapRelaxationMessages(
  relaxations: GoalCapRelaxation[],
): EngineMessageEmit[] {
  type Bucket = {
    plannerId: string;
    kind: "oversizedLeaf" | "dayCap";
    affectedCount: number;
    totalMinutes: number;
    capMinutes: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of relaxations) {
    const key = `${r.goalId}|${r.kind}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.affectedCount += 1;
      existing.totalMinutes += r.minutes;
    } else {
      buckets.set(key, {
        plannerId: r.goalId,
        kind: r.kind,
        affectedCount: 1,
        totalMinutes: r.minutes,
        capMinutes: r.capMinutes,
      });
    }
  }

  const emits: EngineMessageEmit[] = [];
  for (const b of buckets.values()) {
    emits.push({
      id: goalDayCapRelaxedId(b),
      type: "GOAL_DAY_CAP_RELAXED",
      tone: "warn",
      dismissed: false,
      payload: {
        type: "GOAL_DAY_CAP_RELAXED",
        plannerId: b.plannerId,
        kind: b.kind,
        affectedCount: b.affectedCount,
        totalMinutes: b.totalMinutes,
        capMinutes: b.capMinutes,
      },
    });
  }
  return emits;
}

/**
 * Sequence breaks map to three flavors:
 *   - cause "horizon" (both sources) → SEQUENCE_PAST_HORIZON, one row per
 *     (predecessorId, successorId): the forecast ran past the horizon, the
 *     sequence didn't actually break.
 *   - source "queue" → QUEUE_SEQUENCE_BROKEN, one row per (queueId,
 *     failedPlannerId): every successor bound to the same failed member
 *     folds into one card via the id-level dedupe.
 *   - source "dependency" → DEPENDENCY_BROKEN, one row per
 *     (predecessorId, successorId, cause).
 * All three state the consequence — the successor was scheduled without
 * waiting — not just the fact of the failure.
 */
function emitSequenceBreakMessages(
  sequenceBreaks: SequenceBreak[],
): EngineMessageEmit[] {
  const emits: EngineMessageEmit[] = [];
  for (const b of sequenceBreaks) {
    if (b.cause === "horizon") {
      emits.push({
        id: sequencePastHorizonId(b.fromId, b.toId),
        type: "SEQUENCE_PAST_HORIZON",
        tone: "warn",
        dismissed: false,
        payload: {
          type: "SEQUENCE_PAST_HORIZON",
          source: b.source,
          queueId: b.queueId ?? null,
          predecessorId: b.fromId,
          successorId: b.toId,
        },
      });
      continue;
    }
    if (b.source === "queue") {
      emits.push({
        id: queueSequenceBrokenId(b.queueId ?? "", b.fromId),
        type: "QUEUE_SEQUENCE_BROKEN",
        tone: "warn",
        dismissed: false,
        payload: {
          type: "QUEUE_SEQUENCE_BROKEN",
          queueId: b.queueId ?? "",
          failedPlannerId: b.fromId,
        },
      });
      continue;
    }
    emits.push({
      id: dependencyBrokenId(b.fromId, b.toId, b.cause),
      type: "DEPENDENCY_BROKEN",
      tone: "warn",
      dismissed: false,
      payload: {
        type: "DEPENDENCY_BROKEN",
        predecessorId: b.fromId,
        successorId: b.toId,
        cause: b.cause,
      },
    });
  }
  return emits;
}

/**
 * SCHEDULED_LATE applies only to dynamic (non-recurring) planners, so each
 * row is naturally distinct. Id = plannerId + scheduledStart: any placement
 * shift produces a new id → dismissed rows resurface on shift.
 *
 * Skip conditions:
 *   - Completed tasks (completedStartTime + completedEndTime set): the
 *     scheduled window represents the actual completion, and re-emitting
 *     "scheduled after deadline" forever after the fact is noise. If a
 *     completion landed past deadline the user already knows.
 *   - Deadlines still in the future relative to currentDate: the scheduled
 *     start being past the deadline is the problem; if the deadline itself
 *     hasn't arrived yet the placement can still move ahead of it on the
 *     next regen.
 *
 * Deadline resolution: leaf tasks inherit a deadline from the nearest
 * ancestor planner that has one — matches domain convention (goals own the
 * deadline; sub-tasks are the placeable atoms).
 */
function emitScheduledLateMessages(
  planners: Planner[],
  finalEvents: SimpleEvent[],
  currentDate: Date,
): EngineMessageEmit[] {
  const emits: EngineMessageEmit[] = [];
  const plannerById = new Map(planners.map((p) => [p.id, p]));
  const deadlineCache = new Map<string, Date | null>();

  for (const event of finalEvents) {
    if (event.extendedProps?.eventType !== "planner") continue;
    const plannerId = plannerIdFromEventId(event.id);
    const planner = plannerById.get(plannerId);
    if (!planner) continue;
    if (taskIsCompleted(planner)) continue;

    const deadlineDate = resolveInheritedDeadline(
      planner,
      plannerById,
      deadlineCache,
    );
    if (!deadlineDate) continue;

    const scheduledStartDate = new Date(event.start);
    if (scheduledStartDate.getTime() <= deadlineDate.getTime()) continue;
    if (deadlineDate.getTime() >= currentDate.getTime()) continue;

    const daysLate = daysBetween(deadlineDate, scheduledStartDate);

    emits.push({
      id: scheduledLateId(plannerId, event.start),
      type: "SCHEDULED_LATE",
      tone: "warn",
      dismissed: false,
      payload: {
        type: "SCHEDULED_LATE",
        plannerId,
        deadline: deadlineDate.toISOString(),
        scheduledStart: event.start,
        daysLate,
      },
    });
  }

  return emits;
}

/**
 * INSUFFICIENT_TRAVEL is the only type that actually coalesces recurring
 * instances. Group flagged travel events by (from, to, actualMinutes,
 * timeOfDay, dayOfWeek) — same tuple across multiple weeks in the horizon
 * folds to one row with affectedCount summing the occurrences. Anything
 * shifted (different weekday, different hour, different actual minutes)
 * produces a new tuple → new id → separate row.
 *
 * Skip conditions:
 *   - requiredTravelMinutes is null (baseline lookup missing): shortage is
 *     undefined, not zero. Emitting a "0m shortage" warning contradicts
 *     itself; a missing baseline is an upstream data problem, not this
 *     console's job to surface.
 *   - required <= actual: the row is flagged but the arithmetic doesn't
 *     agree. Skip rather than emit a 0-shortage nag.
 */
function emitInsufficientTravelMessages(
  travelEvents: TravelEvent[],
): EngineMessageEmit[] {
  type Bucket = {
    id: string;
    fromLocationId: string | null;
    toLocationId: string | null;
    actualMinutes: number;
    requiredMinutes: number;
    shortageMinutes: number;
    dayOfWeek: number;
    timeOfDay: string;
    count: number;
  };

  const buckets = new Map<string, Bucket>();

  for (const te of travelEvents) {
    if (!te.insufficientTravel) continue;
    if (te.requiredTravelMinutes == null) continue;
    const shortage = te.requiredTravelMinutes - te.travelMinutes;
    if (shortage <= 0) continue;

    const start = new Date(te.start);
    const dayOfWeek = start.getDay();
    const timeOfDay = formatTimeOfDay(start);

    const id = insufficientTravelId({
      fromLocationId: te.fromLocationId,
      toLocationId: te.toLocationId,
      actualMinutes: te.travelMinutes,
      timeOfDay,
      dayOfWeek,
    });

    const existing = buckets.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(id, {
        id,
        fromLocationId: te.fromLocationId,
        toLocationId: te.toLocationId,
        actualMinutes: te.travelMinutes,
        requiredMinutes: te.requiredTravelMinutes,
        shortageMinutes: shortage,
        dayOfWeek,
        timeOfDay,
        count: 1,
      });
    }
  }

  const emits: EngineMessageEmit[] = [];
  for (const b of buckets.values()) {
    emits.push({
      id: b.id,
      type: "INSUFFICIENT_TRAVEL",
      tone: "warn",
      dismissed: false,
      payload: {
        type: "INSUFFICIENT_TRAVEL",
        fromLocationId: b.fromLocationId,
        toLocationId: b.toLocationId,
        actualMinutes: b.actualMinutes,
        requiredMinutes: b.requiredMinutes,
        shortageMinutes: b.shortageMinutes,
        dayOfWeek: b.dayOfWeek,
        timeOfDay: b.timeOfDay,
        affectedCount: b.count,
      },
    });
  }
  return emits;
}

/**
 * SCHEDULED_OK is informational: one row per regen whose id encodes the
 * placed count. Same count regen-over-regen produces the same id (no diff);
 * count change produces a new id (fresh, undismissed row supersedes). Skipped
 * when count is zero — a "0 placed" card is demoralizing noise.
 */
function emitScheduledOkMessages(
  finalEvents: SimpleEvent[],
): EngineMessageEmit[] {
  let placedCount = 0;
  for (const event of finalEvents) {
    if (event.extendedProps?.eventType === "planner") placedCount++;
  }
  if (placedCount === 0) return [];
  return [
    {
      id: scheduledOkId(placedCount),
      type: "SCHEDULED_OK",
      tone: "info",
      dismissed: false,
      payload: { type: "SCHEDULED_OK", placedCount },
    },
  ];
}

/**
 * Calendar-day distance from a → b, rounded up to the nearest whole day.
 * Used for SCHEDULED_LATE "N days after deadline" so a placement 1 hour past
 * midnight reads as "1 day late" — not truncated to 0 by an ms/24h floor.
 * Uses UTC midnight boundaries; local-tz DST transitions don't affect the
 * calendar-day count we care about.
 */
function daysBetween(from: Date, to: Date): number {
  const fromMidnight = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const toMidnight = Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate(),
  );
  const days = Math.round((toMidnight - fromMidnight) / (24 * 60 * 60 * 1000));
  return Math.max(1, days);
}

function formatTimeOfDay(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function numberFromContext(
  context: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!context) return undefined;
  const v = context[key];
  return typeof v === "number" ? v : undefined;
}
