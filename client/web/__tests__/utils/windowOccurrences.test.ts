import { upcomingWindowOccurrences } from "@/utils/windowOccurrences";
import { occurrenceKey } from "@/utils/planRecurrence";

// JS getDay(): 0=Sun ... 6=Sat.
const TUESDAY = 2;
const WINDOW = { day: TUESDAY, startTime: "09:00" };

describe("upcomingWindowOccurrences", () => {
  it("returns the next N rule occurrences from a given instant", () => {
    const from = new Date("2026-01-05T08:00:00"); // a Monday
    const result = upcomingWindowOccurrences(WINDOW, from, 3);
    expect(result.map((d) => occurrenceKey(d))).toEqual([
      "2026-01-06T09:00",
      "2026-01-13T09:00",
      "2026-01-20T09:00",
    ]);
  });

  it("skips an occurrence whose start has already passed", () => {
    const from = new Date("2026-01-06T10:00:00"); // Tuesday, past 09:00
    const result = upcomingWindowOccurrences(WINDOW, from, 2);
    expect(result.map((d) => occurrenceKey(d))).toEqual([
      "2026-01-13T09:00",
      "2026-01-20T09:00",
    ]);
  });

  it("keeps the list full when excluded keys are skipped", () => {
    const from = new Date("2026-01-05T08:00:00");
    const exclude = new Set(["2026-01-13T09:00"]);
    const result = upcomingWindowOccurrences(WINDOW, from, 3, exclude);
    expect(result.map((d) => occurrenceKey(d))).toEqual([
      "2026-01-06T09:00",
      "2026-01-20T09:00",
      "2026-01-27T09:00",
    ]);
  });

  it("walks cleanly across a month boundary", () => {
    const from = new Date("2026-01-26T00:00:00");
    const result = upcomingWindowOccurrences(WINDOW, from, 2);
    expect(result.map((d) => occurrenceKey(d))).toEqual([
      "2026-01-27T09:00",
      "2026-02-03T09:00",
    ]);
  });

  it("returns empty for a malformed startTime", () => {
    const from = new Date("2026-01-05T08:00:00");
    expect(
      upcomingWindowOccurrences({ day: TUESDAY, startTime: "bogus" }, from, 3),
    ).toEqual([]);
  });
});
