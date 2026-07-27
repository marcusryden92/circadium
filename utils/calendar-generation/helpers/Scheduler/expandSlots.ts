import type { Category } from "@/types/prisma";
import { TimeSlotManager } from "../../core/TimeSlotManager";
import { TravelManager } from "../../core/TravelManager";
import { PerTemplateMask } from "../../models/TemplateModels";
import { SchedulingContext } from "../../models/SchedulingModels";
import { Slot } from "../../models/TimeSlot";
import { dateTimeService } from "../../utils/dateTimeService";
import { SCHEDULING_CONFIG } from "../../constants";
import { buildAvailableSlots } from "../TimeSlotManager/buildAvailableSlots";
import { deriveSchedulingHorizon } from "../TimeSlotManager/deriveSchedulingHorizon";
import { dropPastAvailableSlots } from "../TimeSlotManager/dropPastAvailableSlots";
import { staticEventTravelPass } from "../TravelManager/staticEventTravelPass";
import { TravelPassRecorder } from "../TravelManager/TravelPassRecorder";

// The user's "outgoing" location at the end of a slot — where they are when
// the next slot begins. Used to bridge the seam between preserved slots and
// freshly-built slots when expanding the horizon.
function outgoingLocationOf(slot: Slot): string | null {
  switch (slot.type) {
    case "category":
      return slot.currentLocationId;
    case "available":
      return slot.nextLocationId ?? null;
    case "travel":
      return slot.travelToLocationId;
    case "occupied":
      return slot.locationId ?? null;
  }
}

// Extend the slot horizon by one fixed chunk (SCHEDULING_CONFIG.HORIZON_CHUNK_DAYS)
// past the previous pickup point. Picks up from the CategorySlot the previous
// static pass flagged isFinal — everything up to and including that slot is
// preserved verbatim (so previously-finalized decisions survive), and
// buildAvailableSlots fills in only the new region. The static pass then
// resumes at the isFinal slot so its deferred exit edge can finally be
// planned against the new region. Plans starting before pickup are already
// in preservedSlots; plans starting beyond the chunk end are deferred until
// a future expansion reaches them.
export type ExpansionReason = "watermark" | "fallback";

export function expandSlots(
  context: SchedulingContext,
  perTemplateMasks: PerTemplateMask[],
  plannerLocationMap: Map<string, string | null>,
  categories: Category[],
  slotManager: TimeSlotManager,
  travelManager: TravelManager,
  reason: ExpansionReason,
  travelPassRecorder?: TravelPassRecorder,
): void {
  const pickupIdx = slotManager.slots.findIndex(
    (s) => s.type === "category" && s.isFinal === true,
  );

  // Pickup time = end of the previously-deferred category. Fallback to today
  // when no marker exists — a legitimate state, not just an inconsistency:
  // markLastCategoryAsFinal can only stamp a CategorySlot, and a fabric with
  // no category slots (no windowed categories, or every window occurrence
  // covered by fixed events) has nothing to stamp. Nothing is preserved then
  // and the whole region rebuilds, which is safe because a marker-less fabric
  // holds no committed category-edge decisions.
  const pickupTime =
    pickupIdx >= 0
      ? slotManager.slots[pickupIdx].end
      : dateTimeService.startOfDay(context.currentDate);

  // Growth target: always grow the new chunk forward from the CURRENT horizon
  // end. When category slots run throughout the fabric the marker sits at the
  // tail and the horizon end coincides with the pickup. But an expanded region
  // with no category slot to mark leaves the marker stranded back in the
  // preserved region (markLastCategoryAsFinal marks the last category slot by
  // array position), and anchoring the chunk to that stale pickup would rebuild
  // the same region every expansion — the horizon never advances and expansion
  // burns on no-ops (the marker-less path already guarded this; windowed fabrics
  // with a category-free stretch hit the same trap). The new region still starts
  // at pickupTime (preserve/resume key off the marker), so only the chunk's
  // forward reach changes — a stranded marker no longer stalls the horizon.
  const chunkBase = deriveSchedulingHorizon(slotManager.slots, pickupTime);

  const chunkEnd = dateTimeService.endOfDay(
    dateTimeService.shiftDays(
      chunkBase,
      SCHEDULING_CONFIG.HORIZON_CHUNK_DAYS - 1,
    ),
  );

  const pickupMs = pickupTime.getTime();
  const preservedSlots: Slot[] = slotManager.slots.filter(
    (s) => s.end.getTime() <= pickupMs,
  );

  const expansionEvents = context.scheduledEvents.filter((e) => {
    const start = new Date(e.start);
    return start.getTime() >= pickupMs && start <= chunkEnd;
  });

  // The user's location at pickupTime is the outgoing location of the last
  // preserved slot. Without this, buildAvailableSlots' startingLocation
  // defaults to the nearest event in expansionEvents (typically a template
  // at home), and the first new Available gets prev=home — overwriting the
  // continuity from a preserved Cat at a different location and causing the
  // static pass to skip the Cat→Home travel placement.
  const lastPreserved =
    preservedSlots.length > 0
      ? preservedSlots[preservedSlots.length - 1]
      : null;
  const startingLocationOverride = lastPreserved
    ? outgoingLocationOf(lastPreserved)
    : undefined;

  const newSlots = buildAvailableSlots({
    startDate: pickupTime,
    existingEvents: expansionEvents,
    templateMasks: perTemplateMasks,
    categories,
    plannerLocationMap,
    endDateOverride: chunkEnd,
    startingLocationOverride,
  });

  const combinedSlots: Slot[] = [...preservedSlots, ...newSlots].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  // Resume index: the previously-flagged isFinal slot sits at the tail of
  // preservedSlots (sorted-by-start ordering + pickupTime > pickupSlot.start
  // keeps it there). When no marker existed, start the walker from 0.
  const resumeIdx = pickupIdx >= 0 ? preservedSlots.length - 1 : 0;

  // Replay legTracker state from preserved Travel slots before the resume
  // walks. Without this, the resume pass starts with an empty tracker; the
  // walker visits preserved Travels but only "skips" them (no track() call),
  // so a return trip in the new region (e.g. gamla-stan→home Available right
  // after the isFinal Cat) has no mirror to close, gets classified as
  // outbound, and lands as PlaceAtEnd instead of PlaceAtStart — flipping
  // every subsequent same-pair travel to the wrong end of its Available.
  // Walker semantics the replay must mirror: legTracker.track() is only
  // called from resolveTravel / resolveCategoryEdge, both of which short-
  // circuit when from === to. Self-travel TravelSlots (e.g. gamla-stan →
  // gamla-stan with consumed=[Fun] produced by dropUnreachableCategoryVisits)
  // exist in the slot array but were never tracked. Multi-shard travels
  // share a travelId and were tracked exactly once when first placed; the
  // shard-emit step doesn't re-track. So the replay needs to skip self-
  // travels and dedupe by travelId — without this, we overcount and stale
  // entries in openLegs hijack mirror/chain matches in the new region,
  // flipping subsequent PlaceAtStart decisions to PlaceAtEnd.
  travelManager.resetLegTracker();
  const seenTravelIds = new Set<string>();
  for (const s of preservedSlots) {
    if (s.type !== "travel") continue;
    if (!s.travelFromLocationId || !s.travelToLocationId) continue;
    if (s.travelFromLocationId === s.travelToLocationId) continue;
    const id = s.travelId ?? s.eventId;
    if (id) {
      if (seenTravelIds.has(id)) continue;
      seenTravelIds.add(id);
    }
    travelManager.trackLeg(s.travelFromLocationId, s.travelToLocationId);
  }

  if (travelPassRecorder) {
    const y = pickupTime.getFullYear();
    const m = String(pickupTime.getMonth() + 1).padStart(2, "0");
    const d = String(pickupTime.getDate()).padStart(2, "0");
    travelPassRecorder.startPass(`resume(${reason})@${y}-${m}-${d}`);
  }
  staticEventTravelPass(
    !!plannerLocationMap,
    categories,
    combinedSlots,
    travelManager,
    travelPassRecorder,
    resumeIdx,
  );

  slotManager.slots = dropPastAvailableSlots(
    combinedSlots,
    context.currentDate,
  );
}
