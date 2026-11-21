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
} from "../../../utils/timeSlotUtils";
import { TravelPassRecorder } from "../TravelPassRecorder";
import { M } from "../travelPassMessages";
import { makeAvailableLeftover } from "./slotShape";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Action: Available, current large enough — PlaceAtStart / PlaceAtEnd
// ---------------------------------------------------------------------------

export function placeTravelInCurrent(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
): number {
  const slot = slots[i] as AvailableSlot;
  const { prevLocation, nextLocation, placeAtSlotStart, travelMinutes } =
    action;

  const travelStart = placeAtSlotStart
    ? slot.start
    : new Date(slot.end.getTime() - travelMinutes * 60000);
  const travelEnd = placeAtSlotStart
    ? new Date(slot.start.getTime() + travelMinutes * 60000)
    : slot.end;

  const shards = createTravelShards(
    [shardSourceFromAvailable(slot, travelStart, travelEnd)],
    uuidv4(),
    prevLocation,
    nextLocation,
    "preliminary",
  );

  const replacements: Slot[] = [];
  if (placeAtSlotStart) {
    replacements.push(...shards);
    if (travelEnd.getTime() < slot.end.getTime()) {
      replacements.push(
        makeAvailableLeftover(
          travelEnd,
          slot.end,
          nextLocation,
          slot.nextLocationId ?? null,
        ),
      );
    }
  } else {
    if (slot.start.getTime() < travelStart.getTime()) {
      replacements.push(
        makeAvailableLeftover(
          slot.start,
          travelStart,
          slot.prevLocationId ?? null,
          prevLocation,
        ),
      );
    }
    replacements.push(...shards);
  }

  slots.splice(i, 1, ...replacements);
  return i + replacements.length;
}

// ---------------------------------------------------------------------------
// Action: Category entry — PlaceAtStart (eat from interior at HEAD)
// ---------------------------------------------------------------------------

export function placeTravelAtCategoryHead(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
): number {
  const slot = slots[i] as CategorySlot;
  const { prevLocation, nextLocation, travelMinutes } = action;

  const travelStart = slot.start;
  const naturalEnd = new Date(travelStart.getTime() + travelMinutes * 60000);
  // A survivor under a minute would be a degenerate zero-duration category
  // sliver; absorb it into the travel and treat the slot as fully consumed.
  const fullyConsumed = slot.end.getTime() - naturalEnd.getTime() < 60000;
  const travelEnd = fullyConsumed ? slot.end : naturalEnd;

  const shards = createTravelShards(
    [shardSourceFromCategory(slot, travelStart, travelEnd)],
    uuidv4(),
    prevLocation,
    nextLocation,
    "preliminary",
    { categoryId: slot.categoryId, isStrictCategory: slot.isStrictCategory },
  );

  const replacements: Slot[] = [...shards];
  if (fullyConsumed) {
    shards[0].consumedCategoryIds = (
      shards[0].consumedCategoryIds ?? []
    ).concat(slot.categoryId);
  } else {
    replacements.push({
      ...slot,
      start: travelEnd,
      durationMinutes: Math.floor(
        (slot.end.getTime() - travelEnd.getTime()) / 60000,
      ),
      prevLocationId: slot.currentLocationId,
      trespassingStart: undefined,
    });
  }

  slots.splice(i, 1, ...replacements);
  // Position walker at the shortened category for exit-edge handling. When
  // the travel consumed the whole slot this points at the following slot;
  // handleCategory verifies it is the same category before running the exit
  // edge, so a follower gets a full fresh walk (entry edge included).
  return i + 1;
}

// ---------------------------------------------------------------------------
// Action: Category exit — PlaceAtEnd (eat from interior at TAIL)
// ---------------------------------------------------------------------------

export function placeTravelAtCategoryTail(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
): number {
  const slot = slots[i] as CategorySlot;
  const { prevLocation, nextLocation, travelMinutes } = action;

  const travelEnd = slot.end;
  const naturalStart = new Date(travelEnd.getTime() - travelMinutes * 60000);
  // Same sub-minute survivor rule as placeTravelAtCategoryHead.
  const fullyConsumed = naturalStart.getTime() - slot.start.getTime() < 60000;
  const travelStart = fullyConsumed ? slot.start : naturalStart;

  const shards = createTravelShards(
    [shardSourceFromCategory(slot, travelStart, travelEnd)],
    uuidv4(),
    prevLocation,
    nextLocation,
    "preliminary",
    { categoryId: slot.categoryId, isStrictCategory: slot.isStrictCategory },
  );

  const replacements: Slot[] = [];
  if (fullyConsumed) {
    shards[0].consumedCategoryIds = (
      shards[0].consumedCategoryIds ?? []
    ).concat(slot.categoryId);
  } else {
    replacements.push({
      ...slot,
      end: travelStart,
      durationMinutes: Math.floor(
        (travelStart.getTime() - slot.start.getTime()) / 60000,
      ),
      nextLocationId: slot.currentLocationId,
      trespassingEnd: undefined,
      isFinal: undefined,
    });
  }
  replacements.push(...shards);

  slots.splice(i, 1, ...replacements);
  return i + replacements.length;
}

// ---------------------------------------------------------------------------
// Action: Available with both neighbors fixed (Occupied), too small — fill + alert
// ---------------------------------------------------------------------------

export function fillCurrentWithAlert(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
): number {
  const slot = slots[i] as AvailableSlot;
  const shards = createTravelShards(
    [shardSourceFromAvailable(slot, slot.start, slot.end)],
    uuidv4(),
    action.prevLocation,
    action.nextLocation,
    "preliminary",
    {
      insufficientTravel: true,
      requiredTravelMinutes: action.travelMinutes,
    },
  );
  slots.splice(i, 1, ...shards);
  return i + shards.length;
}

// ---------------------------------------------------------------------------
// Action: Category exit, doesn't fit, no cascade found a placement — mark
// the exit boundary trespass. Every caller guarantees T > curDur, so a
// visible travel can never fit inside the category; the boundary marker is
// the only coherent output. The caller must have the leg tracked (this
// untracks it — no travel is placed).
// ---------------------------------------------------------------------------

export function trespassCategoryExit(
  slots: Slot[],
  i: number,
  action: TravelProcessingAction,
  travelManager: TravelManager,
  recorder?: TravelPassRecorder,
): number {
  const slot = slots[i] as CategorySlot;
  const T = action.travelMinutes;
  const curDur = slot.durationMinutes;

  slot.trespassingEnd = true;
  travelManager.untrackLeg(action.prevLocation, action.nextLocation);
  recorder?.decision(M.trespassCategoryExit.trespassEnd(T, curDur), 3);
  recorder?.action(
    M.trespassCategoryExit.trespassEndAction(recorder.label(slot)),
  );
  return i + 1;
}
