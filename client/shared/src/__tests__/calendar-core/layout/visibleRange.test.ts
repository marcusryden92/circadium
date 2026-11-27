import {
  computeVisibleRange,
  enumerateDays,
} from "../../../calendar-core/layout/visibleRange";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("computeVisibleRange", () => {
  it("7-day week starting Monday", () => {
    const range = computeVisibleRange({
      dayCount: 7,
      firstDay: 1,
      anchor: new Date(2026, 10, 26, 10, 0),
    });
    expect(range.start.getDay()).toBe(1);
    expect(localDateStr(range.start)).toBe("2026-11-23");
    expect(localDateStr(range.end)).toBe("2026-11-30");
  });

  it("7-day week starting Sunday", () => {
    const range = computeVisibleRange({
      dayCount: 7,
      firstDay: 0,
      anchor: new Date(2026, 10, 26, 10, 0),
    });
    expect(range.start.getDay()).toBe(0);
    expect(localDateStr(range.start)).toBe("2026-11-22");
  });

  it("3-day view", () => {
    const range = computeVisibleRange({
      dayCount: 3,
      firstDay: 1,
      anchor: new Date(2026, 10, 26, 10, 0),
    });
    expect(localDateStr(range.start)).toBe("2026-11-23");
    expect(localDateStr(range.end)).toBe("2026-11-26");
  });

  it("anchor on the firstDay itself", () => {
    const range = computeVisibleRange({
      dayCount: 7,
      firstDay: 1,
      anchor: new Date(2026, 10, 23, 0, 0),
    });
    expect(localDateStr(range.start)).toBe("2026-11-23");
  });
});

describe("enumerateDays", () => {
  it("produces one Date per day in the range", () => {
    const range = computeVisibleRange({
      dayCount: 7,
      firstDay: 1,
      anchor: new Date(2026, 10, 26),
    });
    const days = enumerateDays(range);
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1);
    expect(days[6].getDay()).toBe(0);
  });
});
