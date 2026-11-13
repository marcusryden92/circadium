import { CategoryEvent } from "@/types/prisma";
import { CategorySlot, Slot } from "../../models/TimeSlot";

// Mutates `categoryEvents` in place: for each CategorySlot fragment in the
// slot array that's been marked trespassed by the travel pass, find the
// CategoryEvent whose period contains the fragment and set its
// trespassingStart / trespassingEnd flag. Same matching logic as the prior
// stampCategoryWrapperBorders did for SimpleEvent wrappers — moved here so
// trespass info now travels with the persisted CategoryEvent row.
export function stampCategoryEventBorders(
  categoryEvents: CategoryEvent[],
  slots: Slot[],
): void {
  if (categoryEvents.length === 0) return;

  for (const slot of slots) {
    if (slot.type === "category") {
      if (slot.trespassingStart) {
        stampMatching(categoryEvents, slot, "start");
      }
      if (slot.trespassingEnd) {
        stampMatching(categoryEvents, slot, "end");
      }
      continue;
    }

    if (slot.type === "travel" && slot.consumedCategoryIds?.length) {
      // Travel slot consumed (fully or partially) some category interiors.
      // Only stamp when the travel failed to fit (insufficient, red) — for
      // overconstrained travels the slot's own styling already communicates
      // the override.
      if (!slot.insufficientTravel) continue;
      for (const categoryId of slot.consumedCategoryIds) {
        stampByCategoryId(categoryEvents, categoryId, slot.start, slot.end);
      }
    }
  }
}

function stampByCategoryId(
  categoryEvents: CategoryEvent[],
  categoryId: string,
  travelStart: Date,
  travelEnd: Date,
): void {
  const travelStartMs = travelStart.getTime();
  const travelEndMs = travelEnd.getTime();

  for (let i = 0; i < categoryEvents.length; i++) {
    const event = categoryEvents[i];
    if (event.categoryId !== categoryId) continue;
    const eventStartMs = new Date(event.start).getTime();
    const eventEndMs = new Date(event.end).getTime();

    // Stamp a boundary only when the travel's time range actually crosses
    // that boundary. A travel landing in the middle of an event consumes
    // neither edge; a travel that begins before start (or earlier) and ends
    // within or past it consumes the start; symmetric logic for the end.
    if (travelStartMs <= eventStartMs && travelEndMs > eventStartMs) {
      stamp(categoryEvents, i, "start");
    }
    if (travelStartMs < eventEndMs && travelEndMs >= eventEndMs) {
      stamp(categoryEvents, i, "end");
    }
  }
}

function stampMatching(
  categoryEvents: CategoryEvent[],
  slot: CategorySlot,
  boundary: "start" | "end",
): void {
  const containingIndex = findContainingIndex(categoryEvents, slot);
  if (containingIndex === -1) return;

  stamp(categoryEvents, containingIndex, boundary);

  const containingEvent = categoryEvents[containingIndex];
  const boundaryTimestamp =
    boundary === "end"
      ? new Date(containingEvent.end).getTime()
      : new Date(containingEvent.start).getTime();

  const adjacentIndex = findAdjacentIndex(
    categoryEvents,
    containingIndex,
    boundaryTimestamp,
    boundary,
  );
  if (adjacentIndex !== -1) {
    stamp(categoryEvents, adjacentIndex, boundary === "end" ? "start" : "end");
  }
}

function findContainingIndex(
  categoryEvents: CategoryEvent[],
  slot: CategorySlot,
): number {
  const slotStartMs = slot.start.getTime();
  const slotEndMs = slot.end.getTime();

  for (let i = 0; i < categoryEvents.length; i++) {
    const event = categoryEvents[i];
    if (event.categoryId !== slot.categoryId) continue;
    const eventStartMs = new Date(event.start).getTime();
    const eventEndMs = new Date(event.end).getTime();
    if (eventStartMs <= slotStartMs && eventEndMs >= slotEndMs) {
      return i;
    }
  }
  return -1;
}

function findAdjacentIndex(
  categoryEvents: CategoryEvent[],
  containingIndex: number,
  boundaryTimestamp: number,
  trespassBoundary: "start" | "end",
): number {
  for (let i = 0; i < categoryEvents.length; i++) {
    if (i === containingIndex) continue;
    const event = categoryEvents[i];
    const sideMs =
      trespassBoundary === "end"
        ? new Date(event.start).getTime()
        : new Date(event.end).getTime();
    if (sideMs === boundaryTimestamp) return i;
  }
  return -1;
}

function stamp(
  categoryEvents: CategoryEvent[],
  index: number,
  boundary: "start" | "end",
): void {
  const event = categoryEvents[index];
  categoryEvents[index] = {
    ...event,
    trespassingStart:
      boundary === "start" ? true : event.trespassingStart,
    trespassingEnd: boundary === "end" ? true : event.trespassingEnd,
  };
}
