// Ported from FullCalendar v6.1.21 (MIT)
// Copyright (c) 2021 Adam Shaw
// See LICENSE.md in this directory.
//
// timegrid/internal.js L507-643: buildPositioning, buildWeb, buildNodes,
// findNextLevelSegs, stretchWeb, webToRects, cacheable.
// Outputs {levelCoord, thickness} as 0-1 fractions = CSS left/width.

import type {
  SegEntry,
  SegRect,
  WebNode,
  SiblingRange,
  PositioningResult,
} from "./types";
import { SegHierarchy, groupIntersectingEntries } from "./segHierarchy";
import { binarySearch, getEntrySpanEnd, buildEntryKey } from "./utils";

function cacheable<Args extends unknown[], R>(
  keyFunc: (...args: Args) => string,
  workFunc: (...args: Args) => R
): (...args: Args) => R {
  const cache: Record<string, R> = {};
  return (...args: Args) => {
    const key = keyFunc(...args);
    return key in cache ? cache[key] : (cache[key] = workFunc(...args));
  };
}

export function buildPositioning(
  segInputs: SegEntry[],
  strictOrder?: boolean | null,
  maxStackCnt?: number | null
): PositioningResult {
  const hierarchy = new SegHierarchy();
  if (strictOrder != null) {
    hierarchy.strictOrder = strictOrder;
  }
  if (maxStackCnt != null) {
    hierarchy.maxStackCnt = maxStackCnt;
  }

  const hiddenEntries = hierarchy.addSegs(segInputs);
  const hiddenGroups = groupIntersectingEntries(hiddenEntries);
  let web = buildWeb(hierarchy);
  web = stretchWeb(web, 1);
  const segRects = webToRects(web);
  return { segRects, hiddenGroups };
}

function buildWeb(hierarchy: SegHierarchy): WebNode[] {
  const { entriesByLevel } = hierarchy;

  const buildNode = cacheable(
    (level: number, lateral: number) => level + ":" + lateral,
    (level: number, lateral: number): [WebNode, number] => {
      const siblingRange = findNextLevelSegs(hierarchy, level, lateral);
      const nextLevelRes = buildNodes(siblingRange, buildNode);
      const entry = entriesByLevel[level][lateral];
      return [
        { ...entry, nextLevelNodes: nextLevelRes[0] },
        entry.thickness + nextLevelRes[1],
      ];
    }
  );

  return buildNodes(
    entriesByLevel.length
      ? {
          level: 0,
          lateralStart: 0,
          lateralEnd: entriesByLevel[0].length,
        }
      : null,
    buildNode
  )[0];
}

function buildNodes(
  siblingRange: SiblingRange | null,
  buildNode: (level: number, lateral: number) => [WebNode, number]
): [WebNode[], number] {
  if (!siblingRange) {
    return [[], 0];
  }

  const { level, lateralStart, lateralEnd } = siblingRange;
  let lateral = lateralStart;
  const pairs: [WebNode, number][] = [];

  while (lateral < lateralEnd) {
    pairs.push(buildNode(level, lateral));
    lateral += 1;
  }

  pairs.sort((a, b) => b[1] - a[1]);

  return [pairs.map((p) => p[0]), pairs[0][1]];
}

function findNextLevelSegs(
  hierarchy: SegHierarchy,
  subjectLevel: number,
  subjectLateral: number
): SiblingRange | null {
  const { levelCoords, entriesByLevel } = hierarchy;
  const subjectEntry = entriesByLevel[subjectLevel][subjectLateral];
  const afterSubject =
    levelCoords[subjectLevel] + subjectEntry.thickness;
  const levelCnt = levelCoords.length;
  let level = subjectLevel;

  for (; level < levelCnt && levelCoords[level] < afterSubject; level += 1);

  for (; level < levelCnt; level += 1) {
    const entries = entriesByLevel[level];
    const searchIndex = binarySearch(
      entries,
      subjectEntry.span.start,
      getEntrySpanEnd
    );
    const lateralStart = searchIndex[0] + searchIndex[1];
    let lateralEnd = lateralStart;

    let entry: SegEntry | undefined;
    while (
      (entry = entries[lateralEnd]) &&
      entry.span.start < subjectEntry.span.end
    ) {
      lateralEnd += 1;
    }

    if (lateralStart < lateralEnd) {
      return { level, lateralStart, lateralEnd };
    }
  }

  return null;
}

function stretchWeb(
  topLevelNodes: WebNode[],
  totalThickness: number
): WebNode[] {
  const stretchNode = cacheable(
    (node: WebNode, _startCoord: number, _prevThickness: number) =>
      buildEntryKey(node),
    (
      node: WebNode,
      startCoord: number,
      prevThickness: number
    ): [number, WebNode] => {
      const { nextLevelNodes, thickness } = node;
      const allThickness = thickness + prevThickness;
      const thicknessFraction = thickness / allThickness;
      let endCoord: number | undefined;
      const newChildren: WebNode[] = [];

      if (!nextLevelNodes.length) {
        endCoord = totalThickness;
      } else {
        for (const childNode of nextLevelNodes) {
          if (endCoord === undefined) {
            const res = stretchNode(childNode, startCoord, allThickness);
            endCoord = res[0];
            newChildren.push(res[1]);
          } else {
            const res = stretchNode(childNode, endCoord, 0);
            newChildren.push(res[1]);
          }
        }
      }

      const newThickness = (endCoord! - startCoord) * thicknessFraction;
      return [
        endCoord! - newThickness,
        { ...node, thickness: newThickness, nextLevelNodes: newChildren },
      ];
    }
  );

  return topLevelNodes.map((node) => stretchNode(node, 0, 0)[1]);
}

function webToRects(topLevelNodes: WebNode[]): SegRect[] {
  const rects: SegRect[] = [];

  const processNode = cacheable(
    (node: WebNode, _levelCoord: number, _stackDepth: number) =>
      buildEntryKey(node),
    (node: WebNode, levelCoord: number, stackDepth: number): number => {
      const rect: SegRect = {
        ...node,
        levelCoord,
        stackDepth,
        stackForward: 0,
      };
      rects.push(rect);
      return (rect.stackForward =
        processNodes(
          node.nextLevelNodes,
          levelCoord + node.thickness,
          stackDepth + 1
        ) + 1);
    }
  );

  function processNodes(
    nodes: WebNode[],
    levelCoord: number,
    stackDepth: number
  ): number {
    let stackForward = 0;
    for (const node of nodes) {
      stackForward = Math.max(
        processNode(node, levelCoord, stackDepth),
        stackForward
      );
    }
    return stackForward;
  }

  processNodes(topLevelNodes, 0, 0);
  return rects;
}
