import {
  classifyPointerGesture,
  pinchZoomDelta,
  clientToCanvasPoint,
  canvasPointToClient,
  type PointerGestureEvent,
} from "@/hooks/useCanvasGestures";
import {
  mindmapZoomToScale,
  MINDMAP_ZOOM_MIN_SCALE,
  MINDMAP_ZOOM_MAX_SCALE,
} from "@/app/(protected)/mindmap/_lib/mindmapModel";
import {
  ZOOM_MIN_PX_PER_DAY,
  ZOOM_MAX_PX_PER_DAY,
} from "@/app/(protected)/graph/_lib/graphModel";

const OPTS = { tapSlopPx: 8, longPressMs: 300 };

// Mirror of the graph page's private zoomToPxPerDay, kept here so the test
// exercises the real invariant against the exported range constants.
const zoomToPxPerDay = (t: number): number =>
  ZOOM_MIN_PX_PER_DAY *
  Math.pow(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY, t / 100);

describe("classifyPointerGesture", () => {
  it("classifies a quick in-place press as a tap", () => {
    const events: PointerGestureEvent[] = [
      { type: "down", pointerId: 1, x: 100, y: 100, t: 0 },
      { type: "up", pointerId: 1, x: 102, y: 101, t: 120 },
    ];
    expect(classifyPointerGesture(events, OPTS)).toBe("tap");
  });

  it("classifies a held in-place press as a long-press", () => {
    const events: PointerGestureEvent[] = [
      { type: "down", pointerId: 1, x: 100, y: 100, t: 0 },
      { type: "move", pointerId: 1, x: 103, y: 100, t: 200 },
      { type: "up", pointerId: 1, x: 103, y: 100, t: 400 },
    ];
    expect(classifyPointerGesture(events, OPTS)).toBe("longpress");
  });

  it("classifies movement past the slop before the timer as a drag", () => {
    const events: PointerGestureEvent[] = [
      { type: "down", pointerId: 1, x: 100, y: 100, t: 0 },
      { type: "move", pointerId: 1, x: 140, y: 100, t: 80 },
      { type: "up", pointerId: 1, x: 200, y: 100, t: 160 },
    ];
    expect(classifyPointerGesture(events, OPTS)).toBe("drag");
  });

  it("treats movement only after the long-press fires as a long-press", () => {
    const events: PointerGestureEvent[] = [
      { type: "down", pointerId: 1, x: 100, y: 100, t: 0 },
      { type: "move", pointerId: 1, x: 160, y: 100, t: 350 },
      { type: "up", pointerId: 1, x: 220, y: 100, t: 500 },
    ];
    expect(classifyPointerGesture(events, OPTS)).toBe("longpress");
  });

  it("classifies two concurrent pointers as a pinch", () => {
    const events: PointerGestureEvent[] = [
      { type: "down", pointerId: 1, x: 100, y: 100, t: 0 },
      { type: "down", pointerId: 2, x: 200, y: 100, t: 20 },
      { type: "move", pointerId: 2, x: 260, y: 100, t: 60 },
      { type: "up", pointerId: 1, x: 100, y: 100, t: 120 },
      { type: "up", pointerId: 2, x: 260, y: 100, t: 140 },
    ];
    expect(classifyPointerGesture(events, OPTS)).toBe("pinch");
  });

  it("stays a tap right below the slop boundary", () => {
    const events: PointerGestureEvent[] = [
      { type: "down", pointerId: 1, x: 100, y: 100, t: 0 },
      { type: "move", pointerId: 1, x: 105, y: 100, t: 40 },
      { type: "up", pointerId: 1, x: 105, y: 100, t: 90 },
    ];
    expect(classifyPointerGesture(events, OPTS)).toBe("tap");
  });
});

describe("coordinate mapping", () => {
  it("maps client coordinates to element-local points and back", () => {
    const rect = { left: 30, top: 50 };
    expect(clientToCanvasPoint(rect, 130, 90)).toEqual({ x: 100, y: 40 });
    expect(canvasPointToClient(rect, { x: 100, y: 40 })).toEqual({
      clientX: 130,
      clientY: 90,
    });
  });
});

describe("pinchZoomDelta", () => {
  const logRange = Math.log(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY);

  it("is zero for a unit ratio", () => {
    expect(pinchZoomDelta(1, logRange)).toBe(0);
  });

  it("is monotonic in the ratio", () => {
    expect(pinchZoomDelta(2, logRange)).toBeGreaterThan(
      pinchZoomDelta(1.5, logRange),
    );
    expect(pinchZoomDelta(0.5, logRange)).toBeLessThan(0);
  });

  it("guards degenerate inputs", () => {
    expect(pinchZoomDelta(0, logRange)).toBe(0);
    expect(pinchZoomDelta(2, 0)).toBe(0);
  });

  it("reproduces an f-times change through the graph zoom mapping", () => {
    const range = Math.log(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY);
    const startZoom = 40;
    const f = 1.75;
    const nextZoom = startZoom + pinchZoomDelta(f, range);
    expect(zoomToPxPerDay(nextZoom) / zoomToPxPerDay(startZoom)).toBeCloseTo(
      f,
      5,
    );
  });

  it("reproduces an f-times change through the mindmap zoom mapping", () => {
    const range = Math.log(MINDMAP_ZOOM_MAX_SCALE / MINDMAP_ZOOM_MIN_SCALE);
    const startZoom = 55;
    const f = 0.6;
    const nextZoom = startZoom + pinchZoomDelta(f, range);
    expect(
      mindmapZoomToScale(nextZoom) / mindmapZoomToScale(startZoom),
    ).toBeCloseTo(f, 5);
  });
});
