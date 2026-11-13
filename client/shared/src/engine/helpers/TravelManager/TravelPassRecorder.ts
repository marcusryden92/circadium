/**
 * TravelPassRecorder
 *
 * Accumulates a per-slot decision/action trail from staticEventTravelPass
 * together with an end-state snapshot of the slot array after each iteration.
 *
 * Two filters apply at record time:
 *   - enabled flag (off by default; no-op everywhere when false)
 *   - timespan [rangeStart, rangeEnd] — only slots that overlap the window
 *     produce records, so the log stays focused on the time the user is
 *     debugging.
 *
 * The recorder is intentionally append-only: every call site is a one-liner
 * that pushes a string into the current record, and the records array is
 * dumped by logstaticEventTravelPass at the end of CalendarGenerator.
 */

import { Slot } from "../../models/TimeSlot";
import {
  RecorderBase,
  type DecisionLine,
  type SlotSnapshot,
} from "../../utils/RecorderBase";

export type { DecisionLine, SlotSnapshot } from "../../utils/RecorderBase";
export type {
  RecorderLookups,
  RecorderOptions as TravelPassRecorderOptions,
} from "../../utils/RecorderBase";

export type SlotRecord = {
  pass: string;
  iterationIndex: number;
  slot: SlotSnapshot;
  decisions: DecisionLine[];
  actions: string[];
  endState: SlotSnapshot[];
};

export class TravelPassRecorder extends RecorderBase {
  private currentPass = "preliminary";
  private iterationCounter = 0;
  private current: SlotRecord | null = null;
  readonly records: SlotRecord[] = [];

  startPass(label: string): void {
    if (!this.enabled) return;
    this.currentPass = label;
    this.iterationCounter = 0;
  }

  beginSlot(slot: Slot): void {
    if (!this.enabled) return;
    this.iterationCounter += 1;
    if (!this.inRange(slot)) {
      this.current = null;
      return;
    }
    this.current = {
      pass: this.currentPass,
      iterationIndex: this.iterationCounter,
      slot: this.snapshot(slot),
      decisions: [],
      actions: [],
      endState: [],
    };
  }

  decision(text: string, depth = 0): void {
    if (!this.current) return;
    this.current.decisions.push({ depth, text });
  }

  action(text: string): void {
    if (!this.current) return;
    this.current.actions.push(text);
  }

  endSlot(slots: Slot[]): void {
    if (!this.current) return;
    this.current.endState = slots
      .filter((s) => this.inRange(s))
      .map((s) => this.snapshot(s));
    this.records.push(this.current);
    this.current = null;
  }
}
