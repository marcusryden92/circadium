import { expandTemplateOccurrences } from "../../calendar-core/expandTemplateOccurrences";
import {
  occurrenceKey,
  serializeRecurrenceExceptions,
  type PlanOccurrenceException,
} from "../../domain/planRecurrence";
import type { EventTemplate, WeekDayIntegers } from "../../contracts";

function tpl(overrides: Partial<EventTemplate> = {}): EventTemplate {
  return {
    id: "tpl-1",
    title: "Gym",
    startDay: 1 as WeekDayIntegers, // Monday
    startTime: "09:00",
    userId: "u1",
    duration: 60,
    color: "#3b82f6",
    locationId: null,
    recurrenceExceptions: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// A month-ish window; rangeEnd is exclusive on the rule position.
const RANGE_START = new Date(2026, 5, 1, 0, 0, 0, 0);
const RANGE_END = new Date(2026, 5, 29, 0, 0, 0, 0);

describe("expandTemplateOccurrences", () => {
  it("expands a weekly template onto its weekday/time across the range", () => {
    const occ = expandTemplateOccurrences({
      template: tpl(),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });

    expect(occ.length).toBeGreaterThan(0);
    for (const o of occ) {
      expect(o.start.getDay()).toBe(1);
      expect(o.start.getHours()).toBe(9);
      expect(o.start.getMinutes()).toBe(0);
      expect((o.end.getTime() - o.start.getTime()) / 60000).toBe(60);
      expect(o.key).toBe(occurrenceKey(o.start));
      expect(o.moved).toBe(false);
    }
    // Rule positions stay inside the range and step weekly.
    for (let i = 1; i < occ.length; i++) {
      expect(
        (occ[i].start.getTime() - occ[i - 1].start.getTime()) / 60000,
      ).toBe(7 * 24 * 60);
    }
    expect(occ[0].start.getTime()).toBeGreaterThanOrEqual(RANGE_START.getTime());
  });

  it("anchors the first occurrence on or after a range that starts mid-week", () => {
    const base = expandTemplateOccurrences({
      template: tpl(),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    // Start the range two days after the first Monday — the first occurrence
    // should roll forward to the next week's Monday, not the one already past.
    const midWeekStart = new Date(base[0].start);
    midWeekStart.setDate(midWeekStart.getDate() + 2);
    const occ = expandTemplateOccurrences({
      template: tpl(),
      rangeStart: midWeekStart,
      rangeEnd: RANGE_END,
    });
    expect(occ[0].start.getTime()).toBe(base[1].start.getTime());
  });

  it("skips a deleted occurrence", () => {
    const base = expandTemplateOccurrences({
      template: tpl(),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    const deletedKey = base[1].key;
    const exceptions: PlanOccurrenceException[] = [
      { key: deletedKey, type: "deleted" },
    ];
    const occ = expandTemplateOccurrences({
      template: tpl({
        recurrenceExceptions: serializeRecurrenceExceptions(exceptions),
      }),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    expect(occ).toHaveLength(base.length - 1);
    expect(occ.some((o) => o.key === deletedKey)).toBe(false);
  });

  it("relocates a moved occurrence to its override start and keeps its key", () => {
    const base = expandTemplateOccurrences({
      template: tpl(),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    const movedKey = base[2].key;
    const newStart = new Date(base[2].start);
    newStart.setDate(newStart.getDate() + 1);
    newStart.setHours(14, 30, 0, 0);
    const exceptions: PlanOccurrenceException[] = [
      { key: movedKey, type: "moved", newStart: newStart.toISOString() },
    ];
    const occ = expandTemplateOccurrences({
      template: tpl({
        recurrenceExceptions: serializeRecurrenceExceptions(exceptions),
      }),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    const moved = occ.find((o) => o.key === movedKey);
    expect(moved).toBeDefined();
    expect(moved!.moved).toBe(true);
    expect(moved!.start.getTime()).toBe(newStart.getTime());
    // Inherits the series duration when the exception carries no override.
    expect((moved!.end.getTime() - moved!.start.getTime()) / 60000).toBe(60);
  });

  it("honors a per-occurrence duration override on a moved occurrence", () => {
    const base = expandTemplateOccurrences({
      template: tpl(),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    const movedKey = base[2].key;
    const exceptions: PlanOccurrenceException[] = [
      {
        key: movedKey,
        type: "moved",
        newStart: base[2].start.toISOString(),
        durationMinutes: 90,
      },
    ];
    const occ = expandTemplateOccurrences({
      template: tpl({
        recurrenceExceptions: serializeRecurrenceExceptions(exceptions),
      }),
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    });
    const moved = occ.find((o) => o.key === movedKey)!;
    expect((moved.end.getTime() - moved.start.getTime()) / 60000).toBe(90);
  });

  it("returns nothing for an unparseable startTime", () => {
    expect(
      expandTemplateOccurrences({
        template: tpl({ startTime: "not-a-time" }),
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
      }),
    ).toHaveLength(0);
  });
});
