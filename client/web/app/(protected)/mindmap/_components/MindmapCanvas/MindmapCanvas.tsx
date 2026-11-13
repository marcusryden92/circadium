"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme, vars } from "@/components/ui";
import {
  useCanvasGestures,
  pinchZoomDelta,
  type CanvasGesturePoint,
  type CanvasPinchInfo,
} from "@/hooks/useCanvasGestures";
import type {
  MindmapKind,
  MindmapLaidNode,
  MindmapLayout,
} from "../../_lib/mindmapModel";
import {
  MINDMAP_ZOOM_MIN_SCALE,
  MINDMAP_ZOOM_MAX_SCALE,
} from "../../_lib/mindmapModel";
import {
  container as containerClass,
  canvas as canvasClass,
  openChip as openChipClass,
} from "./MindmapCanvas.css";

type MindmapCanvasProps = {
  layout: MindmapLayout;
  scale: number;
  // Bumped by the page when the layout mode switches, to re-center and refit.
  refitToken?: string | number;
  // Touch mode (mobile): the gesture recognizer owns pan/pinch/tap instead of
  // the mouse pan + hover focus.
  touch?: boolean;
  onZoomDelta: (delta: number) => void;
  onFit: (viewportWidth: number, viewportHeight: number) => void;
};

const TAU = Math.PI * 2;
const MAX_DPR = 2;
const MINDMAP_LOG_RANGE = Math.log(
  MINDMAP_ZOOM_MAX_SCALE / MINDMAP_ZOOM_MIN_SCALE,
);

// Hovering a branch (connector) focuses it like hovering the node it feeds,
// within this screen-space tolerance. Sampled coarsely — plenty for hover.
const HOVER_EDGE_TOL_PX = 7;
const EDGE_SAMPLES = 14;

// Leaving a node holds the dim for this long before everything brightens
// again, so a glance from one node to the next doesn't flash the whole map.
const FOCUS_CLEAR_DELAY_MS = 200;

// Squared distance from (px,py) to segment a->b — squared to skip the sqrt in
// the hit-test hot loop.
function pointSegDist2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

type Colors = {
  tileFill: string;
  paper: string;
  ink: string;
  inkSoft: string;
  muted: string;
  fontFamily: string;
};

// Per-kind draw spec: pill padding, dot radius, font, and which resolved
// color the label uses.
const KIND: Record<
  MindmapKind,
  { padL: number; dotR: number; font: string; text: keyof Colors }
> = {
  root: { padL: 18, dotR: 0, font: "650 40px", text: "ink" },
  role: { padL: 11, dotR: 4.5, font: "650 13px", text: "ink" },
  category: { padL: 11, dotR: 3.5, font: "550 12px", text: "ink" },
  item: { padL: 11, dotR: 4, font: "500 11.5px", text: "ink" },
  leaf: { padL: 9, dotR: 3, font: "450 11px", text: "inkSoft" },
};

type DrawNode = {
  id: string;
  kind: MindmapKind;
  completed: boolean;
  href: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  cy: number;
  fill: string;
  border: string;
  dotR: number;
  dotX: number;
  dotColor: string;
  borderW: number;
  label: string;
  labelX: number;
  labelFont: string;
  textColor: string;
  countText: string;
  countX: number;
  countColor: string;
  countFont: string;
};

type DrawEdge = {
  x1: number;
  y1: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x2: number;
  y2: number;
  fromId: string;
  toId: string;
  stroke: string;
  width: number;
};

type DrawList = { nodes: DrawNode[]; edges: DrawEdge[] };

// Resolve the themed CSS custom properties to concrete color strings the
// canvas can use — read back through a probe so the current theme applies.
function resolveColors(host: HTMLElement): Colors {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  host.appendChild(probe);
  const read = (token: string) => {
    probe.style.color = token;
    return getComputedStyle(probe).color;
  };
  const colors: Colors = {
    tileFill: read(vars.tileFill),
    paper: read(vars.paper),
    ink: read(vars.ink),
    inkSoft: read(vars.inkSoft),
    muted: read(vars.muted),
    fontFamily: "",
  };
  probe.style.fontFamily = vars.font.ui;
  colors.fontFamily = getComputedStyle(probe).fontFamily || "sans-serif";
  host.removeChild(probe);
  return colors;
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (
    trimmed.length > 0 &&
    ctx.measureText(`${trimmed}…`).width > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length ? `${trimmed}…` : "…";
}

// Bake per-node draw data once (positions, ellipsized labels, resolved
// colors) so the hot draw loop only fills paths and text.
// Branch stroke weight tapers by the depth of the edge's child: a thick trunk
// out to each role, thinning down to a hairline twig at the leaves.
const EDGE_WIDTH: Record<MindmapKind, number> = {
  root: 3.4,
  role: 3.4,
  category: 2.2,
  item: 1.7,
  leaf: 1.1,
};

function buildDrawList(
  layout: MindmapLayout,
  colors: Colors,
  mctx: CanvasRenderingContext2D,
): DrawList {
  const kindById = new Map<string, MindmapKind>();
  for (const laid of layout.nodes) kindById.set(laid.node.id, laid.node.kind);

  const nodes = layout.nodes.map((laid: MindmapLaidNode): DrawNode => {
    const n = laid.node;
    const spec = KIND[n.kind];
    const x = laid.x - laid.w / 2;
    const y = laid.y - laid.h / 2;
    let labelX = x + spec.padL;
    let dotX = 0;
    if (spec.dotR > 0) {
      dotX = labelX + spec.dotR;
      labelX += spec.dotR * 2 + 6;
    }
    let rightX = x + laid.w - spec.padL;
    let countText = "";
    const countX = rightX;
    if ((n.kind === "role" || n.kind === "category") && n.itemCount > 0) {
      countText = String(n.itemCount);
      mctx.font = `400 10px ${colors.fontFamily}`;
      rightX -= mctx.measureText(countText).width + 6;
    }
    const labelFont = `${spec.font} ${colors.fontFamily}`;
    mctx.font = labelFont;
    const isRoot = n.kind === "root";
    return {
      id: n.id,
      kind: n.kind,
      completed: n.completed,
      href: n.href,
      x,
      y,
      w: laid.w,
      h: laid.h,
      cy: laid.y,
      // The root reads as a paper coin; every other card sits on the tile fill.
      fill: isRoot ? colors.paper : colors.tileFill,
      // Ink borders (the readable text ink) outline every card so they stay
      // legible against the canvas; the root's ring is a touch heavier.
      border: colors.ink,
      borderW: isRoot ? 1 : n.kind === "role" ? 1.8 : 1,
      dotR: spec.dotR,
      dotX,
      dotColor: n.color ?? colors.muted,
      label: ellipsize(mctx, n.label, rightX - labelX),
      labelX,
      labelFont,
      textColor: colors[spec.text],
      countText,
      countX,
      countColor: colors.muted,
      countFont: `400 10px ${colors.fontFamily}`,
    };
  });

  const edges = layout.edges.map(
    (e): DrawEdge => ({
      x1: e.x1,
      y1: e.y1,
      c1x: e.c1x,
      c1y: e.c1y,
      c2x: e.c2x,
      c2y: e.c2y,
      x2: e.x2,
      y2: e.y2,
      fromId: e.fromId,
      toId: e.toId,
      stroke: e.color ?? colors.muted,
      width: EDGE_WIDTH[kindById.get(e.toId) ?? "item"],
    }),
  );

  return { nodes, edges };
}

function pillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = Math.min(h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function MindmapCanvas({
  layout,
  scale,
  refitToken,
  touch = false,
  onZoomDelta,
  onFit,
}: MindmapCanvasProps) {
  const { dark } = useTheme();
  const router = useRouter();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);

  const [colors, setColors] = useState<Colors | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeId;
  const chipRef = useRef<HTMLButtonElement>(null);
  const selectedDrawNodeRef = useRef<DrawNode | null>(null);

  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const prevScaleRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  const pivotRef = useRef<{ x: number; y: number } | null>(null);
  const focusRef = useRef<Set<string> | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const clearFocusTimerRef = useRef<number | null>(null);
  const isPanningRef = useRef(false);
  const didInitRef = useRef(false);
  const rafRef = useRef(0);
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;
  const onZoomDeltaRef = useRef(onZoomDelta);
  onZoomDeltaRef.current = onZoomDelta;

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const panTeardownRef = useRef<(() => void) | null>(null);

  const drawListRef = useRef<DrawList | null>(null);
  const parentById = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of layout.edges) map.set(edge.toId, edge.fromId);
    return map;
  }, [layout]);
  const nodeById = layout.nodeById;

  const drawList = useMemo(() => {
    if (!colors) return null;
    let mctx = measureRef.current;
    if (!mctx) {
      mctx = document.createElement("canvas").getContext("2d");
      measureRef.current = mctx;
    }
    return mctx ? buildDrawList(layout, colors, mctx) : null;
  }, [layout, colors]);
  drawListRef.current = drawList;

  // The Open chip tracks its node through pan/zoom: projected world->screen
  // each frame, offset just past the node's right edge and vertically centred.
  const positionChip = useCallback(() => {
    const chip = chipRef.current;
    const sel = selectedDrawNodeRef.current;
    if (!chip || !sel) return;
    const s = scaleRef.current;
    const pan = panRef.current;
    const sx = (sel.x + sel.w) * s + pan.x;
    const sy = sel.cy * s + pan.y;
    chip.style.transform = `translate(${Math.round(sx + 8)}px, ${Math.round(sy)}px) translateY(-50%)`;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const list = drawListRef.current;
    if (!canvas || !list) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    const s = scaleRef.current;
    const pan = panRef.current;
    const focus = focusRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(pan.x, pan.y);
    ctx.scale(s, s);

    for (const e of list.edges) {
      const active = !focus || (focus.has(e.fromId) && focus.has(e.toId));
      ctx.globalAlpha = active ? 0.72 : 0.1;
      ctx.lineWidth = e.width / s;
      ctx.strokeStyle = e.stroke;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.bezierCurveTo(e.c1x, e.c1y, e.c2x, e.c2y, e.x2, e.y2);
      ctx.stroke();
    }

    ctx.textBaseline = "middle";
    for (const nd of list.nodes) {
      const dim = focus ? !focus.has(nd.id) : false;
      ctx.globalAlpha = dim
        ? nd.completed
          ? 0.16
          : 0.28
        : nd.completed
          ? 0.5
          : 1;

      pillPath(ctx, nd.x, nd.y, nd.w, nd.h);
      ctx.fillStyle = nd.fill;
      ctx.fill();
      ctx.lineWidth = nd.borderW / s;
      ctx.strokeStyle = nd.border;
      ctx.stroke();

      if (nd.dotR > 0) {
        ctx.beginPath();
        ctx.fillStyle = nd.dotColor;
        ctx.arc(nd.dotX, nd.cy, nd.dotR, 0, TAU);
        ctx.fill();
      }

      if (nd.countText) {
        ctx.font = nd.countFont;
        ctx.fillStyle = nd.countColor;
        ctx.textAlign = "right";
        ctx.fillText(nd.countText, nd.countX, nd.cy);
      }

      ctx.font = nd.labelFont;
      ctx.fillStyle = nd.textColor;
      if (nd.kind === "root") {
        // Hubot Sans bearings make pure advance-centring read right and pure
        // ink-centring read left; a left-heavy label like "Me" balances between
        // them, biased toward the advance centre (and use the real ink bounds
        // vertically).
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const m = ctx.measureText(nd.label);
        const centerX = nd.x + nd.w / 2;
        const advancePen = centerX - m.width / 2;
        const inkPen =
          centerX -
          (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
        const inkY =
          nd.cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        ctx.fillText(nd.label, advancePen * 0.65 + inkPen * 0.35, inkY);
        ctx.textBaseline = "middle";
      } else {
        ctx.textAlign = "left";
        ctx.fillText(nd.label, nd.labelX, nd.cy);
      }
    }
    ctx.globalAlpha = 1;
    positionChip();
  }, [positionChip]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  const cancelClearTimer = useCallback(() => {
    if (clearFocusTimerRef.current !== null) {
      clearTimeout(clearFocusTimerRef.current);
      clearFocusTimerRef.current = null;
    }
  }, []);

  // Un-dim after a grace period rather than instantly, so passing off a node
  // into empty space (or a brief exit) doesn't strobe the map. A fresh hover
  // cancels this before it fires, switching focus with no flash between.
  const scheduleFocusClear = useCallback(() => {
    if (hoverIdRef.current === null || clearFocusTimerRef.current !== null)
      return;
    clearFocusTimerRef.current = window.setTimeout(() => {
      clearFocusTimerRef.current = null;
      hoverIdRef.current = null;
      focusRef.current = null;
      scheduleDraw();
    }, FOCUS_CLEAR_DELAY_MS);
  }, [scheduleDraw]);

  // Reads layout through a ref so it stays identity-stable — a [layout] dep
  // would churn the size effect, re-subscribing the observer and reallocating
  // (clearing) the canvas on every toggle/data change.
  const centerOnMe = useCallback((s: number) => {
    const { w, h } = sizeRef.current;
    const l = layoutRef.current;
    panRef.current = {
      x: w / 2 - l.centerX * s,
      y: h / 2 - l.centerY * s,
    };
  }, []);

  // Resolve theme colors on mount and whenever the theme flips.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    setColors(resolveColors(host));
  }, [dark]);

  // Redraw once fonts settle — the first draw may use fallback metrics.
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) {
        // Re-bake labels against the real font, then repaint.
        setColors((prev) => (prev ? { ...prev } : prev));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Size the canvas to its container (DPR-aware) and, on the first real size,
  // center on "Me" and report the viewport so the page can pick a fit zoom.
  useEffect(() => {
    const host = containerRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const syncSize = () => {
      // Layout metrics, not getBoundingClientRect: the backing store must
      // track the element's layout size, unaffected by ancestor transforms.
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      sizeRef.current = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      dprRef.current = dpr;
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      // Assigning canvas.width/height clears the backing store, so only touch
      // it when the pixel size actually changed — otherwise the map blanks
      // for a frame on every unrelated resize notification.
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      if (!didInitRef.current) {
        didInitRef.current = true;
        centerOnMe(scaleRef.current);
        prevScaleRef.current = scaleRef.current;
        onFitRef.current(w, h);
      }
      scheduleDraw();
    };
    const observer = new ResizeObserver(syncSize);
    observer.observe(host);
    syncSize();

    // A devicePixelRatio change with no CSS-size change (dragging between
    // mixed-DPR monitors) never fires the ResizeObserver — watch it directly.
    let mql: MediaQueryList | null = null;
    const onDprChange = () => {
      mql?.removeEventListener("change", onDprChange);
      syncSize();
      watchDpr();
    };
    const watchDpr = () => {
      mql = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      mql.addEventListener("change", onDprChange);
    };
    watchDpr();

    return () => {
      observer.disconnect();
      mql?.removeEventListener("change", onDprChange);
    };
  }, [centerOnMe, scheduleDraw]);

  // Re-center and refit when the page switches layout mode — the geometry
  // changes wholesale, so the old zoom would frame it poorly. Skips the first
  // run (the size effect already fits on mount).
  const refitFirstRef = useRef(true);
  useEffect(() => {
    if (refitFirstRef.current) {
      refitFirstRef.current = false;
      return;
    }
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    centerOnMe(scaleRef.current);
    onFitRef.current(w, h);
    scheduleDraw();
  }, [refitToken, centerOnMe, scheduleDraw]);

  // Apply a scale change: pivot the view on the cursor (or the viewport center
  // for the slider) so the point under the pivot stays fixed.
  useEffect(() => {
    scaleRef.current = scale;
    const prev = prevScaleRef.current;
    if (prev === null || prev === scale) {
      prevScaleRef.current = scale;
      scheduleDraw();
      return;
    }
    const { w, h } = sizeRef.current;
    const pivot = pivotRef.current ?? { x: w / 2, y: h / 2 };
    pivotRef.current = null;
    const pan = panRef.current;
    const worldX = (pivot.x - pan.x) / prev;
    const worldY = (pivot.y - pan.y) / prev;
    panRef.current = {
      x: pivot.x - worldX * scale,
      y: pivot.y - worldY * scale,
    };
    prevScaleRef.current = scale;
    scheduleDraw();
  }, [scale, scheduleDraw]);

  // A rebuilt layout invalidates the hovered id set (it references old nodes),
  // so drop the focus before repainting or dimming lands on stale ids.
  useEffect(() => {
    cancelClearTimer();
    hoverIdRef.current = null;
    focusRef.current = null;
    setSelectedNodeId(null);
    scheduleDraw();
  }, [drawList, cancelClearTimer, scheduleDraw]);

  // Native, non-passive wheel: ctrl/meta (or pinch) zooms at the cursor,
  // everything else pans.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const step = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        pivotRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        onZoomDeltaRef.current(-e.deltaY * step * 0.06);
        // A clamped no-op zoom won't re-run the scale effect to consume the
        // pivot; drop it next frame so a later slider zoom uses the center.
        requestAnimationFrame(() => {
          pivotRef.current = null;
        });
        return;
      }
      e.preventDefault();
      panRef.current = {
        x: panRef.current.x - e.deltaX * step,
        y: panRef.current.y - e.deltaY * step,
      };
      scheduleDraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [scheduleDraw]);

  // Reset the ref, not just cancel — StrictMode's dev mount/unmount/remount
  // runs this cleanup mid-flight, and a stale non-zero rafRef would make
  // scheduleDraw think a frame is forever pending and never repaint.
  useEffect(
    () => () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (clearFocusTimerRef.current !== null) {
        clearTimeout(clearFocusTimerRef.current);
        clearFocusTimerRef.current = null;
      }
      panTeardownRef.current?.();
    },
    [],
  );

  const hitTest = useCallback(
    (screenX: number, screenY: number): DrawNode | null => {
      const list = drawListRef.current;
      if (!list) return null;
      const s = scaleRef.current;
      const pan = panRef.current;
      const wx = (screenX - pan.x) / s;
      const wy = (screenY - pan.y) / s;
      let hit: DrawNode | null = null;
      for (const nd of list.nodes) {
        if (
          wx >= nd.x &&
          wx <= nd.x + nd.w &&
          wy >= nd.y &&
          wy <= nd.y + nd.h
        ) {
          hit = nd;
        }
      }
      return hit;
    },
    [],
  );

  // Nearest branch under the cursor (its child-node id), or null. Each edge's
  // bezier is sampled into a short polyline and distance-tested; the control
  // hull gives a cheap bounding-box reject first.
  const edgeHitTest = useCallback(
    (screenX: number, screenY: number): string | null => {
      const list = drawListRef.current;
      if (!list) return null;
      const s = scaleRef.current;
      const pan = panRef.current;
      const wx = (screenX - pan.x) / s;
      const wy = (screenY - pan.y) / s;
      const tol = HOVER_EDGE_TOL_PX / s;
      let bestDist2 = tol * tol;
      let bestId: string | null = null;
      for (const e of list.edges) {
        const minX = Math.min(e.x1, e.c1x, e.c2x, e.x2) - tol;
        const maxX = Math.max(e.x1, e.c1x, e.c2x, e.x2) + tol;
        const minY = Math.min(e.y1, e.c1y, e.c2y, e.y2) - tol;
        const maxY = Math.max(e.y1, e.c1y, e.c2y, e.y2) + tol;
        if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;
        let px = e.x1;
        let py = e.y1;
        for (let i = 1; i <= EDGE_SAMPLES; i++) {
          const t = i / EDGE_SAMPLES;
          const mt = 1 - t;
          const bx =
            mt * mt * mt * e.x1 +
            3 * mt * mt * t * e.c1x +
            3 * mt * t * t * e.c2x +
            t * t * t * e.x2;
          const by =
            mt * mt * mt * e.y1 +
            3 * mt * mt * t * e.c1y +
            3 * mt * t * t * e.c2y +
            t * t * t * e.y2;
          const d2 = pointSegDist2(wx, wy, px, py, bx, by);
          if (d2 < bestDist2) {
            bestDist2 = d2;
            bestId = e.toId;
          }
          px = bx;
          py = by;
        }
      }
      return bestId;
    },
    [],
  );

  const computeFocus = useCallback(
    (id: string): Set<string> => {
      const set = new Set<string>();
      let cursor: string | undefined = id;
      while (cursor && !set.has(cursor)) {
        set.add(cursor);
        cursor = parentById.get(cursor);
      }
      const hovered = nodeById.get(id);
      if (hovered) {
        const stack = [...hovered.node.children];
        while (stack.length) {
          const child = stack.pop();
          if (!child) continue;
          set.add(child.id);
          stack.push(...child.children);
        }
      }
      return set;
    },
    [parentById, nodeById],
  );

  const handleHover = useCallback(
    (e: React.PointerEvent) => {
      // Touch never hovers — the tap handler owns focus on mobile.
      if (e.pointerType === "touch") return;
      if (isPanningRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const nodeHit = hitTest(localX, localY);
      canvas.style.cursor = nodeHit?.href ? "pointer" : "grab";
      // A node wins over its branches; otherwise the nearest branch focuses the
      // object it feeds, so hovering a connector lights the same lineage.
      const id = nodeHit?.id ?? edgeHitTest(localX, localY);
      if (id !== null) {
        // Landing on something cancels any pending un-dim and focuses at once.
        cancelClearTimer();
        if (id !== hoverIdRef.current) {
          hoverIdRef.current = id;
          focusRef.current = computeFocus(id);
          scheduleDraw();
        }
      } else {
        scheduleFocusClear();
      }
    },
    [
      hitTest,
      edgeHitTest,
      computeFocus,
      scheduleDraw,
      cancelClearTimer,
      scheduleFocusClear,
    ],
  );

  const clearHover = useCallback(() => {
    scheduleFocusClear();
  }, [scheduleFocusClear]);

  const beginPan = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      // On touch, the gesture recognizer owns pan/tap; mouse still pans here.
      if (touch && e.pointerType === "touch") return;
      const host = containerRef.current;
      if (!host) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const panStart = { ...panRef.current };
      let active = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!active) {
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
          active = true;
          isPanningRef.current = true;
          host.dataset.panning = "true";
          if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        }
        panRef.current = { x: panStart.x + dx, y: panStart.y + dy };
        scheduleDraw();
      };
      // Also runs on unmount (via panTeardownRef) so a drag interrupted by
      // navigating away doesn't leak these window listeners.
      const teardown = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        panTeardownRef.current = null;
        if (active) {
          isPanningRef.current = false;
          delete host.dataset.panning;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }
      };
      const finish = (ev: PointerEvent, allowClick: boolean) => {
        const wasActive = active;
        teardown();
        if (!wasActive && allowClick) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top);
            if (hit?.href) router.push(hit.href);
          }
        }
      };
      const onUp = (ev: PointerEvent) => finish(ev, true);
      const onCancel = (ev: PointerEvent) => finish(ev, false);
      panTeardownRef.current = teardown;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [scheduleDraw, hitTest, router, touch],
  );

  const handleTouchPan = useCallback(
    (dx: number, dy: number) => {
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      scheduleDraw();
    },
    [scheduleDraw],
  );

  // A tap focuses the tapped node's lineage and, for a node that opens
  // somewhere, surfaces the Open chip; a second tap on the same node (or the
  // chip) navigates. A tap on empty space clears the selection.
  const handleTouchTap = useCallback(
    (pt: CanvasGesturePoint) => {
      const hit = hitTest(pt.x, pt.y);
      if (!hit) {
        if (selectedNodeIdRef.current !== null) setSelectedNodeId(null);
        hoverIdRef.current = null;
        focusRef.current = null;
        scheduleDraw();
        return;
      }
      if (hit.href && selectedNodeIdRef.current === hit.id) {
        router.push(hit.href);
        return;
      }
      hoverIdRef.current = hit.id;
      focusRef.current = computeFocus(hit.id);
      setSelectedNodeId(hit.id);
      scheduleDraw();
    },
    [hitTest, computeFocus, scheduleDraw, router],
  );

  const handleTouchPinch = useCallback(({ scaleFactor, centroid }: CanvasPinchInfo) => {
    pivotRef.current = centroid;
    onZoomDeltaRef.current(pinchZoomDelta(scaleFactor, MINDMAP_LOG_RANGE));
  }, []);

  // Drop the pinch pivot once the gesture ends so a later slider zoom re-centres
  // on the viewport rather than the last pinch centroid.
  const handlePinchEnd = useCallback(() => {
    pivotRef.current = null;
  }, []);

  useCanvasGestures(containerRef, {
    enabled: touch,
    onTap: handleTouchTap,
    onDragMove: handleTouchPan,
    onPinch: handleTouchPinch,
    onPinchEnd: handlePinchEnd,
  });

  const selectedNode =
    selectedNodeId && drawList
      ? drawList.nodes.find((n) => n.id === selectedNodeId && !!n.href) ?? null
      : null;
  selectedDrawNodeRef.current = selectedNode;

  // Position the freshly mounted chip before paint so it never flashes at the
  // origin; subsequent pan/zoom frames keep it in place via draw().
  useLayoutEffect(() => {
    positionChip();
  }, [selectedNodeId, positionChip]);

  return (
    <div
      ref={containerRef}
      className={containerClass}
      onPointerDown={beginPan}
      onPointerMove={handleHover}
      onPointerLeave={clearHover}
    >
      <canvas ref={canvasRef} className={canvasClass} />
      {selectedNode?.href && (
        <button
          ref={chipRef}
          type="button"
          data-gesture-skip
          className={openChipClass}
          onClick={() => router.push(selectedNode.href as string)}
        >
          Open →
        </button>
      )}
    </div>
  );
}
