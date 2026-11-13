import {
  windowRangeOverlaps,
  type WorkingWindow,
} from "@/components/calendar/WeekStructureModal/timeWindow";
import { windowToEvent } from "@/components/calendar/WeekStructureModal/eventSerializers";
import type { Category } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// 2024-01-07 is a Sunday (getDay() === 0), so day offsets line up with the
// 0=Sunday..6=Saturday convention windowRangeOverlaps uses.
const WEEK_SUNDAY = new Date(2024, 0, 7);

function at(dayOffset: number, hh: number, mm: number): Date {
  const d = new Date(WEEK_SUNDAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function win(
  day: WeekDayIntegers,
  startTime: string,
  endTime: string,
  id = `w-${day}-${startTime}`,
): WorkingWindow {
  return { id, day, startTime, endTime, categoryId: "c1", recurrenceExceptions: null };
}

describe("windowRangeOverlaps", () => {
  it("detects an overlap between two within-day windows on the same day", () => {
    const existing = [win(1, "09:00", "12:00")];
    expect(windowRangeOverlaps(existing, at(1, 10, 0), at(1, 11, 0), null)).toBe(
      true,
    );
  });

  it("treats touching within-day windows as non-overlapping", () => {
    const existing = [win(1, "09:00", "12:00")];
    expect(windowRangeOverlaps(existing, at(1, 12, 0), at(1, 13, 0), null)).toBe(
      false,
    );
  });

  it("ignores windows on other days", () => {
    const existing = [win(2, "09:00", "12:00")];
    expect(windowRangeOverlaps(existing, at(1, 10, 0), at(1, 11, 0), null)).toBe(
      false,
    );
  });

  it("catches an overnight window colliding with the next morning's window", () => {
    // Existing Mon 23:00 -> Tue 07:00 overnight window; a candidate Tue
    // 06:00-09:00 overlaps the 06:00-07:00 tail that bled into Tuesday.
    const existing = [win(1, "23:00", "07:00")];
    expect(windowRangeOverlaps(existing, at(2, 6, 0), at(2, 9, 0), null)).toBe(
      true,
    );
  });

  it("catches a candidate overnight window colliding with an existing evening window", () => {
    const existing = [win(1, "20:00", "23:30")];
    // Candidate Mon 23:00 -> Tue 07:00 overlaps 23:00-23:30.
    expect(windowRangeOverlaps(existing, at(1, 23, 0), at(2, 7, 0), null)).toBe(
      true,
    );
  });

  it("wraps a Saturday-night window into Sunday morning on the weekly ring", () => {
    const existing = [win(6, "23:00", "07:00")];
    // Sunday 05:00-06:00 sits inside the Saturday overnight window's Sunday tail.
    expect(windowRangeOverlaps(existing, at(0, 5, 0), at(0, 6, 0), null)).toBe(
      true,
    );
  });

  it("does not collide the Sunday tail with a Saturday-evening candidate that predates it", () => {
    const existing = [win(6, "23:00", "07:00")];
    // Saturday 20:00-22:00 is before the 23:00 start — no overlap.
    expect(windowRangeOverlaps(existing, at(6, 20, 0), at(6, 22, 0), null)).toBe(
      false,
    );
  });

  it("treats a 23:59 end-of-day sentinel as reaching midnight but not past it", () => {
    const existing = [win(1, "22:00", "23:59")];
    // Adjacent Tue 00:00-01:00 touches the midnight boundary, does not overlap.
    expect(windowRangeOverlaps(existing, at(2, 0, 0), at(2, 1, 0), null)).toBe(
      false,
    );
    // Mon 23:00-23:30 sits inside the 22:00-midnight window.
    expect(
      windowRangeOverlaps(existing, at(1, 23, 0), at(1, 23, 30), null),
    ).toBe(true);
  });

  it("excludes the window being dragged from the overlap test", () => {
    const existing = [win(1, "09:00", "12:00", "dragged")];
    expect(
      windowRangeOverlaps(existing, at(1, 10, 0), at(1, 11, 0), "dragged"),
    ).toBe(false);
  });
});

describe("windowToEvent overnight rendering", () => {
  const category: Category = {
    id: "c1",
    name: "Focus",
    icon: null,
    color: "#3b82f6",
    sortOrder: 0,
    useTimeWindows: true,
    isStrict: false,
    confineToOwnWindows: false,
    locationId: null,
    parentId: null,
    userId: "u1",
    timeSlots: [],
    createdAt: WEEK_SUNDAY.toISOString(),
    updatedAt: WEEK_SUNDAY.toISOString(),
  };
  const categoryById = new Map([[category.id, category]]);
  // Week starting Monday (weekStartDay 1), reference Monday 2024-01-08.
  const weekStart = new Date(2024, 0, 8);
  const weekStartDay: WeekDayIntegers = 1;

  it("renders an overnight window ending on the following day", () => {
    const event = windowToEvent(
      win(1, "23:00", "07:00"),
      weekStart,
      weekStartDay,
      categoryById,
      true,
      true,
    );
    const start = event.start as Date;
    const end = event.end as Date;
    expect(start.getHours()).toBe(23);
    expect(end.getDate()).toBe(start.getDate() + 1);
    expect(end.getHours()).toBe(7);
    // Eight hours, not a negative-duration event.
    expect((end.getTime() - start.getTime()) / 3600000).toBe(8);
  });

  it("renders a within-day window inside a single day", () => {
    const event = windowToEvent(
      win(1, "09:00", "17:00"),
      weekStart,
      weekStartDay,
      categoryById,
      true,
      true,
    );
    const start = event.start as Date;
    const end = event.end as Date;
    expect(end.getDate()).toBe(start.getDate());
    expect((end.getTime() - start.getTime()) / 3600000).toBe(8);
  });
});
