import { Planner, SimpleEvent } from "@/types/prisma";
import { Scheduler } from "../../core/Scheduler";
import { ChunkSizing, SchedulingFailure } from "../../models/SchedulingModels";
import { SCHEDULING_CONFIG, SchedulingFailureReason } from "../../constants";
import {
  TaskSplittingSettings,
  addIntervalMinutesByDay,
  chunkEventId,
  completedMinutesByDay,
  dayKeyLocal,
  effectiveMaxChunkMinutes,
  grantChunkMinutes,
  minChunkRequired,
  parseCompletedSegments,
  splitRemainingMinutes,
} from "../../../taskSplitting";
import { GoalCapContext } from "./goalDayCap";

// Placement of one split task: repeatedly runs the 5-phase pipeline with a
// ChunkSizing until the remaining minutes are exhausted or a chunk finds no
// slot. Each chunk rides the pipeline as a synthetic planner clone whose id is
// the chunk event id — plannerIdFromEventId resolves it back to the row, and
// travel/buffer handling applies per chunk like any other dynamic placement.
//
// State is per scheduling run and shared across outer-loop iterations so a
// partially placed task resumes from its remainder after horizon expansion
// instead of starting over.

export interface SplitRelaxation {
  plannerId: string;
  taskTitle: string;
  kind: "maxChunk" | "dayCap";
  chunkMinutes: number;
  chunkStart: string;
}

export interface SplitPlacementState {
  /** plannerId -> minutes placed this run (across outer-loop iterations) */
  placedMinutes: Map<string, number>;
  /** plannerId -> next chunk ordinal (chunk event ids are ordinal-keyed) */
  chunkOrdinals: Map<string, number>;
  /** plannerId -> local dayKey -> minutes consumed (seeded from completed segments) */
  dayMinutes: Map<string, Map<string, number>>;
  /**
   * plannerId -> ms end of the task's last placed chunk / latest segment.
   * Only maintained when the task requests a minimum inter-chunk spacing.
   */
  lastChunkEndMs: Map<string, number>;
  /** Constraint compromises made while placing, surfaced as engine messages */
  relaxations: SplitRelaxation[];
}

export function createSplitPlacementState(): SplitPlacementState {
  return {
    placedMinutes: new Map(),
    chunkOrdinals: new Map(),
    dayMinutes: new Map(),
    lastChunkEndMs: new Map(),
    relaxations: [],
  };
}

export function splitRemainingForRun(
  task: Planner,
  state: SplitPlacementState,
): number {
  return Math.max(
    0,
    splitRemainingMinutes(task) - (state.placedMinutes.get(task.id) ?? 0),
  );
}

export function scheduleSplitTask(args: {
  task: Planner;
  settings: TaskSplittingSettings;
  scheduler: Scheduler;
  state: SplitPlacementState;
  afterTime?: Date;
  /**
   * Final-pass compromise: ignore the per-day cap when the strict attempt
   * finds nothing. Off during normal passes so horizon expansion gets the
   * chance to satisfy the cap before it is violated.
   */
  allowDayCapRelaxation?: boolean;
  /**
   * One entry per capped goal this leaf sits under (its own root plus every
   * detour host that splices it). The effective per-day budget is the
   * pointwise min of the task's own budget and every applicable goal budget;
   * every placed chunk charges every ledger. Oversized handling is per cap:
   * a goal budget below the required minimum chunk is ruled out of steering
   * for that goal only.
   */
  goalCaps?: GoalCapContext[];
}): {
  fullyPlaced: boolean;
  events: SimpleEvent[];
  failure?: SchedulingFailure;
} {
  const { task, settings, scheduler, state, goalCaps = [] } = args;
  const context = scheduler.context;

  // Optional minimum break between consecutive chunks of this task. Off by
  // default (chunks sit only the standard placement buffer apart).
  const spacingMs = (settings.minSpacingMinutes ?? 0) * 60 * 1000;

  let dayMap = state.dayMinutes.get(task.id);
  if (!dayMap) {
    dayMap = completedMinutesByDay(task);
    state.dayMinutes.set(task.id, dayMap);
    // Seed the spacing anchor from the latest completed segment so a new chunk
    // keeps its break from work already done, not just from other chunks.
    if (spacingMs > 0) {
      const latestSegmentEndMs = parseCompletedSegments(
        task.completedSegments,
      ).reduce((latest, s) => Math.max(latest, new Date(s.end).getTime()), 0);
      if (latestSegmentEndMs > 0) {
        state.lastChunkEndMs.set(task.id, latestSegmentEndMs);
      }
    }
  }
  const dayMinutes = dayMap;

  const dayBudgetFn =
    settings.maxMinutesPerDay !== null
      ? (slotStart: Date) =>
          Math.max(
            0,
            settings.maxMinutesPerDay! -
              (dayMinutes.get(dayKeyLocal(slotStart)) ?? 0),
          )
      : undefined;

  let remaining = splitRemainingForRun(task, state);
  const events: SimpleEvent[] = [];

  while (remaining > 0) {
    const minReq = minChunkRequired(remaining, settings);
    // The carving rule can itself demand a chunk beyond maxMinutes: a
    // remainder under 2*min cannot be split, so the only valid chunk is the
    // whole remainder. That is rule-forced (not slot-driven), applies even
    // in strict mode, and is surfaced as a maxChunk compromise.
    const ruleForcedWhole = minReq > effectiveMaxChunkMinutes(settings);

    // A goal budget below the required minimum chunk is rule-forced out of
    // the composition — no day could ever host the chunk under it. The chunk
    // still charges that ledger and is surfaced as an oversizedLeaf
    // compromise on that goal only; the remaining caps keep steering.
    const applyingCaps = goalCaps.filter((c) => minReq <= c.capMinutes);
    const ruledOutCaps = goalCaps.filter((c) => minReq > c.capMinutes);
    const budgetFns: Array<(slotStart: Date) => number> = [];
    if (dayBudgetFn) budgetFns.push(dayBudgetFn);
    for (const c of applyingCaps) budgetFns.push(c.budget);
    const effectiveBudgetFn =
      budgetFns.length > 0
        ? (slotStart: Date) =>
            budgetFns.reduce(
              (min, fn) => Math.min(min, fn(slotStart)),
              Infinity,
            )
        : undefined;

    // Two-pass slot search (mirrors the compromise pass's relaxation
    // ladder): fit-test at a preferred chunk size first so a roomy slot
    // beats an earlier minimum-size gap, then fall back to the true minimum.
    // The preferred size clamps to the max-chunk bound and the remainder, so
    // a bounded max never skips a gap that hosts a full-max chunk, and a
    // rule-forced-whole remainder collapses to a single pass.
    const preferredFit = Math.min(
      minReq * SCHEDULING_CONFIG.SPLIT_PREFERRED_CHUNK_MULTIPLIER,
      effectiveMaxChunkMinutes(settings),
      remaining,
    );
    const attempts: Array<{ fitMinutes: number; dayCap: boolean }> = [];
    if (preferredFit > minReq) {
      attempts.push({ fitMinutes: preferredFit, dayCap: true });
    }
    attempts.push({ fitMinutes: minReq, dayCap: true });
    if (args.allowDayCapRelaxation && effectiveBudgetFn) {
      attempts.push({ fitMinutes: minReq, dayCap: false });
    }

    let placedEvent: SimpleEvent | null = null;
    let placedWithoutDayCap = false;
    let lastFailure: SchedulingFailure | undefined;

    const ordinal = state.chunkOrdinals.get(task.id) ?? 0;
    const chunkTask: Planner = {
      ...task,
      id: chunkEventId(task.id, ordinal),
      duration: minReq,
    };
    // The pipeline resolves location/category/constraints by event id — a
    // missing entry would silently default the chunk to "Anywhere"/
    // uncategorized/unconstrained (chunks must land inside the task's
    // allowed fragments and honor its earliest start).
    context.plannerLocationMap?.set(
      chunkTask.id,
      context.plannerLocationMap.get(task.id) ?? null,
    );
    context.plannerCategoryMap?.set(
      chunkTask.id,
      context.plannerCategoryMap.get(task.id) ?? task.categoryId ?? null,
    );
    const taskConstraints = context.plannerConstraintsMap?.get(task.id);
    if (taskConstraints) {
      context.plannerConstraintsMap?.set(chunkTask.id, taskConstraints);
    }

    for (const attempt of attempts) {
      const chunkRemaining = remaining;
      const sizing: ChunkSizing = {
        minMinutes: attempt.fitMinutes,
        grant: (headroom, dayBudget) =>
          grantChunkMinutes({
            remaining: chunkRemaining,
            headroom,
            settings,
            dayBudget: attempt.dayCap ? dayBudget : undefined,
            maxOverride: ruleForcedWhole ? chunkRemaining : undefined,
          }),
        dayBudget: attempt.dayCap ? effectiveBudgetFn : undefined,
      };

      // When a minimum spacing is requested, hold the next chunk until at least
      // that long after the previous one; otherwise chunks sit only the standard
      // placement buffer apart, like any two dynamic placements.
      const lastEndMs =
        spacingMs > 0 ? state.lastChunkEndMs.get(task.id) : undefined;
      const spacedAfter =
        lastEndMs !== undefined ? new Date(lastEndMs + spacingMs) : undefined;
      const afterTime =
        spacedAfter && (!args.afterTime || spacedAfter > args.afterTime)
          ? spacedAfter
          : args.afterTime;

      const result = scheduler.scheduleTask(chunkTask, afterTime, sizing);
      if (result.success && result.event) {
        placedEvent = result.event;
        placedWithoutDayCap =
          !attempt.dayCap && effectiveBudgetFn !== undefined;
        break;
      }
      lastFailure = result.failure;
    }

    if (!placedEvent) {
      return {
        fullyPlaced: false,
        events,
        failure: {
          taskId: task.id,
          taskTitle: task.title,
          reason: lastFailure?.reason ?? SchedulingFailureReason.NO_SLOTS,
          details: `${remaining} of ${task.duration} minutes could not be placed (min chunk ${minReq} min)`,
          context: {
            remainingMinutes: remaining,
            placedMinutes: state.placedMinutes.get(task.id) ?? 0,
            minChunkMinutes: minReq,
          },
        },
      };
    }

    const start = new Date(placedEvent.start);
    const end = new Date(placedEvent.end);
    const granted = Math.round((end.getTime() - start.getTime()) / 60000);
    if (granted <= 0) break;

    // Budgets are read before charging so a relaxed placement is attributed
    // to the budgets it actually exceeded, not to all of them.
    const ownBudgetShort =
      placedWithoutDayCap &&
      dayBudgetFn !== undefined &&
      dayBudgetFn(start) < granted;
    const shortGoalCaps = placedWithoutDayCap
      ? applyingCaps.filter((c) => c.budget(start) < granted)
      : [];

    events.push(placedEvent);
    remaining -= granted;
    state.placedMinutes.set(
      task.id,
      (state.placedMinutes.get(task.id) ?? 0) + granted,
    );
    state.chunkOrdinals.set(task.id, ordinal + 1);
    if (spacingMs > 0) {
      state.lastChunkEndMs.set(
        task.id,
        Math.max(state.lastChunkEndMs.get(task.id) ?? 0, end.getTime()),
      );
    }
    addIntervalMinutesByDay(dayMinutes, start, end);
    for (const c of goalCaps) c.charge(start, end);

    if (ruleForcedWhole && granted > effectiveMaxChunkMinutes(settings)) {
      state.relaxations.push({
        plannerId: task.id,
        taskTitle: task.title,
        kind: "maxChunk",
        chunkMinutes: granted,
        chunkStart: placedEvent.start,
      });
    }
    for (const c of ruledOutCaps) {
      c.recordRelaxation("oversizedLeaf", granted, placedEvent.start);
    }
    if (placedWithoutDayCap) {
      if (
        dayBudgetFn !== undefined &&
        (ownBudgetShort || shortGoalCaps.length === 0)
      ) {
        state.relaxations.push({
          plannerId: task.id,
          taskTitle: task.title,
          kind: "dayCap",
          chunkMinutes: granted,
          chunkStart: placedEvent.start,
        });
      }
      for (const c of shortGoalCaps) {
        c.recordRelaxation("dayCap", granted, placedEvent.start);
      }
    }
  }

  return { fullyPlaced: true, events };
}
