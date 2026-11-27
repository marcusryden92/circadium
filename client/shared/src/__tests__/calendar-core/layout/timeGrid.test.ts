import {
  minutesToPx,
  pxToMinutes,
  snapMinutes,
  snapPx,
  dateToMinutes,
  dayColumnHeight,
} from "../../../calendar-core/layout/timeGrid";

describe("time<->px conversions", () => {
  const HOUR_HEIGHT = 60; // 1px per minute for easy math

  it("minutesToPx at noon", () => {
    expect(minutesToPx(720, HOUR_HEIGHT)).toBe(720);
  });

  it("pxToMinutes inverse of minutesToPx", () => {
    for (const mins of [0, 60, 360, 720, 1439]) {
      expect(pxToMinutes(minutesToPx(mins, HOUR_HEIGHT), HOUR_HEIGHT)).toBeCloseTo(mins);
    }
  });

  it("round-trip at fractional hourHeight", () => {
    const hourHeight = 48;
    for (const mins of [0, 30, 90, 720, 1440]) {
      const px = minutesToPx(mins, hourHeight);
      expect(pxToMinutes(px, hourHeight)).toBeCloseTo(mins, 6);
    }
  });

  it("dayColumnHeight", () => {
    expect(dayColumnHeight(60)).toBe(1440);
    expect(dayColumnHeight(48)).toBe(48 * 24);
  });
});

describe("snapMinutes", () => {
  it("snaps to 5-minute grid", () => {
    expect(snapMinutes(62, 5)).toBe(60);
    expect(snapMinutes(63, 5)).toBe(65);
    expect(snapMinutes(60, 5)).toBe(60);
  });

  it("snaps to 15-minute grid", () => {
    expect(snapMinutes(67, 15)).toBe(60);
    expect(snapMinutes(68, 15)).toBe(75);
  });

  it("clamps to [0, 1440 - snap)", () => {
    expect(snapMinutes(-10, 5)).toBe(0);
    expect(snapMinutes(1500, 5)).toBe(1435);
  });

  it("no-op when snapMinutes is 0", () => {
    expect(snapMinutes(123.456, 0)).toBe(123.456);
  });
});

describe("snapPx", () => {
  it("converts px to snapped minutes", () => {
    const hourHeight = 60;
    expect(snapPx(62, hourHeight, 5)).toBe(60);
    expect(snapPx(63, hourHeight, 5)).toBe(65);
  });
});

describe("dateToMinutes", () => {
  it("midnight is 0", () => {
    expect(dateToMinutes(new Date("2026-11-24T00:00:00"))).toBe(0);
  });

  it("noon is 720", () => {
    expect(dateToMinutes(new Date("2026-11-24T12:00:00"))).toBe(720);
  });

  it("23:59 is 1439", () => {
    expect(dateToMinutes(new Date("2026-11-24T23:59:00"))).toBe(1439);
  });
});
