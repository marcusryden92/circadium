import { layoutEvents } from "../../../calendar-core/layout/segmentGeometry";
import type { SegmentComparator } from "../../../calendar-core/layout/segmentGeometry";
import type { CalendarEvent } from "../../../calendar-core/model/calendarEvent";
import { EventType } from "../../../contracts";

const at = (day: number, h: number, m = 0) => new Date(2026, 5, day, h, m);
const range = { start: new Date(2026, 5, 8), end: new Date(2026, 5, 15) };

function event(id: string, start: Date, end: Date): CalendarEvent {
  return {
    kind: EventType.planner,
    id,
    title: id,
    start,
    end,
    editable: true,
    color: "#000",
    borderColor: "#000",
    props: null,
  };
}

const longestFirst: SegmentComparator = (a, b) =>
  b.event.end.getTime() -
  b.event.start.getTime() -
  (a.event.end.getTime() - a.event.start.getTime());

describe("layoutEvents", () => {
  it("a lone tile spans the column at depth 0 with nothing forward of it", () => {
    const [tile] = layoutEvents(
      [event("a", at(8, 9), at(8, 10))],
      range,
      60,
      longestFirst,
    );
    expect(tile).toMatchObject({
      top: 540,
      height: 60,
      left: 0,
      width: 1,
      stackDepth: 0,
      stackForward: 1,
    });
  });

  it("overlapping tiles carry their stack depth and forward count", () => {
    const tiles = layoutEvents(
      [event("long", at(8, 9), at(8, 12)), event("short", at(8, 10), at(8, 11))],
      range,
      60,
      longestFirst,
    );
    const byId = new Map(tiles.map((t) => [t.event.id, t]));
    expect(byId.get("long")).toMatchObject({
      left: 0,
      width: 0.5,
      stackDepth: 0,
      stackForward: 2,
    });
    expect(byId.get("short")).toMatchObject({
      left: 0.5,
      width: 0.5,
      stackDepth: 1,
      stackForward: 1,
    });
  });

  it("an overnight event yields one tile per day column", () => {
    const tiles = layoutEvents(
      [event("sleep", at(8, 23), at(9, 7))],
      range,
      60,
      longestFirst,
    );
    expect(
      tiles.map((t) => [t.day.getDate(), t.top, t.height, t.isOvernightContinuation]),
    ).toEqual([
      [8, 23 * 60, 60, false],
      [9, 0, 7 * 60, true],
    ]);
  });
});
