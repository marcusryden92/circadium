/**
 * One-off script that drives FullCalendar's own placement internals to
 * produce expected left/width fractions. Run with:
 *
 *   npx tsx src/__tests__/calendar-core/layout/placement/generateFixtures.ts
 *
 * The output is written to fixtures.json beside this file. That committed
 * file is the source of truth for parity tests -- it must outlive
 * FullCalendar's removal in C.6.
 *
 * This file imports from node_modules/@fullcalendar and should NOT be
 * included in the production build or CI test suite (it is under __tests__
 * but is a script, not a .test.ts).
 */

// FullCalendar v6.1.21 internal exports
// @ts-expect-error -- untyped internal module
import { SegHierarchy, groupIntersectingEntries, binarySearch, insertAt } from "@fullcalendar/core/internal";

type SegEntry = { index: number; thickness: number; span: { start: number; end: number } };
type WebNode = SegEntry & { nextLevelNodes: WebNode[] };
type SegRect = SegEntry & { levelCoord: number; stackDepth: number; stackForward: number };

function buildEntryKey(entry: SegEntry): string {
  return entry.index + ":" + entry.span.start;
}

function getEntrySpanEnd(entry: SegEntry): number {
  return entry.span.end;
}

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

function findNextLevelSegs(
  hierarchy: any,
  subjectLevel: number,
  subjectLateral: number
): { level: number; lateralStart: number; lateralEnd: number } | null {
  const { levelCoords, entriesByLevel } = hierarchy;
  const subjectEntry = entriesByLevel[subjectLevel][subjectLateral];
  const afterSubject = levelCoords[subjectLevel] + subjectEntry.thickness;
  const levelCnt = levelCoords.length;
  let level = subjectLevel;
  for (; level < levelCnt && levelCoords[level] < afterSubject; level += 1);
  for (; level < levelCnt; level += 1) {
    const entries = entriesByLevel[level];
    const searchIndex = binarySearch(entries, subjectEntry.span.start, getEntrySpanEnd);
    const lateralStart = searchIndex[0] + searchIndex[1];
    let lateralEnd = lateralStart;
    while (entries[lateralEnd] && entries[lateralEnd].span.start < subjectEntry.span.end) {
      lateralEnd += 1;
    }
    if (lateralStart < lateralEnd) {
      return { level, lateralStart, lateralEnd };
    }
  }
  return null;
}

function buildWeb(hierarchy: any): WebNode[] {
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
      ? { level: 0, lateralStart: 0, lateralEnd: entriesByLevel[0].length }
      : null,
    buildNode
  )[0];
}

function buildNodes(
  siblingRange: { level: number; lateralStart: number; lateralEnd: number } | null,
  buildNode: (level: number, lateral: number) => [WebNode, number]
): [WebNode[], number] {
  if (!siblingRange) return [[], 0];
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

function stretchWeb(topLevelNodes: WebNode[], totalThickness: number): WebNode[] {
  const stretchNode = cacheable(
    (node: WebNode, _startCoord: number, _prevThickness: number) => buildEntryKey(node),
    (node: WebNode, startCoord: number, prevThickness: number): [number, WebNode] => {
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
      return [endCoord! - newThickness, { ...node, thickness: newThickness, nextLevelNodes: newChildren }];
    }
  );
  return topLevelNodes.map((node) => stretchNode(node, 0, 0)[1]);
}

function webToRects(topLevelNodes: WebNode[]): SegRect[] {
  const rects: SegRect[] = [];
  const processNode = cacheable(
    (node: WebNode, _levelCoord: number, _stackDepth: number) => buildEntryKey(node),
    (node: WebNode, levelCoord: number, stackDepth: number): number => {
      const rect: SegRect = { ...node, levelCoord, stackDepth, stackForward: 0 };
      rects.push(rect);
      return (rect.stackForward = processNodes(node.nextLevelNodes, levelCoord + node.thickness, stackDepth + 1) + 1);
    }
  );
  function processNodes(nodes: WebNode[], levelCoord: number, stackDepth: number): number {
    let stackForward = 0;
    for (const node of nodes) {
      stackForward = Math.max(processNode(node, levelCoord, stackDepth), stackForward);
    }
    return stackForward;
  }
  processNodes(topLevelNodes, 0, 0);
  return rects;
}

function runFC(inputs: SegEntry[], strictOrder?: boolean | null, maxStackCnt?: number | null) {
  const hierarchy = new SegHierarchy();
  if (strictOrder != null) hierarchy.strictOrder = strictOrder;
  if (maxStackCnt != null) hierarchy.maxStackCnt = maxStackCnt;
  const hiddenEntries = hierarchy.addSegs(inputs);
  const hiddenGroups = groupIntersectingEntries(hiddenEntries);
  let web = buildWeb(hierarchy);
  web = stretchWeb(web, 1);
  const segRects = webToRects(web);
  return { segRects, hiddenGroups };
}

interface Scenario {
  name: string;
  inputs: SegEntry[];
  strictOrder?: boolean;
}

const scenarios: Scenario[] = [
  {
    name: "no_overlap",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 100 } },
      { index: 1, thickness: 1, span: { start: 200, end: 300 } },
      { index: 2, thickness: 1, span: { start: 400, end: 500 } },
    ],
  },
  {
    name: "two_partial_overlap",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 200 } },
      { index: 1, thickness: 1, span: { start: 100, end: 300 } },
    ],
  },
  {
    name: "three_deep_nesting",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 400 } },
      { index: 1, thickness: 1, span: { start: 50, end: 350 } },
      { index: 2, thickness: 1, span: { start: 100, end: 300 } },
    ],
  },
  {
    name: "identical_start_end",
    inputs: [
      { index: 0, thickness: 1, span: { start: 100, end: 300 } },
      { index: 1, thickness: 1, span: { start: 100, end: 300 } },
      { index: 2, thickness: 1, span: { start: 100, end: 300 } },
    ],
  },
  {
    name: "dense_cluster",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 200 } },
      { index: 1, thickness: 1, span: { start: 50, end: 250 } },
      { index: 2, thickness: 1, span: { start: 100, end: 300 } },
      { index: 3, thickness: 1, span: { start: 150, end: 350 } },
      { index: 4, thickness: 1, span: { start: 200, end: 400 } },
      { index: 5, thickness: 1, span: { start: 250, end: 450 } },
    ],
  },
  {
    name: "zero_duration",
    inputs: [
      { index: 0, thickness: 1, span: { start: 100, end: 100 } },
      { index: 1, thickness: 1, span: { start: 100, end: 200 } },
    ],
  },
  {
    name: "back_to_back",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 100 } },
      { index: 1, thickness: 1, span: { start: 100, end: 200 } },
      { index: 2, thickness: 1, span: { start: 200, end: 300 } },
    ],
  },
  {
    name: "overnight_split_segment",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 180 } },
      { index: 1, thickness: 1, span: { start: 60, end: 240 } },
      { index: 2, thickness: 1, span: { start: 120, end: 180 } },
    ],
  },
  {
    name: "strict_order",
    inputs: [
      { index: 0, thickness: 1, span: { start: 0, end: 200 } },
      { index: 1, thickness: 1, span: { start: 100, end: 300 } },
      { index: 2, thickness: 1, span: { start: 50, end: 150 } },
    ],
    strictOrder: true,
  },
];

interface FixtureRect {
  index: number;
  levelCoord: number;
  thickness: number;
  spanStart: number;
  spanEnd: number;
}

interface FixtureScenario {
  name: string;
  inputs: SegEntry[];
  strictOrder?: boolean;
  expected: FixtureRect[];
  hiddenCount: number;
}

const fixtures: FixtureScenario[] = scenarios.map((s) => {
  const { segRects, hiddenGroups } = runFC(s.inputs, s.strictOrder ?? null);
  const expected: FixtureRect[] = segRects.map((r) => ({
    index: r.index,
    levelCoord: parseFloat(r.levelCoord.toFixed(10)),
    thickness: parseFloat(r.thickness.toFixed(10)),
    spanStart: r.span.start,
    spanEnd: r.span.end,
  }));
  const hiddenCount = hiddenGroups.reduce((n, g) => n + g.entries.length, 0);
  return {
    name: s.name,
    inputs: s.inputs,
    ...(s.strictOrder ? { strictOrder: true } : {}),
    expected,
    hiddenCount,
  };
});

const fs = require("fs");
const path = require("path");
const outPath = path.join(__dirname, "fixtures.json");
fs.writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + "\n");
console.log(`Wrote ${fixtures.length} scenarios to ${outPath}`);
