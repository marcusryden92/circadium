/**
 * RecorderBase
 *
 * Shared scaffolding for the two debug recorders — TravelPassRecorder
 * (per-slot, static pass) and SchedulerRecorder (per-task, dynamic pass).
 *
 * Both recorders carry the same enable + date-range filter and produce the
 * same slot snapshots; only the accumulator (SlotRecord vs TaskRecord) and
 * the begin/end hooks differ.
 */

import type { Category } from "@/types/prisma";
import type { Slot } from "../models/TimeSlot";

export type DecisionLine = { depth: number; text: string };

export type SlotSnapshot = {
  label: string;
  type: Slot["type"];
  id: string | null;
  start: Date;
  end: Date;
  markers: string[];
};

export interface RecorderLookups {
  categoryById?: Map<string, Category>;
  locationNameById?: Map<string, string>;
  eventTitleById?: Map<string, string>;
}

export interface RecorderOptions {
  enabled: boolean;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  lookups?: RecorderLookups;
}

export abstract class RecorderBase {
  readonly enabled: boolean;
  protected readonly rangeStart: Date | null;
  protected readonly rangeEnd: Date | null;
  protected readonly lookups: RecorderLookups;

  constructor(opts: RecorderOptions) {
    this.enabled = opts.enabled;
    this.rangeStart = opts.rangeStart;
    this.rangeEnd = opts.rangeEnd;
    this.lookups = opts.lookups ?? {};
  }

  inRange(slot: Slot): boolean {
    if (!this.enabled) return false;
    if (this.rangeStart && slot.end <= this.rangeStart) return false;
    if (this.rangeEnd && slot.start >= this.rangeEnd) return false;
    return true;
  }

  locName(id: string | null | undefined): string {
    if (id == null) return "Anywhere";
    return this.lookups.locationNameById?.get(id) ?? id;
  }

  categoryName(id: string | null | undefined): string {
    if (id == null) return "—";
    return this.lookups.categoryById?.get(id)?.name ?? id;
  }

  fmtDate(d: Date): string {
    return this.fmt(d);
  }

  protected fmt(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  label(slot: Slot): string {
    return this.snapshot(slot).label;
  }

  protected snapshot(slot: Slot): SlotSnapshot {
    const start = slot.start;
    const end = slot.end;
    let label: string;
    let id: string | null = null;
    const markers: string[] = [];

    switch (slot.type) {
      case "category": {
        const name = this.categoryName(slot.categoryId);
        label = `Category(${name}) [${this.fmt(start)}–${this.fmt(end)}]`;
        id = slot.categoryId;
        if (slot.trespassingStart) markers.push("trespassingStart");
        if (slot.trespassingEnd) markers.push("trespassingEnd");
        if (slot.isFinal) markers.push("isFinal");
        break;
      }
      case "available": {
        const prev = this.locName(slot.prevLocationId);
        const next = this.locName(slot.nextLocationId);
        label = `Available [${this.fmt(start)}–${this.fmt(end)}, prev=${prev}, next=${next}]`;
        break;
      }
      case "occupied": {
        const title = this.lookups.eventTitleById?.get(slot.eventId);
        const name = title ?? `${slot.plannerType}/${slot.eventType}`;
        label = `Occupied(${name}) [${this.fmt(start)}–${this.fmt(end)}]`;
        id = slot.eventId;
        break;
      }
      case "travel": {
        const from = this.locName(slot.travelFromLocationId);
        const to = this.locName(slot.travelToLocationId);
        label = `Travel(${from}→${to}) [${this.fmt(start)}–${this.fmt(end)}]`;
        id = slot.eventId;
        if (slot.insufficientTravel) {
          markers.push(
            `insufficientTravel(needs ${slot.requiredTravelMinutes}min)`,
          );
        }
        if (slot.overconstrained) markers.push("overconstrained");
        if (slot.consumedCategoryIds && slot.consumedCategoryIds.length > 0) {
          const names = slot.consumedCategoryIds
            .map((cid) => this.categoryName(cid))
            .join(", ");
          markers.push(`consumed=[${names}]`);
        }
        if (slot.travelId) markers.push(`travelId=${slot.travelId.slice(0, 8)}`);
        break;
      }
    }

    return { label, type: slot.type, id, start, end, markers };
  }
}
