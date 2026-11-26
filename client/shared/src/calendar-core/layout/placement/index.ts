export type {
  Span,
  SegEntry,
  SegRect,
  HiddenGroup,
  PositioningResult,
} from "./types";
export { SegHierarchy, groupIntersectingEntries } from "./segHierarchy";
export {
  binarySearch,
  insertAt,
  intersectSpans,
  joinSpans,
} from "./utils";
export { buildPositioning } from "./web";
export {
  computeSegVCoords,
  computeFgSegPlacements,
  type DaySegment,
  type SegVCoord,
  type SegPlacement,
  type FgSegPlacementResult,
} from "./placement";
