import { hitTest } from "../../../calendar-core/layout/hitTest";
import type { CalendarRange } from "../../../calendar-core/model/calendarEvent";

function localDate(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min);
}

function localDateStr(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const weekRange: CalendarRange = {
  start: localDate(2026, 11, 23),
  end: localDate(2026, 11, 30),
};

const COL_WIDTH = 100;
const HOUR_HEIGHT = 60;

describe("hitTest", () => {
  it("maps first column, top of grid to day 0, minute 0", () => {
    const hit = hitTest(10, 0, COL_WIDTH, HOUR_HEIGHT, weekRange);
    expect(hit).not.toBeNull();
    expect(localDateStr(hit!.day)).toBe("2026-11-23");
    expect(hit!.minute).toBe(0);
  });

  it("maps mid-column to correct day", () => {
    const hit = hitTest(350, 60, COL_WIDTH, HOUR_HEIGHT, weekRange);
    expect(hit).not.toBeNull();
    expect(localDateStr(hit!.day)).toBe("2026-11-26");
    expect(hit!.minute).toBe(60);
  });

  it("snaps to 5-minute grid", () => {
    const hit = hitTest(50, 62, COL_WIDTH, HOUR_HEIGHT, weekRange, 5);
    expect(hit).not.toBeNull();
    expect(hit!.minute).toBe(60);
  });

  it("snaps to 15-minute grid", () => {
    const hit = hitTest(50, 68, COL_WIDTH, HOUR_HEIGHT, weekRange, 15);
    expect(hit).not.toBeNull();
    expect(hit!.minute).toBe(75);
  });

  it("returns null for negative x", () => {
    expect(hitTest(-1, 50, COL_WIDTH, HOUR_HEIGHT, weekRange)).toBeNull();
  });

  it("returns null for negative y", () => {
    expect(hitTest(50, -1, COL_WIDTH, HOUR_HEIGHT, weekRange)).toBeNull();
  });

  it("returns null for column past visible range", () => {
    expect(hitTest(700, 50, COL_WIDTH, HOUR_HEIGHT, weekRange)).toBeNull();
  });

  it("last column is valid", () => {
    const hit = hitTest(650, 50, COL_WIDTH, HOUR_HEIGHT, weekRange);
    expect(hit).not.toBeNull();
    expect(localDateStr(hit!.day)).toBe("2026-11-29");
  });
});
