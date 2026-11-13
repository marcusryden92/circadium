import {
  AvailableSlot,
  CategorySlot,
  Slot,
  TravelSlot,
} from "../../../models/TimeSlot";

export function makeAvailableLeftover(
  start: Date,
  end: Date,
  prevLocationId: string | null,
  nextLocationId: string | null,
): AvailableSlot {
  return {
    type: "available",
    start,
    end,
    durationMinutes: Math.floor((end.getTime() - start.getTime()) / 60000),
    prevLocationId,
    nextLocationId,
  };
}

export function shortenPlaceableAtEnd(
  source: AvailableSlot | CategorySlot,
  newEnd: Date,
  newNextLocationId: string | null,
): AvailableSlot | CategorySlot {
  if (source.type === "category") {
    return {
      ...source,
      end: newEnd,
      durationMinutes: Math.floor(
        (newEnd.getTime() - source.start.getTime()) / 60000,
      ),
      nextLocationId: newNextLocationId,
      trespassingEnd: undefined,
      isFinal: undefined,
    };
  }
  return {
    ...source,
    end: newEnd,
    durationMinutes: Math.floor(
      (newEnd.getTime() - source.start.getTime()) / 60000,
    ),
    nextLocationId: newNextLocationId,
  };
}

export function shortenPlaceableAtStart(
  source: AvailableSlot | CategorySlot,
  newStart: Date,
  newPrevLocationId: string | null,
): AvailableSlot | CategorySlot {
  if (source.type === "category") {
    return {
      ...source,
      start: newStart,
      durationMinutes: Math.floor(
        (source.end.getTime() - newStart.getTime()) / 60000,
      ),
      prevLocationId: newPrevLocationId,
      trespassingStart: undefined,
    };
  }
  return {
    ...source,
    start: newStart,
    durationMinutes: Math.floor(
      (source.end.getTime() - newStart.getTime()) / 60000,
    ),
    prevLocationId: newPrevLocationId,
  };
}

// Returns the surviving "tail" slot after a cascade's natural-fit travel
// lands inside `landingSlot` at `splitTime`. For Available/Category landing
// slots, that's a shortened-at-start version of the original. For a zero-
// distance Travel sentinel landing, the sentinel's consumed cats have
// already been transferred to the new travel above, so the leftover is
// simply free time at the destination (the user is at destination from
// splitTime until the sentinel's original end).
export function buildLandingSurvivor(
  landingSlot: AvailableSlot | CategorySlot | TravelSlot,
  splitTime: Date,
  destinationLocation: string,
): AvailableSlot | CategorySlot {
  if (landingSlot.type === "travel") {
    return {
      type: "available",
      start: splitTime,
      end: landingSlot.end,
      durationMinutes: Math.floor(
        (landingSlot.end.getTime() - splitTime.getTime()) / 60000,
      ),
      prevLocationId: destinationLocation,
      nextLocationId: destinationLocation,
    };
  }
  return shortenPlaceableAtStart(landingSlot, splitTime, destinationLocation);
}

export function spliceBleedPrev(
  slots: Slot[],
  curIdx: number,
  prevIdx: number,
  prev: Slot,
  shards: TravelSlot[],
  prevConsumed: boolean,
  travelStart: Date,
): number {
  // Replace [prev, current] with [shortened prev?, ...shards]. Trespass only
  // fires when the category interior is FULLY consumed — partial bleeds
  // just shorten the category without marking a boundary.
  const replacements: Slot[] = [];
  const firstShard = shards[0];

  if (
    !prevConsumed &&
    (prev.type === "available" || prev.type === "category")
  ) {
    replacements.push(
      shortenPlaceableAtEnd(prev, travelStart, firstShard.travelFromLocationId),
    );
  } else if (prevConsumed && prev.type === "category") {
    firstShard.consumedCategoryIds = (firstShard.consumedCategoryIds ?? []).concat(
      prev.categoryId,
    );
  }

  replacements.push(...shards);
  slots.splice(prevIdx, curIdx - prevIdx + 1, ...replacements);
  return prevIdx + replacements.length;
}

export function spliceBleedNext(
  slots: Slot[],
  curIdx: number,
  nextIdx: number,
  next: Slot,
  shards: TravelSlot[],
  nextConsumed: boolean,
  travelEnd: Date,
): number {
  // Replace [current, next] with [...shards, shortened next?]. Trespass only
  // on full consumption (see spliceBleedPrev for rationale).
  const replacements: Slot[] = [...shards];
  const lastShard = shards[shards.length - 1];

  if (
    !nextConsumed &&
    (next.type === "available" || next.type === "category")
  ) {
    replacements.push(
      shortenPlaceableAtStart(next, travelEnd, lastShard.travelToLocationId),
    );
  } else if (nextConsumed && next.type === "category") {
    lastShard.consumedCategoryIds = (lastShard.consumedCategoryIds ?? []).concat(
      next.categoryId,
    );
  }

  slots.splice(curIdx, nextIdx - curIdx + 1, ...replacements);
  // Walker lands on the slot AFTER the last shard so a Category neighbor's
  // exit edge can fire on the next iteration.
  return curIdx + shards.length;
}
