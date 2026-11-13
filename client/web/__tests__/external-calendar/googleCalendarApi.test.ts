import { mapGoogleEventsToExternalEvents } from "@/utils/external-calendar/googleCalendarApi";

const ARGS = {
  sourceId: "src-1",
  userId: "user-1",
  windowStart: new Date("2026-07-01T00:00:00.000Z"),
  windowEnd: new Date("2026-09-01T00:00:00.000Z"),
};

describe("mapGoogleEventsToExternalEvents", () => {
  it("maps a timed event with a deterministic id", () => {
    const [event] = mapGoogleEventsToExternalEvents(
      [
        {
          id: "abc123",
          status: "confirmed",
          summary: "Standup",
          start: { dateTime: "2026-07-10T09:00:00+02:00" },
          end: { dateTime: "2026-07-10T09:30:00+02:00" },
        },
      ],
      ARGS,
    );
    expect(event).toEqual({
      id: "src-1|abc123|2026-07-10T07:00:00.000Z",
      sourceId: "src-1",
      userId: "user-1",
      uid: "abc123",
      title: "Standup",
      start: "2026-07-10T07:00:00.000Z",
      end: "2026-07-10T07:30:00.000Z",
      allDay: false,
    });
  });

  it("uses the series id as uid for recurring instances", () => {
    const events = mapGoogleEventsToExternalEvents(
      [
        {
          id: "series1_20260710T070000Z",
          summary: "Weekly",
          recurringEventId: "series1",
          start: { dateTime: "2026-07-10T07:00:00Z" },
          end: { dateTime: "2026-07-10T08:00:00Z" },
        },
        {
          id: "series1_20260717T070000Z",
          summary: "Weekly",
          recurringEventId: "series1",
          start: { dateTime: "2026-07-17T07:00:00Z" },
          end: { dateTime: "2026-07-17T08:00:00Z" },
        },
      ],
      ARGS,
    );
    expect(events.map((e) => e.uid)).toEqual(["series1", "series1"]);
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it("marks date-only events all-day with the exclusive end honored", () => {
    const [event] = mapGoogleEventsToExternalEvents(
      [
        {
          id: "allday1",
          summary: "Conference",
          start: { date: "2026-07-20" },
          end: { date: "2026-07-22" },
        },
      ],
      ARGS,
    );
    expect(event.allDay).toBe(true);
    expect(event.start).toBe("2026-07-20T00:00:00.000Z");
    expect(event.end).toBe("2026-07-22T00:00:00.000Z");
  });

  it("titles summary-less events Busy (free/busy-only calendars)", () => {
    const [event] = mapGoogleEventsToExternalEvents(
      [
        {
          id: "fb1",
          start: { dateTime: "2026-07-10T07:00:00Z" },
          end: { dateTime: "2026-07-10T08:00:00Z" },
        },
      ],
      ARGS,
    );
    expect(event.title).toBe("Busy");
  });

  it("skips cancelled, out-of-window, and zero-length items", () => {
    const events = mapGoogleEventsToExternalEvents(
      [
        {
          id: "cancelled1",
          status: "cancelled",
          start: { dateTime: "2026-07-10T07:00:00Z" },
          end: { dateTime: "2026-07-10T08:00:00Z" },
        },
        {
          id: "past1",
          summary: "Too early",
          start: { dateTime: "2026-06-01T07:00:00Z" },
          end: { dateTime: "2026-06-01T08:00:00Z" },
        },
        {
          id: "zero1",
          summary: "Instantaneous",
          start: { dateTime: "2026-07-10T07:00:00Z" },
          end: { dateTime: "2026-07-10T07:00:00Z" },
        },
        {
          id: "keep1",
          summary: "Kept",
          start: { dateTime: "2026-07-10T09:00:00Z" },
          end: { dateTime: "2026-07-10T10:00:00Z" },
        },
      ],
      ARGS,
    );
    expect(events.map((e) => e.uid)).toEqual(["keep1"]);
  });
});
