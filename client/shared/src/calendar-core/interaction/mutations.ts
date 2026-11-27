import type { HitResult } from "../layout/hitTest";
import type { MoveDelta, ResizeDelta, CreateRange } from "./types";

/**
 * Compute the day + minute offset between two hit-test results.
 * Rewrites FullCalendar's computeEventMutation / computeMutation
 * (interaction/index.js ~L1201, ~L1523) in our own terms.
 */
export function computeMoveDelta(
  startHit: HitResult,
  endHit: HitResult,
): MoveDelta {
  const dayOffset = Math.round(
    (endHit.day.getTime() - startHit.day.getTime()) / (24 * 60 * 60_000),
  );
  const minuteOffset = endHit.minute - startHit.minute;
  return { dayOffset, minuteOffset };
}

/**
 * Compute a resize delta from two hits and which edge is being dragged.
 * For resize-start the duration shrinks when the start moves later;
 * for resize-end it grows when the end moves later.
 */
export function computeResizeDelta(
  startHit: HitResult,
  endHit: HitResult,
  edge: "start" | "end",
): ResizeDelta {
  const minuteOffset = endHit.minute - startHit.minute;
  return {
    durationDelta: edge === "end" ? minuteOffset : -minuteOffset,
    edge,
  };
}

/**
 * Derive a new event range from a create-by-drag gesture.
 * Rewrites FullCalendar's joinHitsIntoSelection
 * (interaction/index.js ~L1716).
 */
export function computeCreateRange(
  startHit: HitResult,
  endHit: HitResult,
): CreateRange {
  const startMinute = Math.min(startHit.minute, endHit.minute);
  const endMinute = Math.max(startHit.minute, endHit.minute);
  return {
    day: endHit.day,
    startMinute,
    endMinute,
  };
}
