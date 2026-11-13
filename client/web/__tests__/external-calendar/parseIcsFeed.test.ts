/**
 * @jest-environment node
 *
 * node-ical touches global fetch at module load, which the jsdom test
 * environment doesn't provide; this suite is DOM-free anyway.
 */
import { parseIcsFeed } from "@/utils/external-calendar/parseIcsFeed";

const SOURCE_ID = "src-1";
const USER_ID = "user-1";
const WINDOW_START = new Date("2026-07-01T00:00:00Z");
const WINDOW_END = new Date("2026-09-01T00:00:00Z");

function ics(lines: string[]): string {
  return ["BEGIN:VCALENDAR", "PRODID:-//Test//EN", "VERSION:2.0", ...lines, "END:VCALENDAR"].join(
    "\r\n",
  );
}

function parse(lines: string[]) {
  return parseIcsFeed({
    icsText: ics(lines),
    sourceId: SOURCE_ID,
    userId: USER_ID,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  });
}

describe("parseIcsFeed", () => {
  it("parses a single UTC event with deterministic id", () => {
    const { events } = parse([
      "BEGIN:VEVENT",
      "UID:single-1",
      "DTSTAMP:20260701T000000Z",
      "DTSTART:20260710T120000Z",
      "DTEND:20260710T130000Z",
      "SUMMARY:Dentist",
      "END:VEVENT",
    ]);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.start).toBe("2026-07-10T12:00:00.000Z");
    expect(event.end).toBe("2026-07-10T13:00:00.000Z");
    expect(event.title).toBe("Dentist");
    expect(event.uid).toBe("single-1");
    expect(event.allDay).toBe(false);
    expect(event.id).toBe(`${SOURCE_ID}|single-1|2026-07-10T12:00:00.000Z`);
    expect(event.sourceId).toBe(SOURCE_ID);
    expect(event.userId).toBe(USER_ID);
  });

  it("expands a TZID weekly rule with EXDATE and a moved RECURRENCE-ID override", () => {
    const { events } = parse([
      "BEGIN:VEVENT",
      "UID:weekly-1",
      "DTSTAMP:20260701T000000Z",
      "DTSTART;TZID=Europe/Stockholm:20260706T090000",
      "DTEND;TZID=Europe/Stockholm:20260706T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4",
      "EXDATE;TZID=Europe/Stockholm:20260713T090000",
      "SUMMARY:Standup",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:weekly-1",
      "RECURRENCE-ID;TZID=Europe/Stockholm:20260720T090000",
      "DTSTAMP:20260701T000000Z",
      "DTSTART;TZID=Europe/Stockholm:20260720T140000",
      "DTEND;TZID=Europe/Stockholm:20260720T150000",
      "SUMMARY:Standup (moved)",
      "END:VEVENT",
    ]);

    // COUNT=4 minus one EXDATE, with the third occurrence moved.
    const starts = events.map((e) => e.start);
    expect(starts).toContain("2026-07-06T07:00:00.000Z");
    expect(starts).not.toContain("2026-07-13T07:00:00.000Z");
    expect(starts).toContain("2026-07-27T07:00:00.000Z");

    const moved = events.find((e) => e.title === "Standup (moved)");
    expect(moved).toBeDefined();
    expect(moved!.start).toBe("2026-07-20T12:00:00.000Z");
    expect(moved!.end).toBe("2026-07-20T13:00:00.000Z");
    expect(events).toHaveLength(3);
  });

  it("marks date-only events all-day with a one-day default span", () => {
    const { events } = parse([
      "BEGIN:VEVENT",
      "UID:allday-1",
      "DTSTAMP:20260701T000000Z",
      "DTSTART;VALUE=DATE:20260715",
      "SUMMARY:Holiday",
      "END:VEVENT",
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    const spanMs =
      new Date(events[0].end).getTime() - new Date(events[0].start).getTime();
    expect(spanMs).toBe(24 * 60 * 60 * 1000);
  });

  it("skips cancelled events and events outside the window", () => {
    const { events } = parse([
      "BEGIN:VEVENT",
      "UID:cancelled-1",
      "DTSTAMP:20260701T000000Z",
      "DTSTART:20260710T120000Z",
      "DTEND:20260710T130000Z",
      "STATUS:CANCELLED",
      "SUMMARY:Cancelled thing",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:far-future",
      "DTSTAMP:20260701T000000Z",
      "DTSTART:20261225T120000Z",
      "DTEND:20261225T130000Z",
      "SUMMARY:Christmas thing",
      "END:VEVENT",
    ]);

    expect(events).toHaveLength(0);
  });

  it("extracts the calendar display name", () => {
    const { calendarName } = parse([
      "X-WR-CALNAME:Team calendar",
      "BEGIN:VEVENT",
      "UID:single-1",
      "DTSTAMP:20260701T000000Z",
      "DTSTART:20260710T120000Z",
      "DTEND:20260710T130000Z",
      "SUMMARY:Dentist",
      "END:VEVENT",
    ]);

    expect(calendarName).toBe("Team calendar");
  });
});
