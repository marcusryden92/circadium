import {
  createSpan,
  moveSpan,
  resizeSpan,
} from "@/components/calendar/timeGrid/timeGridGeometry";

// Pinned to a DST zone so the assertions bite on a UTC CI runner too.
// Europe/Stockholm springs forward on Sunday 2026-03-29.
const previousTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Stockholm";
});
afterAll(() => {
  process.env.TZ = previousTz;
});

const at = (d: number, h = 0, m = 0) => new Date(2026, 2, d, h, m);
const hit = (d: number, minute: number) => ({ day: at(d), minute });

describe("drag spans across a DST change keep the clock time", () => {
  it("a move from Friday onto the spring-forward Sunday", () => {
    const event = { start: at(27, 10), end: at(27, 11) };
    expect(moveSpan(event, hit(27, 600), hit(29, 600))).toEqual({
      start: at(29, 10),
      end: at(29, 11),
    });
  });

  it("an end-edge resize across the skipped hour", () => {
    const event = { start: at(29, 0, 30), end: at(29, 1, 30) };
    expect(resizeSpan(event, hit(29, 90), hit(29, 300), "end")).toEqual({
      start: at(29, 0, 30),
      end: at(29, 5),
    });
  });

  it("a create on the spring-forward day", () => {
    expect(createSpan(hit(29, 600), hit(29, 660))).toEqual({
      start: at(29, 10),
      end: at(29, 11),
    });
  });
});

describe("create joins hits across columns", () => {
  it("an evening-to-morning drag is one overnight span", () => {
    expect(createSpan(hit(23, 22 * 60), hit(24, 2 * 60))).toEqual({
      start: at(23, 22),
      end: at(24, 2),
    });
    expect(createSpan(hit(24, 2 * 60), hit(23, 22 * 60))).toEqual({
      start: at(23, 22),
      end: at(24, 2),
    });
  });
});
