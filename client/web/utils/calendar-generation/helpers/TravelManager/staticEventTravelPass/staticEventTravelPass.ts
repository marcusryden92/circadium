import { Category } from "@/types/prisma";
import { CategorySlot, Slot } from "../../../models/TimeSlot";
import { TravelManager } from "../../../core/TravelManager";
import { dropUnreachableCategoryVisits } from "../dropUnreachableCategoryVisits";
import { TravelPassRecorder } from "../TravelPassRecorder";
import { M } from "../travelPassMessages";
import { handleAvailable } from "./handleAvailable";
import { handleCategory } from "./handleCategory";

/**
 * Walks slots[] in order and places travel slots for location transitions.
 * Implements the decision tree in notes/claudeTravelCriteria.md.
 *
 * Trespass markers are set directly on CategorySlot fragments
 * (trespassingStart / trespassingEnd) so downstream wrapper-marking can
 * read them from the slot array without a side-channel. When the travel
 * pass fully replaces a CategorySlot with a Travel slot, the categoryId
 * is recorded on TravelSlot.consumedCategoryIds for the same purpose.
 *
 * Iteration: each handler returns the next index to process. The walker
 * uses a while-loop and sets i to the handler's return value, so newly
 * inserted slots don't get re-processed.
 */
export function staticEventTravelPass(
  hasLocationMap: boolean,
  categories: Category[],
  slots: Slot[],
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
  startIdx: number = 0,
): void {
  if (!hasLocationMap) return;

  // dropUnreachableCategoryVisits is run unconditionally — its trigger requires
  // three adjacent CategorySlots in a specific [A, B, C] location pattern, and
  // previously-replaced spots are now Travel slots, so it naturally no-ops on
  // the upstream finalized region. Crucially it must run on the *new* region
  // added by expansion, otherwise unreachable-Fun-between-Works in the new
  // chunk never gets dropped and the bleed cascade ends up routing the user
  // out to Fun's location with no return travel.
  dropUnreachableCategoryVisits(hasLocationMap, slots, travelManager);

  let i = startIdx;
  while (i < slots.length) {
    const slot = slots[i];

    if (slot.type === "occupied" || slot.type === "travel") {
      recorder?.beginSlot(slot);
      recorder?.decision(
        M.walker.skipOccupiedOrTravel(recorder.label(slot)),
        0,
      );
      recorder?.endSlot(slots);
      i += 1;
      continue;
    }

    recorder?.beginSlot(slot);

    if (slot.type === "available") {
      i = handleAvailable(slots, i, travelManager, categories, recorder);
      clearTrespassesUnderTravelInteriors(slots);
      recorder?.endSlot(slots);
      continue;
    }

    if (slot.type === "category") {
      i = handleCategory(slots, i, travelManager, categories, recorder);
      clearTrespassesUnderTravelInteriors(slots);
      recorder?.endSlot(slots);
      continue;
    }

    recorder?.endSlot(slots);
    i += 1;
  }

  markLastCategoryAsFinal(slots);
}

// Single-flag invariant: clear isFinal on every category in the array, then
// set it on the last one. expandSlots reads this to know where to
// pick up — there must never be more than one pickup point at a time, and it
// always points at the latest category whose exit edge had no reachable next
// at the time it was processed.
function markLastCategoryAsFinal(slots: Slot[]): void {
  let lastCategoryIdx = -1;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.type !== "category") continue;
    slot.isFinal = undefined;
    lastCategoryIdx = i;
  }
  if (lastCategoryIdx >= 0) {
    (slots[lastCategoryIdx] as CategorySlot).isFinal = true;
  }
}

// ---------------------------------------------------------------------------
// Invariant maintenance: after each walker iteration, drop any trespass
// boundary whose point now sits strictly inside an existing Travel slot's
// interior. Trespass markers signal a category boundary that has no visible
// travel crossing it; once a cascade produces a travel whose span subsumes
// the boundary point, the marker is redundant — the visible travel already
// conveys the crossing.
//
// Running this per-iteration keeps the slots array in a consistent state for
// subsequent handlers (and for the downstream wrapper-marker code that reads
// these flags). Marker setters always clear the corresponding flag on slots
// they shorten directly; this helper covers the rarer case where a later
// cascade's travel sweeps across a marker on a surviving neighbour.
// ---------------------------------------------------------------------------

function clearTrespassesUnderTravelInteriors(slots: Slot[]): void {
  for (const slot of slots) {
    if (slot.type !== "category") continue;
    if (slot.trespassingStart && isBoundaryInsideTravel(slots, slot.start)) {
      slot.trespassingStart = undefined;
    }
    if (slot.trespassingEnd && isBoundaryInsideTravel(slots, slot.end)) {
      slot.trespassingEnd = undefined;
    }
  }
}

function isBoundaryInsideTravel(slots: Slot[], boundary: Date): boolean {
  const ms = boundary.getTime();
  for (const s of slots) {
    if (s.type !== "travel") continue;
    if (s.start.getTime() < ms && s.end.getTime() > ms) return true;
  }
  return false;
}

// Dev-time consistency stub. handleAvailable and handleCategory call this
// when the walker reaches a shape that shouldn't be reachable on a clean
// forward pass; the message goes to console in non-production builds so the
// failure mode is visible to whoever is iterating on the cascade rules.
export function logInconsistency(message: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[staticEventTravelPass] ${message}`);
  }
}
