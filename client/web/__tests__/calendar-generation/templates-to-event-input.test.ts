import { templatesToEventInput } from "@/utils/calendar-rendering/templatesToEventInput";
import {
  occurrenceKey,
  occurrenceEventId,
  serializeRecurrenceExceptions,
  type PlanOccurrenceException,
} from "@/utils/planRecurrence";
import type { EventTemplate } from "@/types/prisma";

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
  } as unknown as EventTemplate;
}

const JUN8_KEY = occurrenceKey(new Date(2026, 5, 8, 7, 0));

describe("templatesToEventInput — recurrence exceptions", () => {
  it("emits a single editable recurring event with no exdate when clean", () => {
    const [base, ...rest] = templatesToEventInput([template(null)]);
    expect(rest).toHaveLength(0);
    expect(base.id).toBe("tpl-1");
    expect(base.editable).toBe(true);
    expect(base.rrule).toBeTruthy();
    expect(base.exdate).toBeUndefined();
  });

  it("excludes deleted occurrences via exdate and adds no extra event", () => {
    const events = templatesToEventInput([
      template(
        serializeRecurrenceExceptions([{ key: JUN8_KEY, type: "deleted" }]),
      ),
    ]);
    expect(events).toHaveLength(1);
    const base = events[0];
    expect(base.exdate).toEqual(["2026-06-08T07:00:00"]);
  });

  it("exdates a moved occurrence and re-emits it as a one-off event", () => {
    const newStart = new Date(2026, 5, 9, 14, 0);
    const exceptions: PlanOccurrenceException[] = [
      { key: JUN8_KEY, type: "moved", newStart: newStart.toISOString() },
    ];
    const events = templatesToEventInput([
      template(serializeRecurrenceExceptions(exceptions)),
    ]);
    expect(events).toHaveLength(2);

    const [base, moved] = events;
    expect(base.exdate).toEqual(["2026-06-08T07:00:00"]);

    // The moved occurrence carries a composite id so its key survives re-moves,
    // renders at the override start, and keeps the template duration.
    expect(moved.id).toBe(occurrenceEventId("tpl-1", JUN8_KEY));
    expect(moved.rrule).toBeUndefined();
    expect(new Date(moved.start as string).getTime()).toBe(newStart.getTime());
    expect(
      new Date(moved.end as string).getTime() -
        new Date(moved.start as string).getTime(),
    ).toBe(120 * 60000);
  });

  it("uses a per-occurrence duration override for a resized occurrence", () => {
    // Resize-in-place: newStart equals the rule position, only the length
    // changes (60 min instead of the series' 120).
    const inPlaceStart = new Date(2026, 5, 8, 7, 0);
    const exceptions: PlanOccurrenceException[] = [
      {
        key: JUN8_KEY,
        type: "moved",
        newStart: inPlaceStart.toISOString(),
        durationMinutes: 60,
      },
    ];
    const events = templatesToEventInput([
      template(serializeRecurrenceExceptions(exceptions)),
    ]);
    expect(events).toHaveLength(2);
    const [base, moved] = events;
    expect(base.exdate).toEqual(["2026-06-08T07:00:00"]);
    expect(new Date(moved.start as string).getTime()).toBe(
      inPlaceStart.getTime(),
    );
    expect(
      new Date(moved.end as string).getTime() -
        new Date(moved.start as string).getTime(),
    ).toBe(60 * 60000);
  });
});
