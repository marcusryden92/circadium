/**
 * Parity tests: our ported placement produces the same left/width fractions
 * as FullCalendar v6.1.21. Expected values in fixtures.json were generated
 * by driving FullCalendar's own internals (see generateFixtures.ts).
 *
 * To regenerate after modifying scenarios:
 *   npx tsx src/__tests__/calendar-core/layout/placement/generateFixtures.ts
 */

import { buildPositioning } from "../../../../calendar-core/layout/placement/web";
import type { SegEntry } from "../../../../calendar-core/layout/placement/types";
import fixtures from "./fixtures.json";

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

const TOLERANCE = 1e-8;

describe("placement parity with FullCalendar v6.1.21", () => {
  for (const scenario of fixtures as FixtureScenario[]) {
    it(scenario.name, () => {
      const { segRects, hiddenGroups } = buildPositioning(
        scenario.inputs,
        scenario.strictOrder ?? null,
        null
      );

      const hiddenCount = hiddenGroups.reduce(
        (n, g) => n + g.entries.length,
        0
      );
      expect(hiddenCount).toBe(scenario.hiddenCount);

      expect(segRects.length).toBe(scenario.expected.length);

      const sortedActual = [...segRects].sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index;
        return a.span.start - b.span.start;
      });
      const sortedExpected = [...scenario.expected].sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index;
        return a.spanStart - b.spanStart;
      });

      for (let i = 0; i < sortedExpected.length; i++) {
        const actual = sortedActual[i];
        const expected = sortedExpected[i];

        expect(actual.index).toBe(expected.index);
        expect(actual.span.start).toBe(expected.spanStart);
        expect(actual.span.end).toBe(expected.spanEnd);
        expect(actual.levelCoord).toBeCloseTo(
          expected.levelCoord,
          TOLERANCE
        );
        expect(actual.thickness).toBeCloseTo(
          expected.thickness,
          TOLERANCE
        );
      }
    });
  }
});
