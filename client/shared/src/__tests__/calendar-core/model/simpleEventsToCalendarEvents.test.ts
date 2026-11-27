import { simpleEventsToCalendarEvents } from "../../../calendar-core/model/simpleEventsToCalendarEvents";
import type { SimpleEvent } from "../../../contracts";

function simpleEvent(overrides: Partial<SimpleEvent> = {}): SimpleEvent {
  return {
    id: "s1",
    title: "Write report",
    start: "2026-06-08T07:00:00.000Z",
    end: "2026-06-08T08:00:00.000Z",
    duration: 60,
    userId: "u",
    rrule: null,
    backgroundColor: "#111111",
    borderColor: "#222222",
    createdAt: "x",
    updatedAt: "x",
    extendedProps: {
      id: "x",
      plannerType: "task",
      eventType: "planner",
      completedStartTime: null,
      completedEndTime: null,
      parentId: null,
      eventId: "s1",
      locationId: "l1",
    },
    ...overrides,
  };
}

describe("simpleEventsToCalendarEvents", () => {
  it("maps a row onto an editable planner event, props passed through", () => {
    const row = simpleEvent();
    const [event] = simpleEventsToCalendarEvents([row]);
    expect(event).toEqual({
      kind: "planner",
      id: "s1",
      title: "Write report",
      start: new Date("2026-06-08T07:00:00.000Z"),
      end: new Date("2026-06-08T08:00:00.000Z"),
      editable: true,
      color: "#111111",
      borderColor: "#222222",
      props: row.extendedProps,
    });
    expect(event.props).toBe(row.extendedProps);
  });

  it("keeps null props as null", () => {
    const [event] = simpleEventsToCalendarEvents([
      simpleEvent({ extendedProps: null }),
    ]);
    expect(event.props).toBeNull();
  });

  it("drops rows whose start or end does not parse", () => {
    const events = simpleEventsToCalendarEvents([
      simpleEvent({ id: "bad-start", start: "not a date" }),
      simpleEvent({ id: "bad-end", end: "" }),
      simpleEvent({ id: "ok" }),
    ]);
    expect(events.map((e) => e.id)).toEqual(["ok"]);
  });
});
