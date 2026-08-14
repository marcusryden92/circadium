/**
 * Interval Utilities
 *
 * Efficient operations on time intervals for scheduling.
 * Uses interval tree concepts for O(log n) lookups.
 */

import { SimpleEvent } from "@/types/prisma";
import { AvailableSlot } from "../models/TimeSlot";
import { plannerIdFromEventId, occurrenceKey } from "@/utils/planRecurrence";

export interface OccupiedInterval {
  start: Date;
  end: Date;
  startLocationId: string | null;
  endLocationId: string | null;
}

/**
 * Merge overlapping intervals into non-overlapping ranges
 * Useful for consolidating occupied time blocks
 */
export function mergeIntervals(
  intervals: OccupiedInterval[],
): OccupiedInterval[] {
  if (intervals.length === 0) return [];

  // Sort by start time
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const merged: OccupiedInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    const accumulator = merged[merged.length - 1];

    if (candidate.start <= accumulator.end) {
      if (candidate.end.getTime() > accumulator.end.getTime()) {
        accumulator.end = candidate.end;
        accumulator.endLocationId = candidate.endLocationId ?? null;
      }
    } else {
      merged.push({ ...candidate });
    }
  }

  return merged;
}

/**
 * Represents a location transition between adjacent events that may require travel
 */
export interface LocationTransition {
  /** End time of the first event */
  fromEventEnd: Date;
  /** Start time of the second event */
  toEventStart: Date;
  /** Location of the first event */
  fromLocationId: string | null;
  /** Location of the second event */
  toLocationId: string | null;
  /** Gap in minutes (negative if events overlap) */
  gapMinutes: number;
  /** True if events overlap or touch exactly */
  isTrespassing: boolean;
}

/**
 * Find all location transitions between adjacent events with different locations
 * This includes overlapping events (trespassing) and events with insufficient gaps
 * Does NOT merge intervals, so overlaps are preserved
 */
export function findLocationTransitions(
  intervals: OccupiedInterval[],
): LocationTransition[] {
  if (intervals.length <= 1) return [];

  // Sort by start time
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const transitions: LocationTransition[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // Only create transitions when locations differ
    // Skip if either location is null ("everywhere" - no travel needed)
    if (
      current.endLocationId &&
      next.startLocationId &&
      current.endLocationId !== next.startLocationId
    ) {
      const gapMs = next.start.getTime() - current.end.getTime();
      const gapMinutes = Math.floor(gapMs / 60000);

      transitions.push({
        fromEventEnd: current.end,
        toEventStart: next.start,
        fromLocationId: current.endLocationId,
        toLocationId: next.startLocationId,
        gapMinutes,
        isTrespassing: gapMinutes <= 0,
      });
    }
  }

  return transitions;
}

/**
 * Extended interval with optional event ID for tracking
 */
export interface IntervalWithId extends OccupiedInterval {
  eventId?: string;
}

/**
 * Trespassing info for an event - which borders should be red
 */
export interface TrespassingInfo {
  eventId: string;
  /** True if the event's start border should be red (overlaps at start) */
  trespassingStart: boolean;
  /** True if the event's end border should be red (overlaps at end) */
  trespassingEnd: boolean;
}

/**
 * One overlapping different-location pair, `a` sorted before `b`.
 * Feeds the LOCATION_OVERLAP engine message alongside the border flags.
 */
export interface OverlapPair {
  a: IntervalWithId;
  b: IntervalWithId;
  overlapStart: Date;
}

/**
 * Detect trespassing (overlapping) events with different locations.
 * Returns border info per event id plus the raw overlapping pairs.
 *
 * Border rules:
 * - Event A ends after Event B starts (A infringes on B): A gets red BOTTOM border
 * - Event B nested inside Event A: B gets BOTH red top AND bottom borders
 * - Start times equal: Both events get red TOP border
 * - End times equal: Both events get red BOTTOM border
 */
export function detectTrespassingEvents(intervals: IntervalWithId[]): {
  borders: Map<string, TrespassingInfo>;
  pairs: OverlapPair[];
} {
  const trespassingMap = new Map<string, TrespassingInfo>();
  const pairs: OverlapPair[] = [];

  if (intervals.length <= 1) return { borders: trespassingMap, pairs };

  // Helper to get or create trespassing info for an event
  const getOrCreate = (eventId: string): TrespassingInfo => {
    if (!trespassingMap.has(eventId)) {
      trespassingMap.set(eventId, {
        eventId,
        trespassingStart: false,
        trespassingEnd: false,
      });
    }
    return trespassingMap.get(eventId)!;
  };

  // Sort by start time, then by end time (longer events first for same start)
  const sorted = [...intervals].sort((a, b) => {
    const startDiff = a.start.getTime() - b.start.getTime();
    if (startDiff !== 0) return startDiff;
    // For same start time, put longer events first
    return b.end.getTime() - a.end.getTime();
  });

  // Check each pair of events for overlaps with different locations
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const eventA = sorted[i];
      const eventB = sorted[j];

      // Skip if no event IDs (can't track)
      if (!eventA.eventId || !eventB.eventId) continue;

      // Skip if same location or either is null ("everywhere")
      if (
        !eventA.startLocationId ||
        !eventB.startLocationId ||
        eventA.startLocationId === eventB.startLocationId
      ) {
        continue;
      }

      const aStart = eventA.start.getTime();
      const aEnd = eventA.end.getTime();
      const bStart = eventB.start.getTime();
      const bEnd = eventB.end.getTime();

      // Touching exactly is not an overlap — only a real intersection counts.
      if (bStart < aEnd && aStart < bEnd) {
        pairs.push({
          a: eventA,
          b: eventB,
          overlapStart: new Date(Math.max(aStart, bStart)),
        });
      }

      // Check for overlaps
      const startsEqual = aStart === bStart;
      const endsEqual = aEnd === bEnd;
      const aContainsB = aStart <= bStart && aEnd >= bEnd;
      const bStartsDuringA = bStart < aEnd && bStart > aStart;
      const aEndsDuringB = aEnd > bStart && aEnd < bEnd;

      // Case: Start times equal - both get red START border
      if (startsEqual) {
        getOrCreate(eventA.eventId).trespassingStart = true;
        getOrCreate(eventB.eventId).trespassingStart = true;
      }

      // Case: End times equal - both get red END border
      if (endsEqual) {
        getOrCreate(eventA.eventId).trespassingEnd = true;
        getOrCreate(eventB.eventId).trespassingEnd = true;
      }

      // Case: B is nested inside A (A contains B completely)
      // B gets both red borders (if not already handled by equal start/end)
      if (aContainsB && !startsEqual && !endsEqual) {
        getOrCreate(eventB.eventId).trespassingStart = true;
        getOrCreate(eventB.eventId).trespassingEnd = true;
      }

      // Case: A ends during B (A infringes on B) - A gets red END border
      // (but not if it's a nesting case already handled)
      if (aEndsDuringB && !startsEqual) {
        getOrCreate(eventA.eventId).trespassingEnd = true;
      }

      // Case: B starts during A (A infringes on B from before)
      // Same as above but checking from B's perspective
      if (bStartsDuringA && !aContainsB) {
        getOrCreate(eventA.eventId).trespassingEnd = true;
      }
    }
  }

  return { borders: trespassingMap, pairs };
}

/**
 * Find gaps between occupied intervals
 * Returns available time slots with location context from adjacent events
 */
export function findGaps(
  occupiedIntervals: OccupiedInterval[],
  rangeStart: Date,
  rangeEnd: Date,
  startingLocation: string | null = null,
): AvailableSlot[] {
  if (occupiedIntervals.length === 0) {
    const durationMinutes = Math.floor(
      (rangeEnd.getTime() - rangeStart.getTime()) / 60000,
    );
    return [
      {
        start: rangeStart,
        end: rangeEnd,
        durationMinutes,
        type: "available",
        prevLocationId: startingLocation,
        nextLocationId: null,
      },
    ];
  }

  const merged = mergeIntervals(occupiedIntervals);
  const gaps: AvailableSlot[] = [];

  // Check if there is a time gap between now() and the first interval
  // - if so, make it a free slot
  if (merged[0].start > rangeStart) {
    const end = merged[0].start;
    gaps.push({
      start: rangeStart,
      end,
      durationMinutes: Math.floor(
        (end.getTime() - rangeStart.getTime()) / 60000,
      ),
      type: "available",
      prevLocationId: startingLocation,
      nextLocationId: merged[0].startLocationId,
    });
  }

  for (let i = 0; i < merged.length - 1; i++) {
    // Make sure that the slot doens't begin before,
    // or extend past the time range
    const gapStart = new Date(
      Math.max(merged[i].end.getTime(), rangeStart.getTime()),
    );
    const gapEnd = new Date(
      Math.min(merged[i + 1].start.getTime(), rangeEnd.getTime()),
    );

    if (gapStart < gapEnd) {
      gaps.push({
        start: gapStart,
        end: gapEnd,
        durationMinutes: Math.floor(
          (gapEnd.getTime() - gapStart.getTime()) / 60000,
        ),
        type: "available",
        prevLocationId: merged[i].endLocationId,
        nextLocationId: merged[i + 1].startLocationId,
      });
    }
  }

  const lastInterval = merged[merged.length - 1];
  if (lastInterval.end < rangeEnd) {
    gaps.push({
      start: lastInterval.end,
      end: rangeEnd,
      durationMinutes: Math.floor(
        (rangeEnd.getTime() - lastInterval.end.getTime()) / 60000,
      ),
      type: "available",
      prevLocationId: lastInterval.endLocationId,
      nextLocationId: null,
    });
  }

  return gaps;
}

/**
 * Convert SimpleEvents to Intervals
 * @param events - Events to convert
 * @param plannerLocationMap - Optional map of planner/event ID to location ID
 */
export function eventsToIntervals(
  events: SimpleEvent[],
  plannerLocationMap?: Map<string, string | null>,
): OccupiedInterval[] {
  return events.map((event) => {
    const locationId =
      plannerLocationMap?.get(plannerIdFromEventId(event.id)) ?? null;
    return {
      start: new Date(event.start),
      end: new Date(event.end),
      startLocationId: locationId,
      endLocationId: locationId,
    };
  });
}

/**
 * Check if an interval can fit within a gap
 */
export function canFitInGap(
  gap: OccupiedInterval,
  durationMinutes: number,
  afterTime?: Date,
): boolean {
  const startTime = afterTime && afterTime > gap.start ? afterTime : gap.start;
  const availableMs = gap.end.getTime() - startTime.getTime();
  const requiredMs = durationMinutes * 60 * 1000;
  return availableMs >= requiredMs;
}

/**
 * Find the first gap that can fit a duration
 */
export function findFirstFittingGap(
  gaps: OccupiedInterval[],
  durationMinutes: number,
  afterTime?: Date,
): OccupiedInterval | null {
  for (const gap of gaps) {
    if (canFitInGap(gap, durationMinutes, afterTime)) {
      return gap;
    }
  }
  return null;
}

/**
 * Calculate total available minutes in gaps
 */
export function totalAvailableMinutes(gaps: OccupiedInterval[]): number {
  return gaps.reduce((total, gap) => {
    const minutes = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
    return total + minutes;
  }, 0);
}

/**
 * Find all gaps within a specific day
 */
export function findDailyGaps(
  date: Date,
  occupiedIntervals: OccupiedInterval[],
): AvailableSlot[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Filter intervals that fall within this day
  const dailyIntervals = occupiedIntervals.filter(
    (interval) => interval.start < dayEnd && interval.end > dayStart,
  );

  return findGaps(dailyIntervals, dayStart, dayEnd);
}

/**
 * Get the largest gap in a set of intervals
 */
export function getLargestGap(
  gaps: OccupiedInterval[],
): OccupiedInterval | null {
  if (gaps.length === 0) return null;

  return gaps.reduce((largest, current) => {
    const currentSize = current.end.getTime() - current.start.getTime();
    const largestSize = largest.end.getTime() - largest.start.getTime();
    return currentSize > largestSize ? current : largest;
  });
}

/**
 * Calculate the size of the largest gap in minutes
 */
export function getLargestGapMinutes(gaps: OccupiedInterval[]): number {
  const largest = getLargestGap(gaps);
  if (!largest) return 0;
  return (largest.end.getTime() - largest.start.getTime()) / (1000 * 60);
}

import type { PerTemplateMask } from "../models/TemplateModels";
export type { PerTemplateMask };

/**
 * Convert PerTemplateMasks to Intervals over a date range.
 *
 * Per-occurrence recurrence exceptions (moved/deleted, keyed by the
 * occurrence's original local start) are applied here: any exception vacates
 * its original weekly slot, and each moved occurrence is emitted at its
 * override start (same duration) by the range that CONTAINS that override.
 * Emission cannot key off the original day's range membership — the override
 * can land in a range that never iterates the original day (an occurrence
 * dragged out of the past, or across a horizon-chunk seam), and the chunk
 * that iterates the original day may not contain the override.
 */
export function masksToIntervals(
  masks: PerTemplateMask[],
  startDate: Date,
  endDate: Date,
): OccupiedInterval[] {
  const intervals: OccupiedInterval[] = [];
  const msPerDay = 24 * 60 * 60 * 1000;
  const numDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / msPerDay,
  );

  // Look back a full week so the most recent occurrence of every weekly mask is
  // generated regardless of its length — including one that started on an
  // earlier day and is still running at startDate (last night's sleep this
  // morning, or a multi-day block we're currently inside). We don't infer how
  // far back to look from any template's duration; we generate the candidates
  // and keep the ones that actually overlap the range below.
  const DAYS_PER_WEEK = 7;

  for (let i = -DAYS_PER_WEEK; i < numDays; i++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(dayStart.getDate() + i);
    dayStart.setHours(0, 0, 0, 0);
    const dayOfWeek = dayStart.getDay();

    for (const mask of masks) {
      if (mask.dayOfWeek !== dayOfWeek) continue;

      const start = new Date(dayStart);
      start.setHours(
        Math.floor(mask.startMinutes / 60),
        mask.startMinutes % 60,
        0,
        0,
      );

      if (mask.recurrenceExceptions?.length) {
        const key = occurrenceKey(start);
        if (mask.recurrenceExceptions.some((e) => e.key === key)) continue;
      }

      const endDayOffset = Math.floor(mask.endMinutes / 1440);
      const endTimeMinutes = mask.endMinutes % 1440;
      const end = new Date(dayStart);
      end.setDate(end.getDate() + endDayOffset);
      end.setHours(Math.floor(endTimeMinutes / 60), endTimeMinutes % 60, 0, 0);

      intervals.push({
        start,
        end,
        startLocationId: mask.locationId ?? null,
        endLocationId: mask.locationId ?? null,
      });
    }
  }

  for (const mask of masks) {
    if (!mask.recurrenceExceptions?.length) continue;
    const seriesDurationMs = (mask.endMinutes - mask.startMinutes) * 60000;
    for (const exception of mask.recurrenceExceptions) {
      if (exception.type !== "moved") continue;
      const start = new Date(exception.newStart);
      if (start < startDate || start >= endDate) continue;
      const durationMs =
        exception.durationMinutes !== undefined
          ? exception.durationMinutes * 60000
          : seriesDurationMs;
      intervals.push({
        start,
        end: new Date(start.getTime() + durationMs),
        startLocationId: mask.locationId ?? null,
        endLocationId: mask.locationId ?? null,
      });
    }
  }

  // Keep only occurrences that actually overlap [startDate, endDate): an
  // occurrence is relevant iff we're currently inside it (start before, end
  // after startDate) or it begins within the range. This is the real test that
  // catches a straddling block; the week-long look-back above just guarantees
  // such a block was generated in the first place.
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  return intervals.filter(
    (interval) =>
      interval.end.getTime() > startMs && interval.start.getTime() < endMs,
  );
}
