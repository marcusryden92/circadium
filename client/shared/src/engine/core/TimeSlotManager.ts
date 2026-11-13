import { Slot } from "../models/TimeSlot";

export class TimeSlotManager {
  /**
   * Sorted unified storage for all slots — available, occupied, travel.
   * Mutating helpers operate on this directly via splice. Filter by
   * `slot.type` for kind-specific views.
   */
  slots: Slot[] = [];

  readonly bufferTimeMinutes: number;
  readonly currentDate: Date;

  constructor(currentDate: Date = new Date(), bufferTimeMinutes: number = 0) {
    this.currentDate = currentDate;
    this.bufferTimeMinutes = bufferTimeMinutes;
  }

  clear(): void {
    this.slots.length = 0;
  }
}
