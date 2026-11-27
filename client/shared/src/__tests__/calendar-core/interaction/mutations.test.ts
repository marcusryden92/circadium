import { addDays } from "date-fns";
import {
  computeMoveDelta,
  computeResizeDelta,
  computeCreateRange,
} from "../../../calendar-core/interaction/mutations";
import type { HitResult } from "../../../calendar-core/layout/hitTest";

const monday = new Date(2026, 10, 23);
const tuesday = addDays(monday, 1);

describe("computeMoveDelta", () => {
  it("same-day offset", () => {
    const start: HitResult = { day: monday, minute: 600 };
    const end: HitResult = { day: monday, minute: 660 };
    const delta = computeMoveDelta(start, end);
    expect(delta.dayOffset).toBe(0);
    expect(delta.minuteOffset).toBe(60);
  });

  it("cross-day offset", () => {
    const start: HitResult = { day: monday, minute: 600 };
    const end: HitResult = { day: tuesday, minute: 540 };
    const delta = computeMoveDelta(start, end);
    expect(delta.dayOffset).toBe(1);
    expect(delta.minuteOffset).toBe(-60);
  });

  it("zero delta when both hits are the same", () => {
    const hit: HitResult = { day: monday, minute: 600 };
    const delta = computeMoveDelta(hit, hit);
    expect(delta.dayOffset).toBe(0);
    expect(delta.minuteOffset).toBe(0);
  });

  it("negative day offset for dragging left", () => {
    const start: HitResult = { day: tuesday, minute: 600 };
    const end: HitResult = { day: monday, minute: 600 };
    const delta = computeMoveDelta(start, end);
    expect(delta.dayOffset).toBe(-1);
    expect(delta.minuteOffset).toBe(0);
  });
});

describe("computeResizeDelta", () => {
  it("resize-end: longer by 30 minutes", () => {
    const start: HitResult = { day: monday, minute: 660 };
    const end: HitResult = { day: monday, minute: 690 };
    const delta = computeResizeDelta(start, end, "end");
    expect(delta.durationDelta).toBe(30);
    expect(delta.edge).toBe("end");
  });

  it("resize-start: moving start earlier extends duration", () => {
    const start: HitResult = { day: monday, minute: 600 };
    const end: HitResult = { day: monday, minute: 540 };
    const delta = computeResizeDelta(start, end, "start");
    expect(delta.durationDelta).toBe(60);
    expect(delta.edge).toBe("start");
  });

  it("resize-start: moving start later shortens duration", () => {
    const start: HitResult = { day: monday, minute: 600 };
    const end: HitResult = { day: monday, minute: 630 };
    const delta = computeResizeDelta(start, end, "start");
    expect(delta.durationDelta).toBe(-30);
    expect(delta.edge).toBe("start");
  });
});

describe("computeCreateRange", () => {
  it("produces a range from two hits", () => {
    const start: HitResult = { day: monday, minute: 540 };
    const end: HitResult = { day: monday, minute: 660 };
    const range = computeCreateRange(start, end);
    expect(range.day).toBe(monday);
    expect(range.startMinute).toBe(540);
    expect(range.endMinute).toBe(660);
  });

  it("swaps start > end so startMinute is always smaller", () => {
    const start: HitResult = { day: monday, minute: 660 };
    const end: HitResult = { day: monday, minute: 540 };
    const range = computeCreateRange(start, end);
    expect(range.startMinute).toBe(540);
    expect(range.endMinute).toBe(660);
  });
});
