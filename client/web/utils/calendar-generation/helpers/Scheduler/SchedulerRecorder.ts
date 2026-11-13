/**
 * SchedulerRecorder
 *
 * Accumulates a per-task decision/action trail from the dynamic scheduling
 * phase (after staticEventTravelPass). For each task the scheduler attempts
 * to place, we capture:
 *
 *   - the task identity (id, title, duration, location, category constraint)
 *   - decision branching during slot selection (which candidate considered,
 *     travel-before/after math, absorb/reclaim choices, capacity check)
 *   - actions taken during reservation (span removals, leftover splices,
 *     travel slot creation)
 *   - outcome (scheduled at [start, end] / failed with reason)
 *   - end-state snapshot of the slot array (filtered to dateRangeStart..End)
 *
 * Filters at record time:
 *   - enabled flag (off by default; no-op everywhere when false)
 *   - timespan [rangeStart, rangeEnd] — a task record is kept if the task's
 *     scheduled time or its candidate's start falls in the window; failed
 *     tasks are always kept (the user usually cares about failures).
 *
 * Use case: trace where a dynamic task absorbed a multi-shard travel
 * incorrectly, which slot it ended up in, and which decision branch led
 * there.
 */

import type { Planner } from "@/types/prisma";
import type { Slot } from "../../models/TimeSlot";
import {
  RecorderBase,
  type DecisionLine,
  type SlotSnapshot,
} from "../../utils/RecorderBase";

export type { DecisionLine, SlotSnapshot } from "../../utils/RecorderBase";
export type {
  RecorderLookups as SchedulerRecorderLookups,
  RecorderOptions as SchedulerRecorderOptions,
} from "../../utils/RecorderBase";

export type TaskOutcome =
  | { kind: "scheduled"; start: Date; end: Date }
  | { kind: "failed"; reason: string; details?: string }
  | { kind: "skipped"; reason: string };

export type TaskRecord = {
  iterationIndex: number;
  task: {
    id: string;
    title: string;
    duration: number;
    locationId: string | null | undefined;
    categoryConstraintId: string | null | undefined;
  };
  decisions: DecisionLine[];
  actions: string[];
  outcome: TaskOutcome | null;
  endState: SlotSnapshot[];
  inRangeHit: boolean;
};

export class SchedulerRecorder extends RecorderBase {
  private iterationCounter = 0;
  private current: TaskRecord | null = null;
  readonly records: TaskRecord[] = [];

  /**
   * A Date is "in range" if it falls within [rangeStart, rangeEnd] with
   * either bound optional (null = open on that side). When neither bound
   * is set, everything is in range.
   */
  private dateInRange(d: Date): boolean {
    if (this.rangeStart && d < this.rangeStart) return false;
    if (this.rangeEnd && d > this.rangeEnd) return false;
    return true;
  }

  beginTask(
    task: Planner,
    taskLocationId: string | null | undefined,
    categoryConstraintId: string | null | undefined,
  ): void {
    if (!this.enabled) return;
    this.iterationCounter += 1;
    this.current = {
      iterationIndex: this.iterationCounter,
      task: {
        id: task.id,
        title: task.title,
        duration: task.duration,
        locationId: taskLocationId,
        categoryConstraintId,
      },
      decisions: [],
      actions: [],
      outcome: null,
      endState: [],
      inRangeHit: false,
    };
  }

  decision(text: string, depth = 0): void {
    if (!this.current) return;
    this.current.decisions.push({ depth, text });
  }

  /**
   * Mark that a slot in the configured time window was touched by this
   * task's processing — either evaluated as a candidate or chosen as the
   * placement. Drives the per-task in-range filter at dump time.
   */
  noteSlotInRange(slot: { start: Date; end: Date }): void {
    if (!this.current) return;
    if (
      this.rangeStart &&
      slot.end &&
      slot.end.getTime() <= this.rangeStart.getTime()
    )
      return;
    if (
      this.rangeEnd &&
      slot.start &&
      slot.start.getTime() >= this.rangeEnd.getTime()
    )
      return;
    this.current.inRangeHit = true;
  }

  action(text: string): void {
    if (!this.current) return;
    this.current.actions.push(text);
  }

  setOutcome(outcome: TaskOutcome): void {
    if (!this.current) return;
    this.current.outcome = outcome;
    // Scheduled outcomes count as in-range only if the schedule time
    // overlaps the window. Failed/skipped outcomes don't auto-mark — they
    // get included only if a candidate evaluation already flagged the
    // task as in-range. This keeps the noise level down when the user
    // narrows the date range.
    if (outcome.kind === "scheduled") {
      if (
        this.dateInRange(outcome.start) ||
        this.dateInRange(outcome.end)
      ) {
        this.current.inRangeHit = true;
      }
    }
  }

  endTask(slots: Slot[]): void {
    if (!this.current) return;
    if (
      this.current.inRangeHit ||
      (!this.rangeStart && !this.rangeEnd) ||
      this.current.outcome?.kind === "failed"
    ) {
      this.current.endState = slots
        .filter((s) => this.inRange(s))
        .map((s) => this.snapshot(s));
      this.records.push(this.current);
    }
    this.current = null;
  }

  taskLabel(): string {
    if (!this.current) return "(no task)";
    return `${this.current.task.title} [${this.current.task.duration}min]`;
  }
}
