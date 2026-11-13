/**
 * TravelManager
 *
 * Manages travel time calculations and travel slot reservations.
 * Handles normal travel, insufficient travel, and location transitions.
 */

import { TravelEvent } from "@/types/prisma";
import {
  AvailableSlot,
  CategorySlot,
  Slot,
  TravelSlot,
} from "../models/TimeSlot";
import { TimeSlotManager } from "./TimeSlotManager";
import {
  TravelTimeEntry,
  TravelProcessingAction,
} from "../models/SchedulingModels";
import type { TravelShardSpan } from "../utils/timeSlotUtils";
import { createLegTracker } from "../helpers/TravelManager/legTracker";
import {
  getTravelTime,
  canPlaceStandaloneTravelBefore,
  reserveStandaloneTravelBefore,
  reserveStandaloneTravelAfter,
  reserveInsufficientTravelBefore,
  reserveInsufficientTravelAfter,
  findAdjacentTravelTo,
  findAdjacentTravelFrom,
  findPrecedingGapTravel,
  findFollowingGapTravel,
  generateTravelEvents,
} from "../helpers/TravelManager";

export class TravelManager {
  private travelTimeMatrix: Map<string, TravelTimeEntry> | null = null;
  private legTracker: ReturnType<typeof createLegTracker>;

  constructor(
    private slotManager: TimeSlotManager,
    private bufferTimeMinutes: number,
    travelTimeMatrix?: Map<string, TravelTimeEntry>,
  ) {
    this.travelTimeMatrix = travelTimeMatrix ?? null;
    this.legTracker = createLegTracker();
  }

  /** Mutable reference to the unified slots array. */
  private get slots(): Slot[] {
    return this.slotManager.slots;
  }

  /**
   * Resolves travel direction and duration for a given slot transition.
   * Stateful — leg tracking is shared across all calls on this instance.
   * Call resetLegTracker() before starting a new pass.
   *
   * Slots INSIDE a category always place travel at slot END (outbound). The
   * category slot represents being AT the category's location; travel
   * departs at the slot's end before the next thing. The legTracker bracket
   * model is only meaningful for non-category slots (gaps between fixed
   * events), where round-trip detection helps place travel correctly.
   */
  resolveTravel(slot: AvailableSlot): TravelProcessingAction | null {
    const { prevLocationId: prevLocation, nextLocationId: nextLocation } = slot;
    if (!prevLocation || !nextLocation || prevLocation === nextLocation)
      return null;

    const placeAtSlotStart = this.legTracker.track(prevLocation, nextLocation);

    const travelMinutes = this.getTravelTime(
      prevLocation,
      nextLocation,
      placeAtSlotStart ? slot.start : slot.end,
    );
    if (travelMinutes <= 0) return null;

    return { prevLocation, nextLocation, placeAtSlotStart, travelMinutes };
  }

  /**
   * Sibling of resolveTravel for CategorySlot edges. Entry edge transitions
   * prev → currentLocationId (placed at slot HEAD). Exit edge transitions
   * currentLocationId → next (placed at slot TAIL). Placement is fixed by
   * the edge, so the legTracker.track return value is recorded for
   * round-trip detection but doesn't affect where the travel lands —
   * placeAtSlotStart simply mirrors the edge (true for entry, false for
   * exit) so callers stay shape-compatible with resolveTravel's output.
   */
  resolveCategoryEdge(
    slot: CategorySlot,
    edge: "entry" | "exit",
  ): TravelProcessingAction | null {
    const from =
      edge === "entry" ? slot.prevLocationId : slot.currentLocationId;
    const to =
      edge === "entry" ? slot.currentLocationId : slot.nextLocationId;
    if (!from || !to || from === to) return null;

    this.legTracker.track(from, to);

    const referenceTime = edge === "entry" ? slot.start : slot.end;
    const travelMinutes = this.getTravelTime(from, to, referenceTime);
    if (travelMinutes <= 0) return null;

    return {
      prevLocation: from,
      nextLocation: to,
      placeAtSlotStart: edge === "entry",
      travelMinutes,
    };
  }

  /**
   * Track a leg explicitly without going through resolveTravel /
   * resolveCategoryEdge. Used by the dispatcher's absorb / replan paths
   * where the leg to track isn't derivable from a single slot's prev/next.
   * Returns true if this trip closes an open leg (return trip), false if
   * it opens a new one.
   */
  trackLeg(from: string, to: string): boolean {
    return this.legTracker.track(from, to);
  }

  /**
   * Undo a previously tracked leg. Used by the dispatcher when absorbing
   * a placed travel slot back into its adjacent Available — the open leg
   * the original track() call opened needs to be removed so future
   * round-trip detection isn't poisoned by stale history.
   */
  untrackLeg(from: string, to: string): void {
    this.legTracker.untrack(from, to);
  }

  resetLegTracker() {
    this.legTracker.reset();
  }

  /**
   * Set the travel time matrix for location-aware scheduling
   */
  setTravelTimeMatrix(matrix: Map<string, TravelTimeEntry> | null): void {
    this.travelTimeMatrix = matrix;
  }

  /**
   * Get travel time between two locations based on time of day
   * Returns 0 if either location is null (meaning "Anywhere") or if no travel entry exists
   */
  getTravelTime(
    fromLocationId: string | null,
    toLocationId: string | null,
    timeOfDay: Date,
  ): number {
    return getTravelTime(
      this.travelTimeMatrix,
      fromLocationId,
      toLocationId,
      timeOfDay,
    );
  }

  /**
   * Check if we can place a standalone travel-before that ends at a given time.
   * Non-mutating: scans available slots to see if [travelStart, travelEnd] fits.
   */
  canPlaceStandaloneTravelBefore(
    travelEnd: Date,
    travelMinutes: number,
  ): boolean {
    return canPlaceStandaloneTravelBefore(
      this.slots,
      this.bufferTimeMinutes,
      travelEnd,
      travelMinutes,
    );
  }

  /**
   * Reserve a standalone travel-before segment that ends at a given time.
   * Splits the containing available slot and records the travel as occupied.
   * @param force If true, creates the travel at full duration and marks overlapping
   *              slots as unavailable. Used for category travel where travel time is
   *              fixed regardless of schedule conflicts.
   */
  reserveStandaloneTravelBefore(
    travelEnd: Date,
    travelMinutes: number,
    fromLocationId: string,
    toLocationId: string,
    force: boolean = false,
  ): { success: boolean } {
    return reserveStandaloneTravelBefore(
      this.slots,
      this.bufferTimeMinutes,
      travelEnd,
      travelMinutes,
      fromLocationId,
      toLocationId,
      force,
    );
  }

  /**
   * Reserve a standalone travel-after segment that starts at a given time.
   * Splits the containing available slot and records the travel as occupied.
   * @param force If true, creates the travel at full duration and marks overlapping
   *              slots as unavailable. Used for category travel where travel time is
   *              fixed regardless of schedule conflicts.
   */
  reserveStandaloneTravelAfter(
    travelStart: Date,
    travelMinutes: number,
    fromLocationId: string,
    toLocationId: string,
    force: boolean = false,
  ): { success: boolean } {
    return reserveStandaloneTravelAfter(
      this.slots,
      this.bufferTimeMinutes,
      travelStart,
      travelMinutes,
      fromLocationId,
      toLocationId,
      force,
    );
  }

  /**
   * Reserve an insufficient travel-before segment when there's not enough room for full travel.
   * Creates a travel event that fills whatever space is available before the target time,
   * marked with insufficientTravel flag for alert styling.
   */
  reserveInsufficientTravelBefore(
    travelEnd: Date,
    requiredTravelMinutes: number,
    fromLocationId: string,
    toLocationId: string,
  ): { success: boolean } {
    return reserveInsufficientTravelBefore(
      this.slots,
      this.bufferTimeMinutes,
      travelEnd,
      requiredTravelMinutes,
      fromLocationId,
      toLocationId,
    );
  }

  /**
   * Reserve an insufficient travel-after segment when there's not enough room for full travel.
   * Creates a travel event that fills whatever space is available after the start time,
   * marked with insufficientTravel flag for alert styling.
   */
  reserveInsufficientTravelAfter(
    travelStart: Date,
    requiredTravelMinutes: number,
    fromLocationId: string,
    toLocationId: string,
  ): { success: boolean } {
    return reserveInsufficientTravelAfter(
      this.slots,
      this.bufferTimeMinutes,
      travelStart,
      requiredTravelMinutes,
      fromLocationId,
      toLocationId,
    );
  }

  /**
   * Find an existing travel slot going to a destination near a given time.
   * Used to determine if travel-after can be reused instead of reserving new space.
   */
  findAdjacentTravelTo(
    nearTime: Date,
    toLocationId: string,
  ): TravelShardSpan | null {
    return findAdjacentTravelTo(
      this.slots,
      this.bufferTimeMinutes,
      nearTime,
      toLocationId,
    );
  }

  /**
   * Find a gap-travel slot that ends just before a given slot start.
   * Used to detect when a pre-carved return trip precedes a free slot.
   */
  findPrecedingGapTravel(slotStart: Date): TravelShardSpan | null {
    return findPrecedingGapTravel(
      this.slots,
      this.bufferTimeMinutes,
      slotStart,
    );
  }

  /**
   * Find a gap-travel slot that starts flush at a given slot end and departs
   * from the given location. Used to detect a pre-carved outbound leg whose
   * origin goes stale when a differently-located task lands in the slot.
   */
  findFollowingGapTravel(
    slotEnd: Date,
    fromLocationId: string,
  ): TravelShardSpan | null {
    return findFollowingGapTravel(this.slots, slotEnd, fromLocationId);
  }

  /**
   * Find an existing travel slot originating FROM a given location near a given time.
   * Used to detect when a previous task already created a travel-after that can be absorbed.
   */
  findAdjacentTravelFrom(
    nearTime: Date,
    fromLocationId: string,
  ): TravelShardSpan | null {
    return findAdjacentTravelFrom(
      this.slots,
      this.bufferTimeMinutes,
      nearTime,
      fromLocationId,
    );
  }

  getAllTravelSlots(): TravelSlot[] {
    return this.slots.filter((s): s is TravelSlot => s.type === "travel");
  }

  generateTravelEvents(userId: string): TravelEvent[] {
    return generateTravelEvents(this.slots, userId);
  }
}
