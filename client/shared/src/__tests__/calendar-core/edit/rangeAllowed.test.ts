import { rangeAllowed } from "../../../calendar-core/edit/types";

describe("rangeAllowed", () => {
  it("valid 1-hour range", () => {
    const start = new Date(2026, 10, 23, 10, 0);
    const end = new Date(2026, 10, 23, 11, 0);
    expect(rangeAllowed(start, end)).toBe(true);
  });

  it("exactly 24 hours is allowed", () => {
    const start = new Date(2026, 10, 23, 0, 0);
    const end = new Date(2026, 10, 24, 0, 0);
    expect(rangeAllowed(start, end)).toBe(true);
  });

  it("over 24 hours is rejected", () => {
    const start = new Date(2026, 10, 23, 0, 0);
    const end = new Date(2026, 10, 24, 0, 1);
    expect(rangeAllowed(start, end)).toBe(false);
  });

  it("end before start is rejected", () => {
    const start = new Date(2026, 10, 23, 11, 0);
    const end = new Date(2026, 10, 23, 10, 0);
    expect(rangeAllowed(start, end)).toBe(false);
  });

  it("zero-duration (same start and end) is rejected", () => {
    const t = new Date(2026, 10, 23, 10, 0);
    expect(rangeAllowed(t, t)).toBe(false);
  });

  it("5-minute range is allowed", () => {
    const start = new Date(2026, 10, 23, 10, 0);
    const end = new Date(2026, 10, 23, 10, 5);
    expect(rangeAllowed(start, end)).toBe(true);
  });
});
