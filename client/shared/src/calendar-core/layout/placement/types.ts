// Ported from FullCalendar v6.1.21 (MIT)
// Copyright (c) 2021 Adam Shaw
// See LICENSE.md in this directory.

/** A numeric span with inclusive start and exclusive end. */
export interface Span {
  start: number;
  end: number;
}

/** An input segment fed to the hierarchy. */
export interface SegEntry {
  index: number;
  thickness: number;
  span: Span;
}

/** A segment after placement, with its assigned position. */
export interface SegRect extends SegEntry {
  levelCoord: number;
  stackDepth: number;
  stackForward: number;
}

/** A group of overlapping hidden entries. */
export interface HiddenGroup {
  span: Span;
  entries: SegEntry[];
}

/** A node in the hierarchy web, linking to children in the next level. */
export interface WebNode extends SegEntry {
  nextLevelNodes: WebNode[];
}

/** Range of lateral entries within a single level. */
export interface SiblingRange {
  level: number;
  lateralStart: number;
  lateralEnd: number;
}

/** The result of finding where to insert a new entry. */
export interface InsertionPoint {
  touchingLevel: number;
  touchingLateral: number;
  touchingEntry: SegEntry | null;
  stackCnt: number;
  levelCoord: number;
  level: number;
  lateral: number;
}

/** Output of the full placement pipeline. */
export interface PositioningResult {
  segRects: SegRect[];
  hiddenGroups: HiddenGroup[];
}
