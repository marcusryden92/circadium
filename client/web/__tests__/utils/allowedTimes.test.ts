import {
  parseAllowedTimes,
  serializeAllowedTimes,
  intersectIntervalWithAllowed,
  maxAllowedBlockMinutes,
  maxConstrainedBlockMinutes,
  parseEarliestStartDate,
} from "@/utils/allowedTimes";

// Local wall-clock anchors: 2026-01-05 is a Monday.
const MONDAY = new Date(2026, 0, 5, 0, 0, 0, 0);

function at(day: number, hours: number, minutes = 0): Date {
  const d = new Date(MONDAY);
  d.setDate(d.getDate() + day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe("normalizeAllowedTimesSettings / parseAllowedTimes", () => {
  it("returns null for malformed JSON, non-objects, and empty constraints", () => {
    expect(parseAllowedTimes(null)).toBeNull();
    expect(parseAllowedTimes("")).toBeNull();
    expect(parseAllowedTimes("not json")).toBeNull();
    expect(parseAllowedTimes("42")).toBeNull();
    expect(parseAllowedTimes(JSON.stringify({}))).toBeNull();
    expect(
      parseAllowedTimes(JSON.stringify({ days: [], ranges: [] })),
    ).toBeNull();
  });

  it("treats all seven days as no day constraint", () => {
    expect(
      parseAllowedTimes(JSON.stringify({ days: [0, 1, 2, 3, 4, 5, 6] })),
    ).toBeNull();
    expect(
      parseAllowedTimes(
        JSON.stringify({
          days: [0, 1, 2, 3, 4, 5, 6],
          ranges: [{ startTime: "09:00", endTime: "12:00" }],
        }),
      ),
    ).toEqual({
      days: null,
      ranges: [{ startTime: "09:00", endTime: "12:00" }],
    });
  });

  it("dedupes, sorts, and drops invalid day entries", () => {
    expect(
      parseAllowedTimes(JSON.stringify({ days: [5, 1, 5, 9, -1, 2.5] })),
    ).toEqual({ days: [1, 5], ranges: null });
  });

  it("drops invalid ranges and sorts by start time", () => {
    expect(
      parseAllowedTimes(
        JSON.stringify({
          ranges: [
            { startTime: "14:00", endTime: "16:00" },
            { startTime: "10:00", endTime: "10:00" }, // equal bounds
            { startTime: "9:00", endTime: "12:00" }, // bad format
            { startTime: "08:00", endTime: "09:30" },
          ],
        }),
      ),
    ).toEqual({
      days: null,
      ranges: [
        { startTime: "08:00", endTime: "09:30" },
        { startTime: "14:00", endTime: "16:00" },
      ],
    });
  });

  it("round-trips through serializeAllowedTimes", () => {
    const serialized = serializeAllowedTimes({
      days: [1, 3],
      ranges: [{ startTime: "09:00", endTime: "12:00" }],
    });
    expect(parseAllowedTimes(serialized)).toEqual({
      days: [1, 3],
      ranges: [{ startTime: "09:00", endTime: "12:00" }],
    });
    expect(serializeAllowedTimes({ days: null, ranges: null })).toBeNull();
  });
});

describe("intersectIntervalWithAllowed", () => {
  it("returns the whole interval for an empty chain", () => {
    const start = at(0, 8);
    const end = at(0, 20);
    expect(intersectIntervalWithAllowed(start, end, [])).toEqual([
      { start, end },
    ]);
  });

  it("clips to allowed days, merging consecutive full days", () => {
    // Monday 00:00 -> Thursday 00:00, allowed Mon+Tue only.
    const fragments = intersectIntervalWithAllowed(at(0, 0), at(3, 0), [
      { days: [1, 2], ranges: null },
    ]);
    expect(fragments).toEqual([{ start: at(0, 0), end: at(2, 0) }]);
  });

  it("fragments a slot into its time-of-day ranges", () => {
    const fragments = intersectIntervalWithAllowed(at(0, 8), at(0, 20), [
      {
        days: null,
        ranges: [
          { startTime: "09:00", endTime: "10:00" },
          { startTime: "14:00", endTime: "16:00" },
        ],
      },
    ]);
    expect(fragments).toEqual([
      { start: at(0, 9), end: at(0, 10) },
      { start: at(0, 14), end: at(0, 16) },
    ]);
  });

  it("anchors an overnight range to its start day", () => {
    const fragments = intersectIntervalWithAllowed(at(0, 0), at(2, 0), [
      { days: [1], ranges: [{ startTime: "22:00", endTime: "06:00" }] },
    ]);
    expect(fragments).toEqual([{ start: at(0, 22), end: at(1, 6) }]);
  });

  it("covers the range opening when an overnight span began the previous day", () => {
    // Range starts Tuesday 02:00; Monday's 22:00-06:00 span still covers it.
    const fragments = intersectIntervalWithAllowed(at(1, 2), at(1, 12), [
      { days: [1], ranges: [{ startTime: "22:00", endTime: "06:00" }] },
    ]);
    expect(fragments).toEqual([{ start: at(1, 2), end: at(1, 6) }]);
  });

  it("treats 23:59 as the end-of-day sentinel", () => {
    const fragments = intersectIntervalWithAllowed(at(0, 0), at(1, 0), [
      { days: [1], ranges: [{ startTime: "20:00", endTime: "23:59" }] },
    ]);
    expect(fragments).toEqual([{ start: at(0, 20), end: at(1, 0) }]);
  });

  it("intersects every settings object in the chain", () => {
    const fragments = intersectIntervalWithAllowed(at(0, 0), at(7, 0), [
      { days: [1, 2, 3], ranges: null },
      { days: null, ranges: [{ startTime: "10:00", endTime: "12:00" }] },
    ]);
    expect(fragments).toEqual([
      { start: at(0, 10), end: at(0, 12) },
      { start: at(1, 10), end: at(1, 12) },
      { start: at(2, 10), end: at(2, 12) },
    ]);
  });

  it("returns nothing for a disjoint chain", () => {
    expect(
      intersectIntervalWithAllowed(at(0, 0), at(7, 0), [
        { days: [1], ranges: null },
        { days: [2], ranges: null },
      ]),
    ).toEqual([]);
  });
});

describe("maxAllowedBlockMinutes", () => {
  it("is unbounded for an empty chain", () => {
    expect(maxAllowedBlockMinutes([])).toBe(Infinity);
  });

  it("measures consecutive allowed days as one block", () => {
    expect(maxAllowedBlockMinutes([{ days: [1, 2], ranges: null }])).toBe(
      2 * 24 * 60,
    );
  });

  it("chains a day run across the week seam", () => {
    // Fri + Sat + Sun are consecutive on the calendar even though the day
    // numbers wrap.
    expect(maxAllowedBlockMinutes([{ days: [5, 6, 0], ranges: null }])).toBe(
      3 * 24 * 60,
    );
  });

  it("bounds by the longest range", () => {
    expect(
      maxAllowedBlockMinutes([
        { days: null, ranges: [{ startTime: "09:00", endTime: "12:00" }] },
      ]),
    ).toBe(180);
  });

  it("chains ranges that meet across midnight", () => {
    expect(
      maxAllowedBlockMinutes([
        {
          days: null,
          ranges: [
            { startTime: "20:00", endTime: "00:00" },
            { startTime: "00:00", endTime: "06:00" },
          ],
        },
      ]),
    ).toBe(600);
  });

  it("returns Infinity when the pattern never breaks", () => {
    expect(
      maxAllowedBlockMinutes([
        { days: null, ranges: [{ startTime: "00:00", endTime: "23:59" }] },
      ]),
    ).toBe(Infinity);
  });

  it("intersects the chain before measuring", () => {
    expect(
      maxAllowedBlockMinutes([
        { days: [1], ranges: null },
        { days: [2], ranges: null },
      ]),
    ).toBe(0);
    expect(
      maxAllowedBlockMinutes([
        { days: [1], ranges: [{ startTime: "08:00", endTime: "18:00" }] },
        { days: null, ranges: [{ startTime: "10:00", endTime: "12:00" }] },
      ]),
    ).toBe(120);
  });
});

describe("maxConstrainedBlockMinutes", () => {
  // CategoryTimeWindow convention: day 0=Sunday, so 1 = Monday.
  const windowMonday = { day: 1, startTime: "09:00", endTime: "12:00" };

  it("returns 0 when allowed days and window days are disjoint", () => {
    expect(
      maxConstrainedBlockMinutes([{ days: [2], ranges: null }], [windowMonday]),
    ).toBe(0);
  });

  it("returns 0 for disjoint time-of-day ranges on a shared day", () => {
    expect(
      maxConstrainedBlockMinutes(
        [{ days: null, ranges: [{ startTime: "14:00", endTime: "16:00" }] }],
        [windowMonday],
      ),
    ).toBe(0);
  });

  it("measures the true weekly intersection", () => {
    expect(
      maxConstrainedBlockMinutes(
        [{ days: [1], ranges: [{ startTime: "10:00", endTime: "14:00" }] }],
        [windowMonday],
      ),
    ).toBe(120);
  });

  it("handles overnight windows across the day boundary", () => {
    // Window Mon 22:00 -> Tue 02:00; allowed Tuesday only => Tue 00:00-02:00.
    expect(
      maxConstrainedBlockMinutes(
        [{ days: [2], ranges: null }],
        [{ day: 1, startTime: "22:00", endTime: "02:00" }],
      ),
    ).toBe(120);
  });

  it("matches maxAllowedBlockMinutes when no windows are supplied", () => {
    expect(
      maxConstrainedBlockMinutes([{ days: [1, 2], ranges: null }], null),
    ).toBe(2 * 24 * 60);
    expect(maxConstrainedBlockMinutes([], null)).toBe(Infinity);
  });

  it("bounds by windows alone when the chain is empty", () => {
    expect(maxConstrainedBlockMinutes([], [windowMonday])).toBe(180);
  });
});

describe("parseEarliestStartDate", () => {
  it("parses valid dates and rejects garbage", () => {
    expect(parseEarliestStartDate(null)).toBeNull();
    expect(parseEarliestStartDate("")).toBeNull();
    expect(parseEarliestStartDate("not a date")).toBeNull();
    expect(
      parseEarliestStartDate("2026-01-08T10:30:00.000Z")?.getTime(),
    ).toBe(new Date("2026-01-08T10:30:00.000Z").getTime());
  });
});
