import { autoScrollSpeed } from "../../../calendar-core/interaction/autoScroll";

describe("autoScrollSpeed", () => {
  const viewportHeight = 600;

  it("returns 0 in the middle of the viewport", () => {
    expect(autoScrollSpeed(300, viewportHeight)).toBe(0);
  });

  it("returns negative (scroll up) near the top edge", () => {
    const speed = autoScrollSpeed(10, viewportHeight);
    expect(speed).toBeLessThan(0);
  });

  it("returns positive (scroll down) near the bottom edge", () => {
    const speed = autoScrollSpeed(590, viewportHeight);
    expect(speed).toBeGreaterThan(0);
  });

  it("returns max speed at the very edge", () => {
    expect(autoScrollSpeed(0, viewportHeight)).toBe(-25);
    expect(autoScrollSpeed(viewportHeight, viewportHeight)).toBe(25);
  });

  it("returns 0 just outside the edge zone", () => {
    expect(autoScrollSpeed(50, viewportHeight)).toBe(0);
    expect(autoScrollSpeed(550, viewportHeight)).toBe(0);
  });

  it("returns 0 for zero viewport", () => {
    expect(autoScrollSpeed(100, 0)).toBe(0);
  });

  it("scales linearly within the edge zone", () => {
    // 25px into a 50px zone = halfway = half speed
    const speed = autoScrollSpeed(25, viewportHeight);
    expect(speed).toBeCloseTo(-12.5, 1);
  });

  it("custom edge zone and max speed", () => {
    const speed = autoScrollSpeed(0, 600, 100, 50);
    expect(speed).toBe(-50);
  });
});
