// Ported from FullCalendar v6.1.21 (MIT)
// Copyright (c) 2021 Adam Shaw
// See LICENSE.md in this directory.
//
// core/internal-common.js ~L5901-6059: SegHierarchy class.
// Assigns entries to levels by their numeric span, stacking overlapping
// entries and tracking stack depth.

import type {
  SegEntry,
  SegRect,
  InsertionPoint,
  HiddenGroup,
} from "./types";
import {
  insertAt,
  binarySearch,
  intersectSpans,
  joinSpans,
  getEntrySpanEnd,
  buildEntryKey,
} from "./utils";

export class SegHierarchy {
  strictOrder = false;
  allowReslicing = false;
  maxCoord = -1;
  maxStackCnt = -1;

  levelCoords: number[] = [];
  entriesByLevel: SegEntry[][] = [];
  stackCnts: Record<string, number> = {};

  private getEntryThickness: (entry: SegEntry) => number;

  constructor(
    getEntryThickness: (entry: SegEntry) => number = (entry) =>
      entry.thickness || 1
  ) {
    this.getEntryThickness = getEntryThickness;
  }

  addSegs(inputs: SegEntry[]): SegEntry[] {
    const hiddenEntries: SegEntry[] = [];
    for (const input of inputs) {
      this.insertEntry(input, hiddenEntries);
    }
    return hiddenEntries;
  }

  insertEntry(entry: SegEntry, hiddenEntries: SegEntry[]): void {
    const insertion = this.findInsertion(entry);
    if (this.isInsertionValid(insertion, entry)) {
      this.insertEntryAt(entry, insertion);
    } else {
      this.handleInvalidInsertion(insertion, entry, hiddenEntries);
    }
  }

  isInsertionValid(insertion: InsertionPoint, entry: SegEntry): boolean {
    return (
      (this.maxCoord === -1 ||
        insertion.levelCoord + this.getEntryThickness(entry) <=
          this.maxCoord) &&
      (this.maxStackCnt === -1 || insertion.stackCnt < this.maxStackCnt)
    );
  }

  handleInvalidInsertion(
    insertion: InsertionPoint,
    entry: SegEntry,
    hiddenEntries: SegEntry[]
  ): void {
    if (this.allowReslicing && insertion.touchingEntry) {
      const hiddenEntry: SegEntry = {
        ...entry,
        span: intersectSpans(entry.span, insertion.touchingEntry.span)!,
      };
      hiddenEntries.push(hiddenEntry);
      this.splitEntry(entry, insertion.touchingEntry, hiddenEntries);
    } else {
      hiddenEntries.push(entry);
    }
  }

  splitEntry(
    entry: SegEntry,
    barrier: SegEntry,
    hiddenEntries: SegEntry[]
  ): void {
    const entrySpan = entry.span;
    const barrierSpan = barrier.span;

    if (entrySpan.start < barrierSpan.start) {
      this.insertEntry(
        {
          index: entry.index,
          thickness: entry.thickness,
          span: { start: entrySpan.start, end: barrierSpan.start },
        },
        hiddenEntries
      );
    }
    if (entrySpan.end > barrierSpan.end) {
      this.insertEntry(
        {
          index: entry.index,
          thickness: entry.thickness,
          span: { start: barrierSpan.end, end: entrySpan.end },
        },
        hiddenEntries
      );
    }
  }

  insertEntryAt(entry: SegEntry, insertion: InsertionPoint): void {
    const { entriesByLevel, levelCoords } = this;
    if (insertion.lateral === -1) {
      insertAt(levelCoords, insertion.level, insertion.levelCoord);
      insertAt(entriesByLevel, insertion.level, [entry]);
    } else {
      insertAt(entriesByLevel[insertion.level], insertion.lateral, entry);
    }
    this.stackCnts[buildEntryKey(entry)] = insertion.stackCnt;
  }

  findInsertion(newEntry: SegEntry): InsertionPoint {
    const { levelCoords, entriesByLevel, strictOrder, stackCnts } = this;
    const levelCnt = levelCoords.length;
    let candidateCoord = 0;
    let touchingLevel = -1;
    let touchingLateral = -1;
    let touchingEntry: SegEntry | null = null;
    let stackCnt = 0;

    for (
      let trackingLevel = 0;
      trackingLevel < levelCnt;
      trackingLevel += 1
    ) {
      const trackingCoord = levelCoords[trackingLevel];

      if (
        !strictOrder &&
        trackingCoord >=
          candidateCoord + this.getEntryThickness(newEntry)
      ) {
        break;
      }

      const trackingEntries = entriesByLevel[trackingLevel];
      let trackingEntry: SegEntry | undefined;
      const searchRes = binarySearch(
        trackingEntries,
        newEntry.span.start,
        getEntrySpanEnd
      );
      let lateralIndex = searchRes[0] + searchRes[1];

      while (
        (trackingEntry = trackingEntries[lateralIndex]) &&
        trackingEntry.span.start < newEntry.span.end
      ) {
        const trackingEntryBottom =
          trackingCoord + this.getEntryThickness(trackingEntry);

        if (trackingEntryBottom > candidateCoord) {
          candidateCoord = trackingEntryBottom;
          touchingEntry = trackingEntry;
          touchingLevel = trackingLevel;
          touchingLateral = lateralIndex;
        }

        if (trackingEntryBottom === candidateCoord) {
          stackCnt = Math.max(
            stackCnt,
            stackCnts[buildEntryKey(trackingEntry)] + 1
          );
        }

        lateralIndex += 1;
      }
    }

    let destLevel = 0;
    if (touchingEntry) {
      destLevel = touchingLevel + 1;
      while (
        destLevel < levelCnt &&
        levelCoords[destLevel] < candidateCoord
      ) {
        destLevel += 1;
      }
    }

    let destLateral = -1;
    if (
      destLevel < levelCnt &&
      levelCoords[destLevel] === candidateCoord
    ) {
      destLateral = binarySearch(
        entriesByLevel[destLevel],
        newEntry.span.end,
        getEntrySpanEnd
      )[0];
    }

    return {
      touchingLevel,
      touchingLateral,
      touchingEntry,
      stackCnt,
      levelCoord: candidateCoord,
      level: destLevel,
      lateral: destLateral,
    };
  }

  toRects(): SegRect[] {
    const { entriesByLevel, levelCoords } = this;
    const levelCnt = entriesByLevel.length;
    const rects: SegRect[] = [];

    for (let level = 0; level < levelCnt; level += 1) {
      const entries = entriesByLevel[level];
      const levelCoord = levelCoords[level];
      for (const entry of entries) {
        rects.push({
          ...entry,
          thickness: this.getEntryThickness(entry),
          levelCoord,
          stackDepth: 0,
          stackForward: 0,
        });
      }
    }
    return rects;
  }
}

export function groupIntersectingEntries(
  entries: SegEntry[]
): HiddenGroup[] {
  let merges: HiddenGroup[] = [];

  for (const entry of entries) {
    let filteredMerges: HiddenGroup[] = [];
    let hungryMerge: HiddenGroup = {
      span: entry.span,
      entries: [entry],
    };

    for (const merge of merges) {
      if (intersectSpans(merge.span, hungryMerge.span)) {
        hungryMerge = {
          entries: merge.entries.concat(hungryMerge.entries),
          span: joinSpans(merge.span, hungryMerge.span),
        };
      } else {
        filteredMerges.push(merge);
      }
    }

    filteredMerges.push(hungryMerge);
    merges = filteredMerges;
  }

  return merges;
}
