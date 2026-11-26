import { sliceEventIntoDays } from "../../../calendar-core/layout/daySlice";
import type { CalendarRange } from "../../../calendar-core/model/calendarEvent";

function localDate(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min);
}

function localDateStr(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function makeRange(start: Date, end: Date): CalendarRange {
  return { start, end };
}

describe("sliceEventIntoDays", () => {
  const weekRange = makeRange(
    localDate(2026, 11, 23),
    localDate(2026, 11, 30)
  );

  it("single-day event produces one slice", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 24, 9, 0),
      localDate(2026, 11, 24, 10, 30),
      weekRange
    );
    expect(slices).toHaveLength(1);
    expect(slices[0].startMinutes).toBe(9 * 60);
    expect(slices[0].endMinutes).toBe(10 * 60 + 30);
    expect(slices[0].isOvernightContinuation).toBe(false);
  });

  it("overnight event splits across two days", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 24, 22, 0),
      localDate(2026, 11, 25, 7, 0),
      weekRange
    );
    expect(slices).toHaveLength(2);

    expect(localDateStr(slices[0].day)).toBe("2026-11-24");
    expect(slices[0].startMinutes).toBe(22 * 60);
    expect(slices[0].endMinutes).toBe(24 * 60);
    expect(slices[0].isOvernightContinuation).toBe(false);

    expect(localDateStr(slices[1].day)).toBe("2026-11-25");
    expect(slices[1].startMinutes).toBe(0);
    expect(slices[1].endMinutes).toBe(7 * 60);
    expect(slices[1].isOvernightContinuation).toBe(true);
  });

  it("multi-day event splits across all days", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 24, 20, 0),
      localDate(2026, 11, 27, 6, 0),
      weekRange
    );
    expect(slices).toHaveLength(4);
    expect(slices[0].isOvernightContinuation).toBe(false);
    expect(slices[1].isOvernightContinuation).toBe(true);
    expect(slices[2].isOvernightContinuation).toBe(true);
    expect(slices[3].isOvernightContinuation).toBe(true);

    expect(slices[1].startMinutes).toBe(0);
    expect(slices[1].endMinutes).toBe(24 * 60);
    expect(slices[2].startMinutes).toBe(0);
    expect(slices[2].endMinutes).toBe(24 * 60);
  });

  it("clips to visible range start", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 22, 20, 0),
      localDate(2026, 11, 23, 6, 0),
      weekRange
    );
    expect(slices).toHaveLength(1);
    expect(localDateStr(slices[0].day)).toBe("2026-11-23");
    expect(slices[0].startMinutes).toBe(0);
    expect(slices[0].endMinutes).toBe(6 * 60);
    expect(slices[0].isOvernightContinuation).toBe(true);
  });

  it("clips to visible range end", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 29, 20, 0),
      localDate(2026, 11, 30, 6, 0),
      weekRange
    );
    expect(slices).toHaveLength(1);
    expect(localDateStr(slices[0].day)).toBe("2026-11-29");
    expect(slices[0].startMinutes).toBe(20 * 60);
    expect(slices[0].endMinutes).toBe(24 * 60);
  });

  it("event entirely outside range produces no slices", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 12, 1, 9, 0),
      localDate(2026, 12, 1, 10, 0),
      weekRange
    );
    expect(slices).toHaveLength(0);
  });

  it("zero-duration event produces no slices", () => {
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 24, 9, 0),
      localDate(2026, 11, 24, 9, 0),
      weekRange
    );
    expect(slices).toHaveLength(0);
  });

  it("overnight split at visible range boundary", () => {
    const narrowRange = makeRange(
      localDate(2026, 11, 25),
      localDate(2026, 11, 26)
    );
    const slices = sliceEventIntoDays(
      localDate(2026, 11, 24, 23, 0),
      localDate(2026, 11, 25, 2, 0),
      narrowRange
    );
    expect(slices).toHaveLength(1);
    expect(localDateStr(slices[0].day)).toBe("2026-11-25");
    expect(slices[0].startMinutes).toBe(0);
    expect(slices[0].endMinutes).toBe(2 * 60);
    expect(slices[0].isOvernightContinuation).toBe(true);
  });
});
