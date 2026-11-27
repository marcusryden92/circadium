import {
  computeSegVCoords,
  computeFgSegPlacements,
} from "../../../../calendar-core/layout/placement/placement";

describe("computeSegVCoords", () => {
  it("computes pixel coordinates from hourHeight", () => {
    const hourHeight = 60;
    const segs = [
      { startMinutes: 0, endMinutes: 60 },
      { startMinutes: 540, endMinutes: 600 },
    ];
    const coords = computeSegVCoords(segs, hourHeight);
    expect(coords[0]).toEqual({ start: 0, end: 60 });
    expect(coords[1]).toEqual({ start: 540, end: 600 });
  });

  it("enforces eventMinHeight", () => {
    const hourHeight = 60;
    const segs = [{ startMinutes: 60, endMinutes: 65 }];
    const coords = computeSegVCoords(segs, hourHeight, 20);
    expect(coords[0].start).toBe(60);
    expect(coords[0].end).toBe(80); // max(60+20, 65) = 80
  });

  it("works with fractional hourHeight", () => {
    const hourHeight = 48;
    const segs = [{ startMinutes: 0, endMinutes: 60 }];
    const coords = computeSegVCoords(segs, hourHeight);
    expect(coords[0].start).toBe(0);
    expect(coords[0].end).toBe(48);
  });
});

describe("computeFgSegPlacements", () => {
  const hourHeight = 60;

  it("places non-overlapping segments at full width", () => {
    const segs = [
      { startMinutes: 0, endMinutes: 60 },
      { startMinutes: 120, endMinutes: 180 },
    ];
    const { segPlacements } = computeFgSegPlacements(segs, hourHeight);
    expect(segPlacements).toHaveLength(2);
    for (const p of segPlacements) {
      expect(p.rect).not.toBeNull();
      expect(p.rect!.levelCoord).toBe(0);
      expect(p.rect!.thickness).toBe(1);
    }
  });

  it("places overlapping segments side by side", () => {
    const segs = [
      { startMinutes: 60, endMinutes: 180 },
      { startMinutes: 120, endMinutes: 240 },
    ];
    const { segPlacements } = computeFgSegPlacements(segs, hourHeight);
    expect(segPlacements).toHaveLength(2);

    const rects = segPlacements.map((p) => p.rect!);
    expect(rects[0].levelCoord).toBe(0);
    expect(rects[0].thickness).toBeCloseTo(0.5);
    expect(rects[1].levelCoord).toBeCloseTo(0.5);
    expect(rects[1].thickness).toBeCloseTo(0.5);
  });

  it("zero-duration segment gets null rect", () => {
    const segs = [
      { startMinutes: 100, endMinutes: 100 },
    ];
    const { segPlacements } = computeFgSegPlacements(segs, hourHeight);
    expect(segPlacements).toHaveLength(1);
    expect(segPlacements[0].rect).toBeNull();
  });
});
