import { templatesToCalendarEvents } from "../../../calendar-core/model/templatesToCalendarEvents";
import {
  occurrenceKey,
  occurrenceEventId,
  serializeRecurrenceExceptions,
  type PlanOccurrenceException,
} from "../../../domain/planRecurrence";
import type { EventTemplate, WeekDayIntegers } from "../../../contracts";

function template(recurrenceExceptions: string | null): EventTemplate {
  return {
    id: "tpl-1",
    title: "Standup",
    startDay: 1, // Monday
    startTime: "07:00",
    duration: 120,
    color: "#123456",
    locationId: null,
    recurrenceExceptions,
    userId: "u",
    createdAt: "x",
    updatedAt: "x",
  };
}

const JUN8_KEY = occurrenceKey(new Date(2026, 5, 8, 7, 0));
// Three Monday-start weeks: June 1, 8 and 15.
const RANGE = {
  start: new Date(2026, 5, 1, 0, 0),
  end: new Date(2026, 5, 22, 0, 0),
};

describe("templatesToCalendarEvents", () => {
  it("emits one editable tile per week with composite occurrence ids", () => {
    const events = templatesToCalendarEvents([template(null)], RANGE);
    expect(events.map((e) => e.start.getTime())).toEqual([
      new Date(2026, 5, 1, 7, 0).getTime(),
      new Date(2026, 5, 8, 7, 0).getTime(),
      new Date(2026, 5, 15, 7, 0).getTime(),
    ]);
    for (const event of events) {
      expect(event.kind).toBe("template");
      expect(event.editable).toBe(true);
      expect(event.templateId).toBe("tpl-1");
      expect(event.id).toBe(occurrenceEventId("tpl-1", event.occurrenceKey));
      expect(event.occurrenceKey).toBe(occurrenceKey(event.start));
      expect(event.moved).toBe(false);
      expect(event.color).toBe("#123456");
      expect((event.end.getTime() - event.start.getTime()) / 60000).toBe(120);
    }
  });

  it("drops a deleted occurrence and nothing else", () => {
    const events = templatesToCalendarEvents(
      [
        template(
          serializeRecurrenceExceptions([{ key: JUN8_KEY, type: "deleted" }]),
        ),
      ],
      RANGE,
    );
    expect(events).toHaveLength(2);
    expect(events.some((e) => e.occurrenceKey === JUN8_KEY)).toBe(false);
  });

  it("renders a moved occurrence at its new start with the series duration", () => {
    const newStart = new Date(2026, 5, 9, 14, 0);
    const exceptions: PlanOccurrenceException[] = [
      { key: JUN8_KEY, type: "moved", newStart: newStart.toISOString() },
    ];
    const events = templatesToCalendarEvents(
      [template(serializeRecurrenceExceptions(exceptions))],
      RANGE,
    );
    expect(events).toHaveLength(3);
    const moved = events.find((e) => e.occurrenceKey === JUN8_KEY)!;
    expect(moved.id).toBe(occurrenceEventId("tpl-1", JUN8_KEY));
    expect(moved.moved).toBe(true);
    expect(moved.start.getTime()).toBe(newStart.getTime());
    expect((moved.end.getTime() - moved.start.getTime()) / 60000).toBe(120);
    // The rule slot itself is not also rendered.
    expect(
      events.some(
        (e) => e.start.getTime() === new Date(2026, 5, 8, 7, 0).getTime(),
      ),
    ).toBe(false);
  });

  it("uses a per-occurrence duration override for a resized occurrence", () => {
    const inPlaceStart = new Date(2026, 5, 8, 7, 0);
    const exceptions: PlanOccurrenceException[] = [
      {
        key: JUN8_KEY,
        type: "moved",
        newStart: inPlaceStart.toISOString(),
        durationMinutes: 60,
      },
    ];
    const events = templatesToCalendarEvents(
      [template(serializeRecurrenceExceptions(exceptions))],
      RANGE,
    );
    expect(events).toHaveLength(3);
    const resized = events.find((e) => e.occurrenceKey === JUN8_KEY)!;
    expect(resized.start.getTime()).toBe(inPlaceStart.getTime());
    expect((resized.end.getTime() - resized.start.getTime()) / 60000).toBe(60);
  });

  it("falls back to the first palette color for an uncolored template", () => {
    const [event] = templatesToCalendarEvents(
      [{ ...template(null), color: null }],
      RANGE,
    );
    expect(event.color).toMatch(/^#/);
  });

  it("skips an incomplete template", () => {
    const incomplete = [
      { ...template(null), startTime: "" },
      { ...template(null), startDay: null as unknown as WeekDayIntegers },
      { ...template(null), duration: undefined as unknown as number },
    ];
    expect(templatesToCalendarEvents(incomplete, RANGE)).toHaveLength(0);
  });
});
