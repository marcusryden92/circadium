import { PlannerType, EventType } from "@/types/prisma";

type BaseSlot = {
  start: Date;
  end: Date;
  durationMinutes: number;
};

export type SlotType = "available" | "category" | "occupied" | "travel";

export type AvailableSlot = BaseSlot & {
  type: "available";
  prevLocationId?: string | null;
  nextLocationId?: string | null;
};

export type CategorySlot = BaseSlot & {
  type: "category";
  currentLocationId: string | null;
  prevLocationId: string | null;
  nextLocationId: string | null;
  categoryId: string;
  isStrictCategory: boolean;
  // Set by the travel pass when travel into/out of this category would have
  // fully consumed the slot's interior. The wrapper event's top/bottom border
  // is stamped red downstream; no visible travel slot is emitted.
  trespassingStart?: boolean;
  trespassingEnd?: boolean;
  // Pickup-point marker: identifies the latest category whose exit edge
  // the static pass deferred (because nothing reachable came after it).
  // Invariant: at most one slot in the array carries this flag at a time.
  // expandSlots finds the flagged slot, preserves everything up
  // to it, builds new slots beyond it, then re-runs the static pass with
  // startIdx set to this slot's index — so the deferred exit edge gets
  // planned against the new region without re-deciding upstream slots.
  isFinal?: boolean;
};

export type OccupiedSlot = BaseSlot & {
  type: "occupied";
  eventId: string;
  plannerType: PlannerType;
  eventType: Exclude<EventType, "travel">;
  // The event's location. null = "Anywhere" — the user has no specific
  // location during this slot, so adjacent transitions can propagate
  // through it without being forced to start/end at this event.
  locationId?: string | null;
};

export type TravelSlot = BaseSlot & {
  type: "travel";
  eventId: string;
  eventType: Extract<EventType, "travel">;
  travelFromLocationId: string | null;
  travelToLocationId: string | null;
  travelType: "preliminary" | "inbound" | "outbound";
  // Red marker: the slot is shorter than the travel actually needs.
  insufficientTravel: boolean;
  requiredTravelMinutes: number;
  // Yellow marker: the slot fits the travel duration, but this routing was
  // forced (absorb-and-replan that skips a category visit, wasted round
  // trip, etc.). Co-exists with insufficientTravel when both apply.
  overconstrained?: boolean;
  // IDs of CategorySlots this travel replaced (because it fully consumed
  // their interior). The wrapper-marker scanner sets trespass flags on the
  // matching wrappers downstream.
  consumedCategoryIds?: string[];
  categoryId?: string | null;
  isStrictCategory?: boolean;

  // ---- Shard model -------------------------------------------------------
  // A single logical travel can be split across N source slots it consumed
  // (e.g. a bleed-across-prev-current-next produces three shards: one per
  // eaten source piece). All shards of one logical travel share a travelId
  // and render as a single travel block downstream.
  //
  // travelId is required on new placements; older single-slot travels that
  // pre-date the shard model leave it undefined.
  travelId?: string;
  // The original slot type this shard was carved out of. "available" means
  // the user had free time here; "category" means a category interior
  // contributed time.
  originalType?: "available" | "category";
  // The boundaries of the source slot before splicing. Used by unplanTravel
  // to restore the original fragment when this shard is removed.
  originalSourceStart?: Date;
  originalSourceEnd?: Date;
  // For category shards only: identity of the source category fragment.
  originalCategoryId?: string;
  originalLocationId?: string | null;
  originalIsStrictCategory?: boolean;
  // For available shards only: the source's prev/next locations.
  originalPrevLocationId?: string | null;
  originalNextLocationId?: string | null;
};

export type Slot = AvailableSlot | CategorySlot | OccupiedSlot | TravelSlot;
export type TimeSlot = Slot;

// Slots that a task can land in — free time or category interior.
export type PlaceableSlot = AvailableSlot | CategorySlot;

export interface TimeSlotBlock {
  /** Start of the day */
  date: Date;
  /** All slots for this day */
  slots: TimeSlot[];
  /** Quick lookup for available slots */
  availableSlots: AvailableSlot[];
}
