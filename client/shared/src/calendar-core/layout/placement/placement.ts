// Rewritten from FullCalendar v6.1.21 (MIT)
// Copyright (c) 2021 Adam Shaw
// See LICENSE.md in this directory.
//
// timegrid/internal.js L645-690: computeSegVCoords + computeFgSegPlacements.
// Rewritten: FullCalendar measures DOM slat elements; we compute from
// hourHeight so this works without a DOM (React Native, SSR, tests).

import type { SegEntry, SegRect, PositioningResult } from "./types";
import { buildPositioning } from "./web";

export interface DaySegment {
  /** Minutes from midnight at column start. */
  startMinutes: number;
  /** Minutes from midnight at column start. */
  endMinutes: number;
}

export interface SegVCoord {
  start: number;
  end: number;
}

export interface SegPlacement<S> {
  seg: S;
  rect: SegRect | null;
}

export interface FgSegPlacementResult<S> {
  segPlacements: SegPlacement<S>[];
  hiddenGroups: PositioningResult["hiddenGroups"];
}

/**
 * Compute vertical pixel coordinates for each segment within a day column.
 * Pure arithmetic from hourHeight -- no DOM measurement.
 */
export function computeSegVCoords(
  segs: DaySegment[],
  hourHeight: number,
  eventMinHeight = 0
): SegVCoord[] {
  const minuteHeight = hourHeight / 60;
  return segs.map((seg) => {
    const top = seg.startMinutes * minuteHeight;
    const bottom = Math.max(
      top + eventMinHeight,
      seg.endMinutes * minuteHeight
    );
    return {
      start: Math.round(top),
      end: Math.round(bottom),
    };
  });
}

/**
 * Full placement pipeline: vertical coords from hourHeight, then horizontal
 * overlap placement. The comparator parameter replaces FullCalendar's
 * hardcoded '-duration,start' event ordering.
 *
 * @param segs        - segments to place (must already be sorted by the caller's comparator)
 * @param hourHeight  - pixels per hour
 * @param eventOrderStrict - passed through to SegHierarchy.strictOrder
 * @param eventMaxStack    - passed through to SegHierarchy.maxStackCnt
 * @param eventMinHeight   - minimum pixel height for a segment
 */
export function computeFgSegPlacements<S extends DaySegment>(
  segs: S[],
  hourHeight: number,
  eventOrderStrict?: boolean | null,
  eventMaxStack?: number | null,
  eventMinHeight = 0
): FgSegPlacementResult<S> {
  const vcoords = computeSegVCoords(segs, hourHeight, eventMinHeight);
  const segInputs: SegEntry[] = [];
  const dumbSegs: S[] = [];

  for (let i = 0; i < segs.length; i += 1) {
    const vc = vcoords[i];
    if (vc && vc.start !== vc.end) {
      segInputs.push({
        index: i,
        thickness: 1,
        span: vc,
      });
    } else {
      dumbSegs.push(segs[i]);
    }
  }

  const { segRects, hiddenGroups } = buildPositioning(
    segInputs,
    eventOrderStrict,
    eventMaxStack
  );

  const segPlacements: SegPlacement<S>[] = [];
  for (const segRect of segRects) {
    segPlacements.push({
      seg: segs[segRect.index],
      rect: segRect,
    });
  }
  for (const dumbSeg of dumbSegs) {
    segPlacements.push({ seg: dumbSeg, rect: null });
  }

  return { segPlacements, hiddenGroups };
}
