// Ported from FullCalendar v6.1.21 (MIT)
// Copyright (c) 2021 Adam Shaw
// See LICENSE.md in this directory.

import type { Span, SegEntry } from "./types";

export function insertAt<T>(arr: T[], index: number, item: T): void {
  arr.splice(index, 0, item);
}

/**
 * Binary search within a sorted array. Returns [index, matchFlag]:
 * - matchFlag=1 if an exact match was found at index
 * - matchFlag=0 if no exact match; index is the insertion point
 */
export function binarySearch<T>(
  a: T[],
  searchVal: number,
  getItemVal: (item: T) => number
): [number, 0 | 1] {
  let startIndex = 0;
  let endIndex = a.length;

  if (!endIndex || searchVal < getItemVal(a[startIndex])) {
    return [0, 0];
  }
  if (searchVal > getItemVal(a[endIndex - 1])) {
    return [endIndex, 0];
  }

  while (startIndex < endIndex) {
    const middleIndex = Math.floor(
      startIndex + (endIndex - startIndex) / 2
    );
    const middleVal = getItemVal(a[middleIndex]);

    if (searchVal < middleVal) {
      endIndex = middleIndex;
    } else if (searchVal > middleVal) {
      startIndex = middleIndex + 1;
    } else {
      return [middleIndex, 1];
    }
  }

  return [startIndex, 0];
}

export function intersectSpans(span0: Span, span1: Span): Span | null {
  const start = Math.max(span0.start, span1.start);
  const end = Math.min(span0.end, span1.end);
  if (start < end) {
    return { start, end };
  }
  return null;
}

export function joinSpans(span0: Span, span1: Span): Span {
  return {
    start: Math.min(span0.start, span1.start),
    end: Math.max(span0.end, span1.end),
  };
}

export function getEntrySpanEnd(entry: SegEntry): number {
  return entry.span.end;
}

export function buildEntryKey(entry: SegEntry): string {
  return entry.index + ":" + entry.span.start;
}
