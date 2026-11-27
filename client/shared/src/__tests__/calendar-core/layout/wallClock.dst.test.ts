import { sliceEventIntoDays } from "../../../calendar-core/layout/daySlice";
import {
  atWallMinute,
  shiftWall,
  wallMinutes,
} from "../../../calendar-core/layout/wallClock";

// Pinned to a DST zone so the assertions bite on a UTC CI runner too.
// Europe/Stockholm springs forward 2026-03-29 02:00 -> 03:00 and falls back
// 2026-10-25 03:00 -> 02:00.
const previousTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Stockholm";
});
afterAll(() => {
  process.env.TZ = previousTz;
});

const at = (m: number, d: number, h = 0, min = 0) =>
  new Date(2026, m - 1, d, h, min);

describe("wall-clock grid positions across DST", () => {
  it("the zone really has the transitions the tests assume", () => {
    expect(at(3, 30).getTime() - at(3, 29).getTime()).toBe(23 * 3_600_000);
    expect(at(10, 26).getTime() - at(10, 25).getTime()).toBe(25 * 3_600_000);
  });

  it("slices a spring-forward day by the clock, not by elapsed minutes", () => {
    const range = { start: at(3, 23), end: at(3, 30) };
    const [slice] = sliceEventIntoDays(at(3, 29, 10), at(3, 29, 11, 30), range);
    expect(slice.startMinutes).toBe(600);
    expect(slice.endMinutes).toBe(690);
  });

  it("slices a fall-back day by the clock, and ends a full day at 24:00", () => {
    const range = { start: at(10, 19), end: at(10, 26) };
    const [slice] = sliceEventIntoDays(at(10, 25, 10), at(10, 25, 12), range);
    expect(slice.startMinutes).toBe(600);
    expect(slice.endMinutes).toBe(720);
    const [night] = sliceEventIntoDays(at(10, 25, 22), at(10, 26, 6), {
      start: at(10, 25),
      end: at(10, 26),
    });
    expect(night.endMinutes).toBe(1440);
  });

  it("maps hits and shifts on the wall clock", () => {
    expect(wallMinutes(at(3, 29, 10))).toBe(600);
    expect(atWallMinute(at(3, 29), 600)).toEqual(at(3, 29, 10));
    expect(atWallMinute(at(3, 29), 1440)).toEqual(at(3, 30));
    expect(shiftWall(at(3, 27, 10), 2, 0)).toEqual(at(3, 29, 10));
    expect(shiftWall(at(10, 24, 23), 1, 30)).toEqual(at(10, 25, 23, 30));
  });
});
