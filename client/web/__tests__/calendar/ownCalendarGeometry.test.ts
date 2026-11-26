import {
  HOUR_HEIGHT_DESKTOP,
  HOUR_HEIGHT_MOBILE,
  commitIntent,
  compareSegments,
  createSpan,
  dayIndexForDate,
  dragIntent,
  hourHeightFor,
  hourLabels,
  moveSpan,
  nowLinePosition,
  resizeSpan,
  selectViewType,
  sliceEdges,
  spanSegments,
  tileBox,
  viewDayCount,
  viewRange,
} from "@/app/(protected)/calendar/_components/own/ownCalendarGeometry";
import {
  resolveDragTarget,
  TILE_ID_ATTR,
  RESIZE_ATTR,
} from "@/app/(protected)/calendar/_components/own/useDragInteraction";
import { rendererFromParam } from "@/app/(protected)/calendar/_components/calendarRenderer";
import type { CalendarEvent } from "@circadium/shared/calendar-core/model";
import type {
  EventDaySegment,
  TileGeometry,
} from "@circadium/shared/calendar-core/layout";
import { EventType } from "@/types/prisma";

// Monday June 8 2026 .. Sunday June 14 2026, local time.
const at = (day: number, h = 0, m = 0) => new Date(2026, 5, day, h, m);
const week = { start: at(8), end: at(15) };

function planner(
  id: string,
  start: Date,
  end: Date,
  editable = true,
): CalendarEvent {
  return {
    kind: EventType.planner,
    id,
    title: id,
    start,
    end,
    editable,
    color: "#000",
    borderColor: "#000",
    props: null,
  };
}

describe("renderer selection", () => {
  it("defaults to FullCalendar and opts in only on renderer=own", () => {
    expect(rendererFromParam(null)).toBe("fullcalendar");
    expect(rendererFromParam("")).toBe("fullcalendar");
    expect(rendererFromParam("fullcalendar")).toBe("fullcalendar");
    expect(rendererFromParam("OWN")).toBe("fullcalendar");
    expect(rendererFromParam("own")).toBe("own");
  });
});

describe("view type", () => {
  it("mobile gets the 3-day window, desktop the week", () => {
    expect(selectViewType(true)).toBe("threeDay");
    expect(selectViewType(false)).toBe("week");
    expect(viewDayCount("threeDay")).toBe(3);
    expect(viewDayCount("week")).toBe(7);
  });

  it("hour height follows the FullCalendar slot heights", () => {
    expect(hourHeightFor(false)).toBe(HOUR_HEIGHT_DESKTOP);
    expect(hourHeightFor(true)).toBe(HOUR_HEIGHT_MOBILE);
    expect(HOUR_HEIGHT_DESKTOP).toBeCloseTo(76.8);
    expect(HOUR_HEIGHT_MOBILE).toBeCloseTo(89.6);
  });

  it("the week snaps to the containing week from weekStartDay", () => {
    // Wednesday June 10, Monday-start week.
    expect(viewRange("week", at(10, 15), 1)).toEqual({
      start: at(8),
      end: at(15),
    });
    // Sunday-start week.
    expect(viewRange("week", at(10, 15), 0)).toEqual({
      start: at(7),
      end: at(14),
    });
  });

  it("the 3-day window starts on the anchor day", () => {
    expect(viewRange("threeDay", at(10, 15), 1)).toEqual({
      start: at(10),
      end: at(13),
    });
  });
});

describe("column / day mapping", () => {
  it("maps dates to column indexes, -1 outside", () => {
    expect(dayIndexForDate(week, at(8, 0))).toBe(0);
    expect(dayIndexForDate(week, at(10, 23, 59))).toBe(2);
    expect(dayIndexForDate(week, at(14, 12))).toBe(6);
    expect(dayIndexForDate(week, at(15))).toBe(-1);
    expect(dayIndexForDate(week, at(7, 23))).toBe(-1);
  });
});

describe("now line", () => {
  it("sits in today's column at the minute offset", () => {
    expect(nowLinePosition(at(9, 13, 30), week, 60)).toEqual({
      dayIndex: 1,
      top: 13.5 * 60,
    });
  });

  it("is absent outside the visible range", () => {
    expect(nowLinePosition(at(16, 9), week, 60)).toBeNull();
  });
});

describe("segment order", () => {
  const seg = (event: CalendarEvent): EventDaySegment => ({
    event,
    day: at(8),
    startMinutes: 0,
    endMinutes: 60,
    isOvernightContinuation: false,
  });

  it("orders longest first, then earliest start, by the whole event", () => {
    const short = seg(planner("short", at(8, 9), at(8, 10)));
    const long = seg(planner("long", at(8, 11), at(8, 14)));
    const earlier = seg(planner("earlier", at(8, 8), at(8, 9)));
    // An overnight event's continuation slice still sorts by its full length.
    const overnight = seg(planner("overnight", at(7, 22), at(8, 7)));
    const sorted = [short, long, earlier, overnight].sort(compareSegments);
    expect(sorted.map((s) => s.event.id)).toEqual([
      "overnight",
      "long",
      "earlier",
      "short",
    ]);
  });
});

describe("tile box", () => {
  const tile = (over: Partial<TileGeometry>): TileGeometry => ({
    event: planner("x", at(8, 9), at(8, 10)),
    day: at(8),
    top: 100,
    height: 50,
    left: 0,
    width: 1,
    stackDepth: 0,
    stackForward: 1,
    isOvernightContinuation: false,
    ...over,
  });

  it("a lone tile spans the column", () => {
    expect(tileBox(tile({}))).toEqual({
      top: 100,
      height: 50,
      left: 0,
      right: 0,
      zIndex: 1,
    });
  });

  it("doubles overlapping widths, capped at the edge, and stacks by depth", () => {
    expect(tileBox(tile({ left: 0, width: 1 / 3, stackDepth: 0 }))).toMatchObject({
      left: 0,
      zIndex: 1,
    });
    expect(tileBox(tile({ left: 0, width: 1 / 3 })).right).toBeCloseTo(100 / 3);
    expect(tileBox(tile({ left: 0.5, width: 0.5, stackDepth: 1 }))).toMatchObject({
      left: 50,
      right: 0,
      zIndex: 2,
    });
  });

  it("applies the minimum height", () => {
    expect(tileBox(tile({ height: 4 })).height).toBe(15);
  });
});

describe("slice edges", () => {
  const sleep = planner("sleep", at(8, 23), at(9, 7));

  it("an overnight event's first slice has no end, its continuation no start", () => {
    expect(
      sliceEdges(sleep, { day: at(8), isOvernightContinuation: false }),
    ).toEqual({ isStart: true, isEnd: false });
    expect(
      sliceEdges(sleep, { day: at(9), isOvernightContinuation: true }),
    ).toEqual({ isStart: false, isEnd: true });
  });

  it("an event ending exactly at midnight ends in its own column", () => {
    const late = planner("late", at(8, 22), at(9));
    expect(
      sliceEdges(late, { day: at(8), isOvernightContinuation: false }),
    ).toEqual({ isStart: true, isEnd: true });
  });
});

describe("drag spans", () => {
  const event = { start: at(8, 9, 3), end: at(8, 10, 3) };
  const hit = (day: number, minute: number) => ({ day: at(day), minute });

  it("move shifts both ends by the hit delta, days included", () => {
    expect(moveSpan(event, hit(8, 540), hit(10, 600))).toEqual({
      start: at(10, 10, 3),
      end: at(10, 11, 3),
    });
  });

  it("resize moves one edge and never collapses below one snap step", () => {
    expect(resizeSpan(event, hit(8, 600), hit(8, 630), "end")).toEqual({
      start: event.start,
      end: at(8, 10, 33),
    });
    expect(resizeSpan(event, hit(8, 600), hit(8, 400), "end")).toEqual({
      start: event.start,
      end: at(8, 9, 8),
    });
    expect(resizeSpan(event, hit(8, 540), hit(8, 510), "start")).toEqual({
      start: at(8, 8, 33),
      end: event.end,
    });
    expect(resizeSpan(event, hit(8, 540), hit(8, 700), "start")).toEqual({
      start: at(8, 9, 58),
      end: event.end,
    });
  });

  it("create spans the two hits in either direction; a press creates nothing", () => {
    expect(createSpan(hit(9, 600), hit(9, 540))).toEqual({
      start: at(9, 9),
      end: at(9, 10),
    });
    expect(createSpan(hit(9, 600), hit(9, 600))).toBeNull();
  });

  it("a drag that changes nothing has no intent", () => {
    const e = planner("p", at(8, 9), at(8, 10));
    expect(
      dragIntent({
        kind: "move",
        event: e,
        startHit: hit(8, 545),
        currentHit: hit(8, 545),
      }),
    ).toBeNull();
  });

  it("a committed drag reads as its intent", () => {
    const e = planner("p", at(8, 9), at(8, 10));
    expect(
      commitIntent({
        phase: "committed",
        kind: "resize-end",
        event: e,
        startHit: hit(8, 600),
        endHit: hit(8, 630),
      }),
    ).toEqual({
      type: "resize",
      event: e,
      span: { start: at(8, 9), end: at(8, 10, 30) },
    });
    expect(
      commitIntent({
        phase: "committed",
        kind: "create",
        event: null,
        startHit: hit(11, 60),
        endHit: hit(11, 120),
      }),
    ).toEqual({ type: "create", span: { start: at(11, 1), end: at(11, 2) } });
  });
});

describe("span segments", () => {
  it("cuts an overnight span at midnight into its columns", () => {
    expect(
      spanSegments({ start: at(8, 23), end: at(9, 7) }, week, 60),
    ).toEqual([
      { dayIndex: 0, top: 23 * 60, height: 60, isStart: true, isEnd: false },
      { dayIndex: 1, top: 0, height: 7 * 60, isStart: false, isEnd: true },
    ]);
  });

  it("drops what falls outside the range", () => {
    expect(spanSegments({ start: at(20, 9), end: at(20, 10) }, week, 60)).toEqual(
      [],
    );
  });
});

describe("hour labels", () => {
  it("labels every hour as HH:00", () => {
    const labels = hourLabels();
    expect(labels).toHaveLength(24);
    expect(labels[0]).toEqual({ hour: 0, label: "00:00" });
    expect(labels[13]).toEqual({ hour: 13, label: "13:00" });
  });
});

describe("drag target resolution", () => {
  const editable = planner("p1", at(8, 9), at(8, 10));
  const locked = planner("t1", at(8, 11), at(8, 12), false);
  const events = new Map([
    ["p1", editable],
    ["t1", locked],
  ]);
  const lookup = (id: string) => events.get(id);

  function tileWith(id: string, handle?: "start" | "end") {
    const tile = document.createElement("div");
    tile.setAttribute(TILE_ID_ATTR, id);
    const inner = document.createElement("span");
    tile.appendChild(inner);
    if (handle) {
      const h = document.createElement("div");
      h.setAttribute(RESIZE_ATTR, handle);
      tile.appendChild(h);
      return h;
    }
    return inner;
  }

  it("empty grid creates", () => {
    expect(resolveDragTarget(document.createElement("div"), lookup)).toEqual({
      event: null,
      kind: "create",
    });
  });

  it("a tile body moves, its handles resize", () => {
    expect(resolveDragTarget(tileWith("p1"), lookup)).toEqual({
      event: editable,
      kind: "move",
    });
    expect(resolveDragTarget(tileWith("p1", "start"), lookup)?.kind).toBe(
      "resize-start",
    );
    expect(resolveDragTarget(tileWith("p1", "end"), lookup)?.kind).toBe(
      "resize-end",
    );
  });

  it("a non-editable tile is not draggable", () => {
    expect(resolveDragTarget(tileWith("t1"), lookup)).toBeNull();
  });
});
