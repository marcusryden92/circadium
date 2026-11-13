import { Category } from "@/types/prisma";
import {
  AvailableSlot,
  CategorySlot,
  Slot,
} from "../../../models/TimeSlot";
import { TravelManager } from "../../../core/TravelManager";
import { TravelProcessingAction } from "../../../models/SchedulingModels";
import {
  createTravelShards,
  shardSourceFromAvailable,
  shardSourceFromCategory,
  type ShardSource,
} from "../../../utils/timeSlotUtils";
import { TravelPassRecorder } from "../TravelPassRecorder";
import { M } from "../travelPassMessages";
import {
  backwardBypassCascade,
  forwardBypassCascade,
} from "./cascade";
import { fillCurrentWithAlert } from "./placement";
import {
  shortenPlaceableAtEnd,
  shortenPlaceableAtStart,
  spliceBleedNext,
  spliceBleedPrev,
} from "./slotShape";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Action: Available, fill current, bleed remainder into one neighbor
// ---------------------------------------------------------------------------

export function bleedIntoPrev(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  categories: Category[],
  recorder?: TravelPassRecorder,
): number {
  const slot = slots[i] as AvailableSlot;
  const { prevLocation, nextLocation, travelMinutes } = action;
  const curDur = slot.durationMinutes;
  const prevIdx = i - 1;
  const prev = slots[prevIdx];

  const isPrevPlaceable =
    prev && (prev.type === "available" || prev.type === "category");

  if (!isPrevPlaceable) {
    recorder?.decision(M.bleedIntoPrev.prevNotPlaceable, 4);
    const result = fillCurrentWithAlert(slots, i, action);
    recorder?.action(M.bleedIntoPrev.fillCurrentWithAlertAction);
    return result;
  }

  const prevDur = prev.durationMinutes;
  const overflow = travelMinutes - curDur;

  // If a simple bleed would be insufficient, cascade backward through
  // previous placeable slots instead of immediately marking alert.
  if (overflow > prevDur) {
    recorder?.decision(
      M.bleedIntoPrev.overflowExceedsPrev(overflow, prevDur),
      4,
    );
    return backwardBypassCascade(
      slots,
      i,
      action,
      travelManager,
      categories,
      recorder,
    );
  }

  // Geometry: travel ends at slot.end (no legTracker rerouting here — bleed
  // just consumes time, doesn't pick a new route).
  const consumeFromPrev = overflow;
  const travelStart = new Date(slot.start.getTime() - consumeFromPrev * 60000);

  const sources: ShardSource[] = [];
  if (prev.type === "available") {
    sources.push(shardSourceFromAvailable(prev, travelStart, prev.end));
  } else {
    sources.push(shardSourceFromCategory(prev, travelStart, prev.end));
  }
  sources.push(shardSourceFromAvailable(slot, slot.start, slot.end));

  const shards = createTravelShards(
    sources,
    uuidv4(),
    prevLocation,
    nextLocation,
    "preliminary",
    {
      insufficientTravel: false,
      requiredTravelMinutes: 0,
    },
  );

  const prevConsumed = consumeFromPrev >= prevDur;
  recorder?.action(
    prevConsumed
      ? M.bleedIntoPrev.actionConsumed(recorder.label(prev))
      : M.bleedIntoPrev.actionShortened(recorder.label(prev), consumeFromPrev),
  );
  return spliceBleedPrev(
    slots,
    i,
    prevIdx,
    prev,
    shards,
    prevConsumed,
    travelStart,
  );
}

export function bleedIntoNext(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
): number {
  const slot = slots[i] as AvailableSlot;
  const { prevLocation, nextLocation, travelMinutes } = action;
  const curDur = slot.durationMinutes;
  const nextIdx = i + 1;
  const next = slots[nextIdx];

  const isNextPlaceable =
    next && (next.type === "available" || next.type === "category");

  if (!isNextPlaceable) {
    recorder?.decision(M.bleedIntoNext.nextNotPlaceable, 4);
    const result = fillCurrentWithAlert(slots, i, action);
    recorder?.action(M.bleedIntoNext.fillCurrentWithAlertAction);
    return result;
  }

  const nextDur = next.durationMinutes;
  const overflow = travelMinutes - curDur;

  // If a simple bleed would be insufficient, cascade forward through
  // subsequent placeable slots instead of immediately marking alert.
  if (overflow > nextDur) {
    recorder?.decision(
      M.bleedIntoNext.overflowExceedsNext(overflow, nextDur),
      4,
    );
    return forwardBypassCascade(slots, i, action, travelManager, recorder);
  }

  // Geometry: travel starts at slot.start (no legTracker rerouting here —
  // bleed just consumes time, doesn't pick a new route).
  const consumeFromNext = overflow;
  const travelEnd = new Date(slot.end.getTime() + consumeFromNext * 60000);

  const sources: ShardSource[] = [
    shardSourceFromAvailable(slot, slot.start, slot.end),
  ];
  if (next.type === "available") {
    sources.push(shardSourceFromAvailable(next, next.start, travelEnd));
  } else {
    sources.push(shardSourceFromCategory(next, next.start, travelEnd));
  }

  const shards = createTravelShards(
    sources,
    uuidv4(),
    prevLocation,
    nextLocation,
    "preliminary",
    {
      insufficientTravel: false,
      requiredTravelMinutes: 0,
    },
  );

  const nextConsumed = consumeFromNext >= nextDur;
  recorder?.action(
    nextConsumed
      ? M.bleedIntoNext.actionConsumed(recorder.label(next))
      : M.bleedIntoNext.actionShortened(recorder.label(next), consumeFromNext),
  );
  return spliceBleedNext(
    slots,
    i,
    nextIdx,
    next,
    shards,
    nextConsumed,
    travelEnd,
  );
}

// ---------------------------------------------------------------------------
// Action: Available, fill current, bleed into both neighbors (3-slot)
// ---------------------------------------------------------------------------

export function bleedAcrossPrevCurrentNext(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
): number {
  const slot = slots[i] as AvailableSlot;
  const prev = slots[i - 1];
  const next = slots[i + 1];

  const T = action.travelMinutes;
  const curDur = slot.durationMinutes;
  const prevDur = prev.durationMinutes;
  const nextDur = next.durationMinutes;
  const excess = T - curDur;
  const half = excess / 2;

  let bleedPrev: number;
  let bleedNext: number;
  let insufficient = false;

  if (excess <= prevDur + nextDur) {
    if (half <= prevDur && half <= nextDur) {
      bleedPrev = half;
      bleedNext = half;
    } else if (prevDur < nextDur) {
      bleedPrev = prevDur;
      bleedNext = excess - prevDur;
    } else {
      bleedNext = nextDur;
      bleedPrev = excess - nextDur;
    }
  } else {
    bleedPrev = prevDur;
    bleedNext = nextDur;
    insufficient = true;
  }

  const travelStart = new Date(slot.start.getTime() - bleedPrev * 60000);
  const travelEnd = new Date(slot.end.getTime() + bleedNext * 60000);

  // Three source pieces: prev's tail, current's whole, next's head.
  const sources: ShardSource[] = [];
  if (prev.type === "available") {
    sources.push(shardSourceFromAvailable(prev, travelStart, prev.end));
  } else if (prev.type === "category") {
    sources.push(shardSourceFromCategory(prev, travelStart, prev.end));
  }
  sources.push(shardSourceFromAvailable(slot, slot.start, slot.end));
  if (next.type === "available") {
    sources.push(shardSourceFromAvailable(next, next.start, travelEnd));
  } else if (next.type === "category") {
    sources.push(shardSourceFromCategory(next, next.start, travelEnd));
  }

  const shards = createTravelShards(
    sources,
    uuidv4(),
    action.prevLocation,
    action.nextLocation,
    "preliminary",
    {
      insufficientTravel: insufficient,
      requiredTravelMinutes: insufficient ? T : 0,
    },
  );

  const replacements: Slot[] = [];
  const firstShard = shards[0];
  const lastShard = shards[shards.length - 1];

  const prevConsumed = bleedPrev >= prevDur;
  if (
    !prevConsumed &&
    (prev.type === "available" || prev.type === "category")
  ) {
    replacements.push(
      shortenPlaceableAtEnd(prev, travelStart, firstShard.travelFromLocationId),
    );
  } else if (prevConsumed && prev.type === "category") {
    firstShard.consumedCategoryIds = (
      firstShard.consumedCategoryIds ?? []
    ).concat(prev.categoryId);
  }

  const shardStartIdx = replacements.length;
  replacements.push(...shards);

  const nextConsumed = bleedNext >= nextDur;
  if (
    !nextConsumed &&
    (next.type === "available" || next.type === "category")
  ) {
    replacements.push(
      shortenPlaceableAtStart(next, travelEnd, lastShard.travelToLocationId),
    );
  } else if (nextConsumed && next.type === "category") {
    lastShard.consumedCategoryIds = (
      lastShard.consumedCategoryIds ?? []
    ).concat(next.categoryId);
  }

  slots.splice(i - 1, 3, ...replacements);
  // Walker lands on the first slot AFTER the shards — typically the
  // shortened-next so it can be processed on the next iteration.
  return i - 1 + shardStartIdx + shards.length;
}

// ---------------------------------------------------------------------------
// Action: Category exit, Next=Category — bleed across cat-to-cat boundary
// ---------------------------------------------------------------------------

export function bleedAcrossCategoryBoundary(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
): number {
  const current = slots[i] as CategorySlot;
  const next = slots[i + 1] as CategorySlot;
  const T = action.travelMinutes;
  const curDur = current.durationMinutes;
  const nextDur = next.durationMinutes;

  // If symmetric placement won't fit (one side would be fully consumed),
  // prefer trespass over forced asymmetric placement. Forced asymmetric
  // cascades through later handlers: the surviving sliver of the squeezed
  // category gets eaten by the next transition, producing a chain of
  // overlapping travels that visually obliterates the categories. Better
  // to mark the boundary trespass and let the next handler operate on
  // the unshortened categories. Combined-too-small (T > curDur + nextDur)
  // falls into the same path.
  // Whole-minute split (current side takes the ceil) so slot boundaries stay
  // minute-aligned with the original fabric instead of landing on :30 seams
  // for odd T.
  const bleedCurrent = Math.ceil(T / 2);
  const bleedNext = T - bleedCurrent;
  if (bleedCurrent >= curDur || bleedNext >= nextDur) {
    travelManager.untrackLeg(action.prevLocation, action.nextLocation);
    current.trespassingEnd = true;
    next.trespassingStart = true;
    recorder?.decision(
      M.bleedAcrossCategoryBoundary.trespassBoundary(bleedCurrent),
      2,
    );
    if (recorder) {
      recorder.action(
        M.bleedAcrossCategoryBoundary.trespassAction(
          recorder.label(current),
          recorder.label(next),
        ),
      );
    }
    return i + 1;
  }

  const travelStart = new Date(current.end.getTime() - bleedCurrent * 60000);
  const travelEnd = new Date(next.start.getTime() + bleedNext * 60000);

  // Two source pieces: current's tail and next's head. A zero-width piece
  // (bleedNext can be 0 when T is 1) contributes no shard.
  const sources: ShardSource[] = [
    shardSourceFromCategory(current, travelStart, current.end),
  ];
  if (bleedNext > 0) {
    sources.push(shardSourceFromCategory(next, next.start, travelEnd));
  }
  const shards = createTravelShards(
    sources,
    uuidv4(),
    action.prevLocation,
    action.nextLocation,
    "preliminary",
  );

  const replacements: Slot[] = [];
  const firstShard = shards[0];
  const lastShard = shards[shards.length - 1];

  const currentConsumed = bleedCurrent >= curDur;
  if (!currentConsumed) {
    replacements.push({
      ...current,
      end: travelStart,
      durationMinutes: Math.floor(
        (travelStart.getTime() - current.start.getTime()) / 60000,
      ),
      nextLocationId: current.currentLocationId,
      isFinal: undefined,
    });
  } else {
    firstShard.consumedCategoryIds = (
      firstShard.consumedCategoryIds ?? []
    ).concat(current.categoryId);
  }

  const shardStartIdx = replacements.length;
  replacements.push(...shards);

  const nextConsumed = bleedNext >= nextDur;
  if (!nextConsumed) {
    replacements.push({
      ...next,
      start: travelEnd,
      durationMinutes: Math.floor(
        (next.end.getTime() - travelEnd.getTime()) / 60000,
      ),
      prevLocationId: next.currentLocationId,
    });
  } else {
    lastShard.consumedCategoryIds = (
      lastShard.consumedCategoryIds ?? []
    ).concat(next.categoryId);
  }

  slots.splice(i, 2, ...replacements);
  if (recorder) {
    recorder.action(
      M.bleedAcrossCategoryBoundary.action(
        bleedCurrent,
        currentConsumed,
        recorder.label(current),
        nextConsumed,
        recorder.label(next),
      ),
    );
  }
  // Walker lands on the first slot AFTER the shards — typically the
  // shortened-next category so its exit edge can fire on the next iteration.
  return i + shardStartIdx + shards.length;
}
