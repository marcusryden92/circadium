import { mapGraphEventsToExternalEvents } from "@/utils/external-calendar/microsoftGraphApi";

const ARGS = {
  sourceId: "src-1",
  userId: "user-1",
  windowStart: new Date("2026-07-01T00:00:00.000Z"),
  windowEnd: new Date("2026-09-01T00:00:00.000Z"),
};

describe("mapGraphEventsToExternalEvents", () => {
  it("maps a timed event, parsing Graph's offset-less UTC datetime", () => {
    const [event] = mapGraphEventsToExternalEvents(
      [
        {
          id: "abc123",
          subject: "Standup",
          start: { dateTime: "2026-07-10T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-10T07:30:00.0000000", timeZone: "UTC" },
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

  it("uses the series master id as uid for recurring instances", () => {
    const events = mapGraphEventsToExternalEvents(
      [
        {
          id: "occ1",
          subject: "Weekly",
          seriesMasterId: "series1",
          start: { dateTime: "2026-07-10T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-10T08:00:00.0000000", timeZone: "UTC" },
        },
        {
          id: "occ2",
          subject: "Weekly",
          seriesMasterId: "series1",
          start: { dateTime: "2026-07-17T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-17T08:00:00.0000000", timeZone: "UTC" },
        },
      ],
      ARGS,
    );
    expect(events.map((e) => e.uid)).toEqual(["series1", "series1"]);
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it("marks isAllDay events all-day with the exclusive end honored", () => {
    const [event] = mapGraphEventsToExternalEvents(
      [
        {
          id: "allday1",
          subject: "Conference",
          isAllDay: true,
          start: { dateTime: "2026-07-20T00:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-22T00:00:00.0000000", timeZone: "UTC" },
        },
      ],
      ARGS,
    );
    expect(event.allDay).toBe(true);
    expect(event.start).toBe("2026-07-20T00:00:00.000Z");
    expect(event.end).toBe("2026-07-22T00:00:00.000Z");
  });

  it("titles subject-less events Busy (private events)", () => {
    const [event] = mapGraphEventsToExternalEvents(
      [
        {
          id: "private1",
          start: { dateTime: "2026-07-10T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-10T08:00:00.0000000", timeZone: "UTC" },
        },
      ],
      ARGS,
    );
    expect(event.title).toBe("Busy");
  });

  it("parses explicit-offset datetimes unchanged", () => {
    const [event] = mapGraphEventsToExternalEvents(
      [
        {
          id: "offset1",
          subject: "Offset",
          start: { dateTime: "2026-07-10T09:00:00+02:00" },
          end: { dateTime: "2026-07-10T09:30:00+02:00" },
        },
      ],
      ARGS,
    );
    expect(event.start).toBe("2026-07-10T07:00:00.000Z");
    expect(event.end).toBe("2026-07-10T07:30:00.000Z");
  });

  it("skips cancelled, out-of-window, and zero-length items", () => {
    const events = mapGraphEventsToExternalEvents(
      [
        {
          id: "cancelled1",
          isCancelled: true,
          start: { dateTime: "2026-07-10T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-10T08:00:00.0000000", timeZone: "UTC" },
        },
        {
          id: "past1",
          subject: "Too early",
          start: { dateTime: "2026-06-01T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-06-01T08:00:00.0000000", timeZone: "UTC" },
        },
        {
          id: "zero1",
          subject: "Instantaneous",
          start: { dateTime: "2026-07-10T07:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-10T07:00:00.0000000", timeZone: "UTC" },
        },
        {
          id: "keep1",
          subject: "Kept",
          start: { dateTime: "2026-07-10T09:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-07-10T10:00:00.0000000", timeZone: "UTC" },
        },
      ],
      ARGS,
    );
    expect(events.map((e) => e.uid)).toEqual(["keep1"]);
  });
});
