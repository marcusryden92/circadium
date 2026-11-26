import { addDays } from "date-fns";
import type { HitResult } from "@circadium/shared/calendar-core/layout";
import {
  WEEK_GRID_SNAP_MINUTES,
  WEEK_HOUR_HEIGHT_DESKTOP,
  columnForWeekday,
  createSpanFromHits,
  referenceWeekStart,
  ringSegments,
  weekGridAllowHook,
  weekGridIntent,
  weekGridRange,
  weekGridSpanAllowed,
  weekdayForColumn,
} from "@/components/calendar/WeekStructureModal/WeekGrid/weekGridModel";
import {
  templateToEvent,
  windowToEvent,
  type WeekGridEvent,
} from "@/components/calendar/WeekStructureModal/eventSerializers";
import type { WorkingWindow } from "@/components/calendar/WeekStructureModal/timeWindow";
import type { EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";

const HOUR = WEEK_HOUR_HEIGHT_DESKTOP;

function win(
  day: WeekDayIntegers,
  startTime: string,
  endTime: string,
  id = `w-${day}-${startTime}`,
): WorkingWindow {
  return { id, day, startTime, endTime, categoryId: "c1", recurrenceExceptions: null };
}

function tpl(
  id: string,
  startDay: WeekDayIntegers,
  startTime: string,
  duration: number,
): EventTemplate {
  return {
    id,
    title: id,
    startDay,
    startTime,
    duration,
    color: "#123456",
    locationId: null,
    recurrenceExceptions: null,
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
  };
}

const at = (base: Date, dayOffset: number, h: number, m = 0) => {
  const d = addDays(base, dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};

const hit = (base: Date, column: number, minute: number): HitResult => ({
  day: addDays(base, column),
  minute,
});

describe("reference week mapping", () => {
  it("starts on weekStartDay and spans seven abstract weekdays", () => {
    for (const weekStartDay of [0, 1, 3, 6] as WeekDayIntegers[]) {
      const start = referenceWeekStart(weekStartDay);
      expect(start.getDay()).toBe(weekStartDay);
      const range = weekGridRange(weekStartDay, null);
      expect(range.end.getTime()).toBe(addDays(start, 7).getTime());
      // Column i is weekday (weekStartDay + i) % 7, and back.
      for (let column = 0; column < 7; column++) {
        const weekday = weekdayForColumn(column, weekStartDay);
        expect(addDays(start, column).getDay()).toBe(weekday);
        expect(columnForWeekday(weekday, weekStartDay)).toBe(column);
      }
    }
  });

  it("puts Sunday last in a Monday-first week and first in a Sunday-first one", () => {
    expect(columnForWeekday(0, 1)).toBe(6);
    expect(columnForWeekday(0, 0)).toBe(0);
    expect(columnForWeekday(1, 1)).toBe(0);
    expect(columnForWeekday(6, 0)).toBe(6);
  });

  it("places a template on its weekday's column", () => {
    const weekStart = referenceWeekStart(1);
    const event = templateToEvent(tpl("t", 3, "09:30", 60), weekStart, 1, true);
    expect(event.start.getTime()).toBe(at(weekStart, 2, 9, 30).getTime());
    expect(event.end.getTime()).toBe(at(weekStart, 2, 10, 30).getTime());
    expect(event.editable).toBe(true);
  });

  it("the mobile range is the one selected day of the reference week", () => {
    const weekStart = referenceWeekStart(0);
    const range = weekGridRange(0, 4);
    expect(range.start.getTime()).toBe(addDays(weekStart, 4).getTime());
    expect(range.end.getTime()).toBe(addDays(weekStart, 5).getTime());
  });
});

describe("the weekly ring", () => {
  const weekStart = referenceWeekStart(1);
  const range = weekGridRange(1, null);

  it("wraps a Sunday-night window past the last column into the first", () => {
    const event = windowToEvent(win(0, "23:00", "07:00"), weekStart, 1, new Map(), true, true);
    const segments = ringSegments(event, range, HOUR);
    expect(segments.map((s) => [s.dayIndex, s.top / HOUR, s.height / HOUR])).toEqual([
      [0, 0, 7],
      [6, 23, 1],
    ]);
    // The wrapped half carries the end edge, the Sunday half the start edge.
    expect(segments.find((s) => s.dayIndex === 0)?.isEnd).toBe(true);
    expect(segments.find((s) => s.dayIndex === 6)?.isStart).toBe(true);
  });

  it("shows the previous day's overnight tail on a single mobile day", () => {
    const event = windowToEvent(win(1, "22:00", "06:00"), weekStart, 1, new Map(), true, true);
    const tuesday = weekGridRange(1, 1);
    expect(
      ringSegments(event, tuesday, HOUR).map((s) => [s.dayIndex, s.top / HOUR, s.height / HOUR]),
    ).toEqual([[0, 0, 6]]);
  });
});

describe("15-minute snap and gesture spans", () => {
  const weekStart = referenceWeekStart(1);

  it("never resizes a block below one 15-minute step", () => {
    const event = templateToEvent(tpl("t", 1, "09:00", 60), weekStart, 1, true);
    const intent = weekGridIntent({
      kind: "resize-end",
      event,
      startHit: hit(weekStart, 0, 600),
      currentHit: hit(weekStart, 0, 300),
    });
    expect(intent?.span.end.getTime()).toBe(at(weekStart, 0, 9, 15).getTime());
    expect(WEEK_GRID_SNAP_MINUTES).toBe(15);
  });

  it("joins a create across columns into one overnight range", () => {
    const span = createSpanFromHits(hit(weekStart, 0, 22 * 60), hit(weekStart, 1, 6 * 60));
    expect(span?.start.getTime()).toBe(at(weekStart, 0, 22).getTime());
    expect(span?.end.getTime()).toBe(at(weekStart, 1, 6).getTime());
    // Dragged upward the range is the same.
    expect(
      createSpanFromHits(hit(weekStart, 1, 6 * 60), hit(weekStart, 0, 22 * 60)),
    ).toEqual(span);
    expect(createSpanFromHits(hit(weekStart, 2, 600), hit(weekStart, 2, 600))).toBeNull();
  });

  it("a create may end at the column's 24:00 edge", () => {
    const span = createSpanFromHits(hit(weekStart, 0, 18 * 60), hit(weekStart, 0, 1440));
    expect(span?.end.getTime()).toBe(at(weekStart, 1, 0).getTime());
  });
});

describe("the overlap allow hook", () => {
  const weekStart = referenceWeekStart(1);
  const preview = { day: weekStart, startMinute: 0, endMinute: 0, allowed: true };

  function windowEvent(w: WorkingWindow): WeekGridEvent {
    return windowToEvent(w, weekStart, 1, new Map(), true, true);
  }

  it("denies a window moved onto another window", () => {
    const morning = win(1, "09:00", "12:00", "a");
    const afternoon = win(1, "13:00", "17:00", "b");
    const hook = weekGridAllowHook("windows", [morning, afternoon]);
    // Grab at 10:00, drop at 12:00: the window would run 11:00-14:00.
    expect(
      hook(preview, windowEvent(morning), "move", {
        startHit: hit(weekStart, 0, 600),
        currentHit: hit(weekStart, 0, 720),
      }),
    ).toBe(false);
    // Half an hour later it still clears the afternoon window.
    expect(
      hook(preview, windowEvent(morning), "move", {
        startHit: hit(weekStart, 0, 600),
        currentHit: hit(weekStart, 0, 630),
      }),
    ).toBe(true);
  });

  it("does not count a window against itself", () => {
    const morning = win(1, "09:00", "12:00", "a");
    const hook = weekGridAllowHook("windows", [morning]);
    expect(
      hook(preview, windowEvent(morning), "resize-end", {
        startHit: hit(weekStart, 0, 720),
        currentHit: hit(weekStart, 0, 780),
      }),
    ).toBe(true);
  });

  it("denies a create over an overnight window's morning half", () => {
    const overnight = win(1, "23:00", "07:00", "night");
    const hook = weekGridAllowHook("windows", [overnight]);
    // Tuesday 06:00-08:00 overlaps Monday night's window running to 07:00.
    expect(
      hook(preview, null, "create", {
        startHit: hit(weekStart, 1, 360),
        currentHit: hit(weekStart, 1, 480),
      }),
    ).toBe(false);
    expect(
      hook(preview, null, "create", {
        startHit: hit(weekStart, 1, 420),
        currentHit: hit(weekStart, 1, 480),
      }),
    ).toBe(true);
  });

  it("denies across the Sat/Sun seam on the weekly ring", () => {
    // Saturday 22:00 - Sunday 06:00 in a Monday-first week: Saturday is
    // column 5, Sunday column 6.
    const saturdayNight = win(6, "22:00", "06:00", "sat");
    const hook = weekGridAllowHook("windows", [saturdayNight]);
    expect(
      hook(preview, null, "create", {
        startHit: hit(weekStart, 6, 300),
        currentHit: hit(weekStart, 6, 420),
      }),
    ).toBe(false);
    // And in a Sunday-first week the same Sunday morning is column 0, while
    // the window starts in the last column: the overlap wraps the week.
    const sundayFirst = referenceWeekStart(0);
    expect(
      weekGridAllowHook("windows", [saturdayNight])(preview, null, "create", {
        startHit: hit(sundayFirst, 0, 300),
        currentHit: hit(sundayFirst, 0, 420),
      }),
    ).toBe(false);
  });

  it("denies a Sunday-night window wrapping into Monday morning", () => {
    const sundayNight = win(0, "23:00", "07:00", "sun");
    const mondayMorning = win(1, "06:00", "09:00", "mon");
    const hook = weekGridAllowHook("windows", [sundayNight, mondayMorning]);
    const monday = windowEvent(mondayMorning);
    // Moved to 06:15 it still sits under Sunday night's tail; moved to
    // 07:00 it clears it.
    expect(
      hook(preview, monday, "move", {
        startHit: hit(weekStart, 0, 420),
        currentHit: hit(weekStart, 0, 435),
      }),
    ).toBe(false);
    expect(
      hook(preview, monday, "move", {
        startHit: hit(weekStart, 0, 420),
        currentHit: hit(weekStart, 0, 480),
      }),
    ).toBe(true);
  });

  it("allows templates to overlap each other and windows", () => {
    const a = templateToEvent(tpl("a", 1, "09:00", 120), weekStart, 1, true);
    const hook = weekGridAllowHook("templates", [win(1, "09:00", "17:00", "w")]);
    expect(
      hook(preview, a, "move", {
        startHit: hit(weekStart, 0, 600),
        currentHit: hit(weekStart, 0, 660),
      }),
    ).toBe(true);
    expect(
      hook(preview, null, "create", {
        startHit: hit(weekStart, 0, 600),
        currentHit: hit(weekStart, 0, 720),
      }),
    ).toBe(true);
  });

  it("caps every block at 24 hours", () => {
    const a = templateToEvent(tpl("a", 1, "09:00", 23 * 60), weekStart, 1, true);
    expect(
      weekGridAllowHook("templates", [])(preview, a, "resize-end", {
        startHit: hit(weekStart, 1, 480),
        currentHit: hit(weekStart, 1, 600),
      }),
    ).toBe(false);
    expect(
      weekGridSpanAllowed(
        { start: at(weekStart, 0, 9), end: at(weekStart, 1, 9) },
        { kind: "template", id: null },
        [],
      ),
    ).toBe(true);
  });
});
