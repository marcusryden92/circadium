import { masksToIntervals } from "@/utils/calendar-generation/utils/intervalUtils";
import { getPerTemplateMasks } from "@/utils/calendar-generation/helpers/TemplateExpander/getPerTemplateMasks";
import type { PerTemplateMask } from "@/utils/calendar-generation/models/TemplateModels";
import {
  occurrenceKey,
  serializeRecurrenceExceptions,
  type PlanOccurrenceException,
} from "@/utils/planRecurrence";
import type { EventTemplate } from "@/types/prisma";

// Local Mondays: Jun 1, 8, 15 fall inside [Jun 1, Jun 22).
const RANGE_START = new Date(2026, 5, 1, 0, 0, 0, 0);
const RANGE_END = new Date(2026, 5, 22, 0, 0, 0, 0);

const KEYS = {
  jun1: occurrenceKey(new Date(2026, 5, 1, 7, 0)),
  jun8: occurrenceKey(new Date(2026, 5, 8, 7, 0)),
  jun15: occurrenceKey(new Date(2026, 5, 15, 7, 0)),
};

// Monday 07:00-09:00 (120 min) template mask.
function mondayMask(
  recurrenceExceptions?: PlanOccurrenceException[],
): PerTemplateMask {
  return {
    templateId: "tpl-1",
    dayOfWeek: 1,
    startMinutes: 7 * 60,
    endMinutes: 9 * 60,
    locationId: null,
    recurrenceExceptions,
  };
}

describe("masksToIntervals — template recurrence exceptions", () => {
  it("emits one interval per matching day when there are no exceptions", () => {
    const intervals = masksToIntervals([mondayMask()], RANGE_START, RANGE_END);
    expect(intervals.map((i) => occurrenceKey(i.start))).toEqual([
      KEYS.jun1,
      KEYS.jun8,
      KEYS.jun15,
    ]);
  });

  it("skips a deleted occurrence, leaving the others in place", () => {
    const intervals = masksToIntervals(
      [mondayMask([{ key: KEYS.jun8, type: "deleted" }])],
      RANGE_START,
      RANGE_END,
    );
    expect(intervals.map((i) => occurrenceKey(i.start))).toEqual([
      KEYS.jun1,
      KEYS.jun15,
    ]);
  });

  it("re-times a moved occurrence at its override start, preserving duration", () => {
    const newStart = new Date(2026, 5, 9, 14, 0); // moved to Tue Jun 9 14:00
    const intervals = masksToIntervals(
      [
        mondayMask([
          { key: KEYS.jun8, type: "moved", newStart: newStart.toISOString() },
        ]),
      ],
      RANGE_START,
      RANGE_END,
    );

    const moved = intervals.find(
      (i) => i.start.getTime() === newStart.getTime(),
    );
    expect(moved).toBeTruthy();
    expect(moved!.end.getTime() - moved!.start.getTime()).toBe(120 * 60000);

    const keys = intervals.map((i) => occurrenceKey(i.start));
    expect(keys).toContain(KEYS.jun1);
    expect(keys).toContain(KEYS.jun15);
    // The original Monday slot no longer appears.
    expect(keys).not.toContain(KEYS.jun8);
  });

  it("applies a per-occurrence duration override on a moved occurrence", () => {
    // Resize just this occurrence: same start (07:00), 60 min instead of 120.
    const inPlaceStart = new Date(2026, 5, 8, 7, 0);
    const intervals = masksToIntervals(
      [
        mondayMask([
          {
            key: KEYS.jun8,
            type: "moved",
            newStart: inPlaceStart.toISOString(),
            durationMinutes: 60,
          },
        ]),
      ],
      RANGE_START,
      RANGE_END,
    );

    const resized = intervals.find(
      (i) => i.start.getTime() === inPlaceStart.getTime(),
    );
    expect(resized).toBeTruthy();
    expect(resized!.end.getTime() - resized!.start.getTime()).toBe(60 * 60000);

    // Untouched Mondays keep the 120-min series length.
    const jun1 = intervals.find(
      (i) => occurrenceKey(i.start) === KEYS.jun1,
    );
    expect(jun1!.end.getTime() - jun1!.start.getTime()).toBe(120 * 60000);
  });

  it("emits a moved occurrence landing in range even when its original day is before the range", () => {
    // Range starts Tue Jun 9 — the original Mon Jun 8 slot is never iterated,
    // but the override lands inside the range and must occupy the fabric
    // (a past occurrence dragged into the future, or a chunk-seam crossing).
    const newStart = new Date(2026, 5, 10, 14, 0); // Wed Jun 10
    const intervals = masksToIntervals(
      [
        mondayMask([
          { key: KEYS.jun8, type: "moved", newStart: newStart.toISOString() },
        ]),
      ],
      new Date(2026, 5, 9, 0, 0, 0, 0),
      RANGE_END,
    );

    const moved = intervals.find(
      (i) => i.start.getTime() === newStart.getTime(),
    );
    expect(moved).toBeTruthy();
    expect(moved!.end.getTime() - moved!.start.getTime()).toBe(120 * 60000);
    expect(intervals.map((i) => occurrenceKey(i.start))).toContain(KEYS.jun15);
  });

  it("does not emit a moved occurrence whose override lands outside the range", () => {
    // The range containing the override emits it; this one only vacates the
    // original slot — emitting here too would duplicate it across chunk seams.
    const newStart = new Date(2026, 5, 24, 14, 0); // beyond RANGE_END
    const intervals = masksToIntervals(
      [
        mondayMask([
          { key: KEYS.jun8, type: "moved", newStart: newStart.toISOString() },
        ]),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(intervals.map((i) => occurrenceKey(i.start))).toEqual([
      KEYS.jun1,
      KEYS.jun15,
    ]);
  });
});

describe("getPerTemplateMasks — recurrenceExceptions parsing", () => {
  function template(recurrenceExceptions: string | null): EventTemplate {
    return {
      id: "tpl-1",
      title: "Standup",
      startDay: 1,
      startTime: "07:00",
      duration: 120,
      color: "#123456",
      locationId: null,
      recurrenceExceptions,
      userId: "u",
      createdAt: "x",
      updatedAt: "x",
    } as unknown as EventTemplate;
  }

  it("attaches parsed exceptions to the mask", () => {
    const exceptions: PlanOccurrenceException[] = [
      { key: KEYS.jun8, type: "deleted" },
    ];
    const [mask] = getPerTemplateMasks([
      template(serializeRecurrenceExceptions(exceptions)),
    ]);
    expect(mask.recurrenceExceptions).toEqual(exceptions);
  });

  it("leaves recurrenceExceptions undefined when the template has none", () => {
    const [mask] = getPerTemplateMasks([template(null)]);
    expect(mask.recurrenceExceptions).toBeUndefined();
  });
});
