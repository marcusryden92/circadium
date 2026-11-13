"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { X } from "lucide-react";
import type {
  Category,
  Planner,
  PlannerDependency,
  Queue,
} from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import {
  CategoryDot,
  useTheme,
  vars,
  categoryColor,
} from "@/components/ui";
import {
  getEffectiveCategoryId,
  getRootParentId,
} from "@/utils/goalPageHandlers";
import { wouldCreateCycleAddingDependency } from "@/utils/precedence/findCycle";
import { describeCycle } from "@/utils/precedence/describeCycle";
import type { PrecedenceEdge } from "@/utils/precedence/types";
import { formatDurationCompact } from "@/utils/timeFormatting";
import {
  useCanvasGestures,
  pinchZoomDelta,
  clientToCanvasPoint,
  canvasPointToClient,
  type CanvasGesturePoint,
  type CanvasPinchInfo,
} from "@/hooks/useCanvasGestures";
import {
  buildGraphTicks,
  bandRootHeight,
  ZOOM_MIN_PX_PER_DAY,
  ZOOM_MAX_PX_PER_DAY,
  type GraphLayout,
  type GraphTickUnit,
  type GraphTickUnits,
  type LaidLane,
  type LaidLeaf,
  type LaidNode,
} from "../../_lib/graphModel";
import {
  scroller,
  AXIS_HEIGHT,
  axis,
  axisTick,
  axisDockLabel,
  content,
  svgLayer,
  edgeHit,
  edgeGroup,
  lane as laneClass,
  laneHead,
  laneQueueCaption,
  laneTitle,
  laneCount,
  emptyLaneNote,
  node as nodeClass,
  band,
  bandBrace,
  dropSlot,
  nodeLink,
  nodeTitle,
  nodeInitial,
  nodeHint,
  nodeNameBadge,
  nodeNameBadgeTitle,
  nodeNameBadgeMeta,
  nodeBadgeOpen,
  linkHandleOut,
  linkHandleIn,
  linkReasonChip,
  edgeChip,
  edgeChipLabel,
  edgeChipRemove,
} from "./GraphCanvas.css";

type DragZone = "before" | "after";

type ReorderTarget = { id: string; zone: DragZone };

type ReorderPreview = {
  laneKey: string;
  shifts: Map<string, { dx: number; dy: number }>;
  slot: { x: number; y: number; w: number } | null;
  anchorShift: { dx: number; dy: number } | null;
};

// "drag": the grabbed node follows the pointer. "settle": dropped — the
// preview frozen at drop holds until the regen moves the node, then eases to
// real positions. The optimistic queue update rebuilds the layout with
// identical spans first, so releasing on mere layout identity would bounce.
type ReorderState = {
  id: string;
  laneKey: string;
  dx: number;
  phase: "drag" | "settle";
  held?: { x: number; w: number } | null;
  frozen?: ReorderPreview | null;
};

type LinkDirection = "forward" | "backward";

type LinkDragState = {
  sourceId: string;
  direction: LinkDirection;
  // Where the drag line starts — the handle's pill edge (a leaf pill in leaf
  // view), not necessarily the root pill.
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
  targetId: string | null;
  valid: boolean;
  reason: string | null;
  cycle: PrecedenceEdge[] | null;
};

type HoverTarget = { rootId: string; leafId: string | null };

type EdgeGeometry = {
  key: string;
  kind: "dependency" | "chain";
  edge: PlannerDependency | null;
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: string;
  broken: boolean;
};

type GraphCanvasProps = {
  layout: GraphLayout;
  weekStartDay: WeekDayIntegers;
  markers: GraphTickUnits;
  planner: Planner[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  categories: Category[];
  queueCategoryByRootId: Map<string, string>;
  onAddDependency: (predecessorId: string, successorId: string) => void;
  onRemoveDependency: (edgeId: string) => void;
  onReorderMember: (
    queueId: string,
    plannerId: string,
    toIndex: number,
  ) => void;
  onLinkRefused: (message: string) => void;
  hoverLabels: boolean;
  touch?: boolean;
  onZoomDelta: (delta: number) => void;
  onFitWeek: (viewportWidth: number) => void;
};

// Under TITLE_MIN_WIDTH the first letter stands in for the title.
const TITLE_MIN_WIDTH = 40;
const TITLE_TIGHT_PAD_WIDTH = 72;
const INITIAL_MIN_NODE_HEIGHT = 22;

const GRAPH_LOG_RANGE = Math.log(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY);

const TICK_LINE_OPACITY: Record<GraphTickUnit, number> = {
  month: 0.9,
  week: 0.6,
  day: 0.4,
  hour: 0.2,
};

const edgePath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  direction: 1 | -1 = 1,
): string => {
  const dx = Math.max(28, Math.abs(x2 - x1) / 2) * direction;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

// Successor starts before its predecessor ends (minute slack for rounding).
// Keys on the ordering span (uncompleted work only): a completed predecessor
// or a successor whose only early placements are done is never out of order.
const isBroken = (from: LaidNode, to: LaidNode): boolean =>
  !!from.node.orderingSpan &&
  !!to.node.orderingSpan &&
  to.node.orderingSpan.start < from.node.orderingSpan.end - 60_000;

const previewedOrder = (
  ids: string[],
  draggedId: string,
  over: ReorderTarget,
): string[] | null => {
  const result = ids.filter((id) => id !== draggedId);
  const targetIdx = result.indexOf(over.id);
  if (targetIdx === -1) return null;
  result.splice(
    over.zone === "before" ? targetIdx : targetIdx + 1,
    0,
    draggedId,
  );
  return result;
};

export function GraphCanvas({
  layout,
  weekStartDay,
  markers,
  planner,
  queues,
  dependencies,
  categories,
  queueCategoryByRootId,
  onAddDependency,
  onRemoveDependency,
  onReorderMember,
  onLinkRefused,
  hoverLabels,
  touch = false,
  onZoomDelta,
  onFitWeek,
}: GraphCanvasProps) {
  const { dark } = useTheme();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const onZoomDeltaRef = useRef(onZoomDelta);
  onZoomDeltaRef.current = onZoomDelta;
  const onFitWeekRef = useRef(onFitWeek);
  onFitWeekRef.current = onFitWeek;
  const nodeH = layout.nodeHeight;
  const rootH = bandRootHeight(nodeH);

  const [hovered, setHovered] = useState<HoverTarget | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [linkDrag, setLinkDrag] = useState<LinkDragState | null>(null);
  const [reorder, setReorder] = useState<ReorderState | null>(null);
  const [dragOver, setDragOver] = useState<ReorderTarget | null>(null);
  const reorderRef = useRef<ReorderState | null>(null);
  const dragOverRef = useRef<ReorderTarget | null>(null);
  const didReorderDragRef = useRef(false);
  const reorderTeardownRef = useRef<(() => void) | null>(null);
  const touchReorderRef = useRef<{
    draggedId: string;
    laneKey: string;
    grabX: number;
  } | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Zoom pivots on a fixed anchor: the cursor for ctrl+wheel, else the
  // viewport center, pinned to the domain start while touching the far left.
  const prevPxPerDayRef = useRef<number | null>(null);
  const zoomAnchorRef = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const prev = prevPxPerDayRef.current;
    prevPxPerDayRef.current = layout.pxPerDay;
    if (prev === null) {
      el.scrollLeft = Math.max(0, layoutRef.current.nowX);
      zoomAnchorRef.current = 0;
      onFitWeekRef.current(el.clientWidth);
      return;
    }
    if (prev === layout.pxPerDay) return;
    const anchor =
      zoomAnchorRef.current ?? (el.scrollLeft <= 0 ? 0 : el.clientWidth / 2);
    zoomAnchorRef.current = null;
    const ratio = layout.pxPerDay / prev;
    el.scrollLeft = Math.max(0, (el.scrollLeft + anchor) * ratio - anchor);
  }, [layout.pxPerDay]);

  // Attached natively — React root wheel listeners are passive.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const scale = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAnchorRef.current = e.clientX - el.getBoundingClientRect().left;
        onZoomDeltaRef.current(-e.deltaY * scale * 0.06);
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollTop += (e.deltaY !== 0 ? e.deltaY : e.deltaX) * scale;
        return;
      }
      e.preventDefault();
      el.scrollLeft += (e.deltaY + e.deltaX) * scale;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setViewportHeight(el.clientHeight),
    );
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Viewport window for hour ticks, quantized so scrolling rarely changes it.
  const [tickWindow, setTickWindow] = useState<{
    start: number;
    end: number;
  } | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const start = Math.max(
        0,
        Math.floor((el.scrollLeft - 2000) / 1000) * 1000,
      );
      const end =
        Math.ceil((el.scrollLeft + el.clientWidth + 2000) / 1000) * 1000;
      setTickWindow((prev) =>
        prev && prev.start === start && prev.end === end
          ? prev
          : { start, end },
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, []);

  const ticks = useMemo(
    () =>
      buildGraphTicks(
        layout,
        weekStartDay,
        markers,
        tickWindow ?? { start: 0, end: 6000 },
      ),
    [layout, weekStartDay, markers, tickWindow],
  );

  const contentHeight = Math.max(layout.height, viewportHeight - AXIS_HEIGHT);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const laneColorByKey = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const laidLane of layout.lanes) {
      const queue = laidLane.lane.queue;
      if (!queue) {
        map.set(laidLane.lane.key, null);
        continue;
      }
      const category = queue.categoryId
        ? categoryById.get(queue.categoryId)
        : undefined;
      map.set(laidLane.lane.key, queue.color ?? category?.color ?? null);
    }
    return map;
  }, [layout, categoryById]);

  const accentById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const laid of layout.nodeById.values()) {
      const row = laid.node.planner;
      let color: string | null = row.color ?? null;
      if (!color) {
        const categoryId = getEffectiveCategoryId(
          planner,
          row.id,
          queueCategoryByRootId,
        );
        const category = categoryId ? categoryById.get(categoryId) : undefined;
        if (category) color = categoryColor(category, dark ? "dark" : "light");
      }
      map.set(row.id, color);
    }
    return map;
  }, [layout, planner, categoryById, queueCategoryByRootId, dark]);

  // In leaf view, connections attach to the bottom leaves: an edge leaves the
  // last placed leaf and lands on the first — the engine's own bound
  // (predecessor's last end -> successor's start).
  const edgeAnchors = (laid: LaidNode) => {
    if (laid.leaves.length === 0) {
      return {
        inX: laid.x,
        inY: laid.y + nodeH / 2,
        outX: laid.x + laid.w,
        outY: laid.y + nodeH / 2,
      };
    }
    const first = laid.leaves[0];
    const last = laid.leaves[laid.leaves.length - 1];
    return {
      inX: first.x,
      inY: first.y + nodeH / 2,
      outX: last.x + last.w,
      outY: last.y + nodeH / 2,
    };
  };

  // Healthy queue chains draw nothing; only an out-of-order pair connects.
  const edges = useMemo<EdgeGeometry[]>(() => {
    const result: EdgeGeometry[] = [];
    const geometry = (from: LaidNode, to: LaidNode) => {
      const fromAnchors = edgeAnchors(from);
      const toAnchors = edgeAnchors(to);
      return {
        x1: fromAnchors.outX,
        y1: fromAnchors.outY,
        x2: toAnchors.inX,
        y2: toAnchors.inY,
      };
    };
    for (const laidLane of layout.lanes) {
      if (!laidLane.lane.queue) continue;
      const ordered = laidLane.lane.nodes;
      for (let i = 1; i < ordered.length; i++) {
        const from = layout.nodeById.get(ordered[i - 1].id);
        const to = layout.nodeById.get(ordered[i].id);
        if (!from || !to || !isBroken(from, to)) continue;
        const { x1, y1, x2, y2 } = geometry(from, to);
        result.push({
          key: `chain:${from.node.id}:${to.node.id}`,
          kind: "chain",
          edge: null,
          fromId: from.node.id,
          toId: to.node.id,
          x1,
          y1,
          x2,
          y2,
          path: edgePath(x1, y1, x2, y2),
          broken: true,
        });
      }
    }
    // A node-level endpoint has no pill of its own: fall back to its ROOT's
    // pill, or to the exact leaf pill when the leaf view has one placed.
    const resolveEndpoint = (
      id: string,
    ): { laid: LaidNode; leaf: LaidLeaf | null; interior: boolean } | null => {
      const direct = layout.nodeById.get(id);
      if (direct) return { laid: direct, leaf: null, interior: false };
      const rootId = getRootParentId(planner, id);
      const rootLaid = rootId ? layout.nodeById.get(rootId) : undefined;
      if (!rootLaid) return null;
      const leafPill = rootLaid.leaves.find((l) => l.leaf.id === id) ?? null;
      return { laid: rootLaid, leaf: leafPill, interior: true };
    };
    for (const edge of dependencies) {
      const fromRes = resolveEndpoint(edge.predecessorId);
      const toRes = resolveEndpoint(edge.successorId);
      if (!fromRes || !toRes) continue;
      const from = fromRes.laid;
      const to = toRes.laid;
      const base = geometry(from, to);
      const x1 = fromRes.leaf ? fromRes.leaf.x + fromRes.leaf.w : base.x1;
      const y1 = fromRes.leaf ? fromRes.leaf.y + nodeH / 2 : base.y1;
      const x2 = toRes.leaf ? toRes.leaf.x : base.x2;
      const y2 = toRes.leaf ? toRes.leaf.y + nodeH / 2 : base.y2;
      result.push({
        key: `dependency:${edge.id}`,
        kind: "dependency",
        edge,
        fromId: from.node.id,
        toId: to.node.id,
        x1,
        y1,
        x2,
        y2,
        path: edgePath(x1, y1, x2, y2),
        // Root spans don't stand in for a node endpoint's own window, so
        // error styling is suppressed for node edges.
        broken:
          !fromRes.interior && !toRes.interior && isBroken(from, to),
      });
    }
    return result;
  }, [layout, dependencies, planner, nodeH]);

  const selectedEdge = useMemo(
    () =>
      selectedEdgeId
        ? (edges.find((e) => e.edge?.id === selectedEdgeId) ?? null)
        : null,
    [edges, selectedEdgeId],
  );

  const toContentPoint = (e: { clientX: number; clientY: number }) => {
    const el = contentRef.current;
    if (!el) return { x: 0, y: 0 };
    return clientToCanvasPoint(el.getBoundingClientRect(), e.clientX, e.clientY);
  };

  const hitTestNode = (x: number, y: number): LaidNode | null => {
    for (const laid of layout.nodeById.values()) {
      if (
        x >= laid.x &&
        x <= laid.x + laid.w &&
        y >= laid.y &&
        y <= laid.y + nodeH
      ) {
        return laid;
      }
      for (const leaf of laid.leaves) {
        if (
          x >= leaf.x &&
          x <= leaf.x + leaf.w &&
          y >= leaf.y &&
          y <= leaf.y + nodeH
        ) {
          return laid;
        }
      }
    }
    return null;
  };

  // Like hitTestNode but keeps which leaf was hit (touch tap-to-select reveals
  // that specific pill's link handles, which live on the leaf in leaf view).
  const hitTestNodeLeaf = (
    x: number,
    y: number,
  ): { root: LaidNode; leafId: string | null } | null => {
    for (const laid of layout.nodeById.values()) {
      if (
        x >= laid.x &&
        x <= laid.x + laid.w &&
        y >= laid.y &&
        y <= laid.y + nodeH
      ) {
        return { root: laid, leafId: null };
      }
      for (const leaf of laid.leaves) {
        if (
          x >= leaf.x &&
          x <= leaf.x + leaf.w &&
          y >= leaf.y &&
          y <= leaf.y + nodeH
        ) {
          return { root: laid, leafId: leaf.leaf.id };
        }
      }
    }
    return null;
  };

  const laneForNode = (id: string): LaidLane | null =>
    layoutRef.current.lanes.find(
      (l) => !!l.lane.queue && l.nodes.some((n) => n.node.id === id),
    ) ?? null;

  // The lane member under content-x, or null if none — shared by the mouse
  // reorder drag and the touch long-press reorder.
  const findReorderTarget = (
    laneKey: string,
    x: number,
    draggedId: string,
  ): ReorderTarget | null => {
    const laidLane = layoutRef.current.lanes.find(
      (l) => l.lane.key === laneKey,
    );
    if (!laidLane) return null;
    for (const candidate of laidLane.nodes) {
      if (candidate.node.id === draggedId) continue;
      if (x < candidate.x || x > candidate.x + candidate.w) continue;
      return {
        id: candidate.node.id,
        zone: x < candidate.x + candidate.w / 2 ? "before" : "after",
      };
    }
    return null;
  };

  const contentPointFromLocal = (pt: CanvasGesturePoint) => {
    const el = scrollerRef.current;
    if (!el) return { x: 0, y: 0 };
    const { clientX, clientY } = canvasPointToClient(
      el.getBoundingClientRect(),
      pt,
    );
    return toContentPoint({ clientX, clientY });
  };

  // Right handle: source becomes the predecessor; left handle: the target does.
  const orderEndpoints = (
    sourceId: string,
    targetId: string,
    direction: LinkDirection,
  ): { predecessorId: string; successorId: string } =>
    direction === "forward"
      ? { predecessorId: sourceId, successorId: targetId }
      : { predecessorId: targetId, successorId: sourceId };

  const evaluateLinkTarget = (
    sourceId: string,
    targetId: string,
    direction: LinkDirection,
  ): {
    valid: boolean;
    reason: string | null;
    cycle: PrecedenceEdge[] | null;
  } => {
    const target = layout.nodeById.get(targetId)?.node;
    if (!target) return { valid: false, reason: null, cycle: null };
    if (target.completed) {
      return { valid: false, reason: "Already completed", cycle: null };
    }
    const linked = dependencies.some(
      (d) =>
        (d.predecessorId === sourceId && d.successorId === targetId) ||
        (d.predecessorId === targetId && d.successorId === sourceId),
    );
    if (linked) return { valid: false, reason: "Already linked", cycle: null };
    const { predecessorId, successorId } = orderEndpoints(
      sourceId,
      targetId,
      direction,
    );
    const cycle = wouldCreateCycleAddingDependency(
      queues,
      dependencies,
      predecessorId,
      successorId,
      planner,
    );
    if (cycle) return { valid: false, reason: "Would create a loop", cycle };
    return { valid: true, reason: null, cycle: null };
  };

  const handleLinkMove = (e: React.PointerEvent) => {
    if (!linkDrag) return;
    const point = toContentPoint(e);
    const hit = hitTestNode(point.x, point.y);
    const targetId =
      hit && hit.node.id !== linkDrag.sourceId ? hit.node.id : null;
    if (targetId === linkDrag.targetId) {
      setLinkDrag({ ...linkDrag, pointerX: point.x, pointerY: point.y });
      return;
    }
    if (!targetId) {
      setLinkDrag({
        ...linkDrag,
        pointerX: point.x,
        pointerY: point.y,
        targetId: null,
        valid: false,
        reason: null,
        cycle: null,
      });
      return;
    }
    const verdict = evaluateLinkTarget(
      linkDrag.sourceId,
      targetId,
      linkDrag.direction,
    );
    setLinkDrag({
      ...linkDrag,
      pointerX: point.x,
      pointerY: point.y,
      targetId,
      ...verdict,
    });
  };

  const handleLinkUp = () => {
    if (linkDrag?.targetId) {
      if (linkDrag.valid) {
        const { predecessorId, successorId } = orderEndpoints(
          linkDrag.sourceId,
          linkDrag.targetId,
          linkDrag.direction,
        );
        onAddDependency(predecessorId, successorId);
      } else if (linkDrag.cycle) {
        onLinkRefused(
          `That link would create a loop: ${describeCycle(linkDrag.cycle, planner, queues)}`,
        );
      }
    }
    setLinkDrag(null);
  };

  const beginLink = (
    e: React.PointerEvent<HTMLButtonElement>,
    sourceId: string,
    direction: LinkDirection,
    origin: { x: number; y: number },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = toContentPoint(e);
    setLinkDrag({
      sourceId,
      direction,
      originX: origin.x,
      originY: origin.y,
      pointerX: point.x,
      pointerY: point.y,
      targetId: null,
      valid: false,
      reason: null,
      cycle: null,
    });
  };

  const applyReorder = (
    next: ReorderState | null,
    over: ReorderTarget | null,
  ) => {
    reorderRef.current = next;
    dragOverRef.current = over;
    setReorder(next);
    setDragOver(over);
  };

  useEffect(() => () => reorderTeardownRef.current?.(), []);

  // The regen actually moved the node — release the held preview before paint.
  useLayoutEffect(() => {
    const state = reorderRef.current;
    if (state?.phase !== "settle") return;
    const laid = layout.nodeById.get(state.id);
    const held = state.held;
    if (!laid || !held || laid.x !== held.x || laid.w !== held.w) {
      applyReorder(null, null);
    }
  }, [layout]);

  const settling = reorder?.phase === "settle";
  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => {
      if (reorderRef.current?.phase === "settle") applyReorder(null, null);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [settling]);

  // Bubble to the previewed order's anchor slots; real times land after regen.
  const reorderPreview = useMemo<ReorderPreview | null>(() => {
    if (!reorder) return null;
    const laidLane = layout.lanes.find((l) => l.lane.key === reorder.laneKey);
    if (!laidLane) return null;
    const ids = laidLane.nodes.map((laid) => laid.node.id);
    const order =
      (dragOver && previewedOrder(ids, reorder.id, dragOver)) ?? ids;
    const shifts = new Map<string, { dx: number; dy: number }>();
    let slot: { x: number; y: number; w: number } | null = null;
    let anchorShift: { dx: number; dy: number } | null = null;
    for (let index = 0; index < order.length; index++) {
      const laid = layout.nodeById.get(order[index]);
      const anchor = laidLane.nodes[index];
      if (!laid || !anchor) continue;
      if (order[index] === reorder.id) {
        slot = { x: anchor.x, y: anchor.y, w: anchor.w };
        anchorShift = { dx: anchor.x - laid.x, dy: anchor.y - laid.y };
        continue;
      }
      if (anchor.x === laid.x && anchor.y === laid.y) continue;
      shifts.set(order[index], { dx: anchor.x - laid.x, dy: anchor.y - laid.y });
    }
    return { laneKey: reorder.laneKey, shifts, slot, anchorShift };
  }, [layout, reorder, dragOver]);
  const reorderPreviewRef = useRef(reorderPreview);
  reorderPreviewRef.current = reorderPreview;

  // During settle, render the preview frozen at drop time — the optimistic
  // queue update reorders the lane arrays, which would collapse a live one.
  const activePreview =
    reorder?.phase === "settle" ? (reorder.frozen ?? null) : reorderPreview;

  const commitReorder = () => {
    const state = reorderRef.current;
    const over = dragOverRef.current;
    if (!state || state.phase !== "drag") return;
    const laidLane = layoutRef.current.lanes.find(
      (l) => l.lane.key === state.laneKey,
    );
    const queue = laidLane?.lane.queue;
    if (!laidLane || !queue || !over) {
      applyReorder(null, null);
      return;
    }
    const ids = laidLane.nodes.map((laid) => laid.node.id);
    const order = previewedOrder(ids, state.id, over);
    if (!order || order.every((id, i) => id === ids[i])) {
      applyReorder(null, null);
      return;
    }
    const without = laidLane.lane.memberOrderRows.filter(
      (p) => p.id !== state.id,
    );
    const targetIdx = without.findIndex((p) => p.id === over.id);
    if (targetIdx === -1) {
      applyReorder(null, null);
      return;
    }
    onReorderMember(
      queue.id,
      state.id,
      over.zone === "before" ? targetIdx : targetIdx + 1,
    );
    const laid = layoutRef.current.nodeById.get(state.id);
    applyReorder(
      {
        ...state,
        phase: "settle",
        held: laid ? { x: laid.x, w: laid.w } : null,
        frozen: reorderPreviewRef.current,
      },
      over,
    );
  };

  const beginReorder = (
    e: React.PointerEvent<HTMLDivElement>,
    draggedId: string,
    laneKey: string,
  ) => {
    // Touch drives reorder through the gesture recognizer (long-press to grab).
    if (touch) return;
    if (e.button !== 0 || linkDrag) return;
    if (reorderRef.current?.phase === "drag") return;
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const nodeEl = e.currentTarget;
    const pointerId = e.pointerId;
    const grabX = e.clientX - contentEl.getBoundingClientRect().left;
    let active = false;
    let lastClientX = e.clientX;

    const update = (clientX: number) => {
      lastClientX = clientX;
      const x = clientX - contentEl.getBoundingClientRect().left;
      const dx = x - grabX;
      if (!active) {
        if (Math.abs(dx) < 5) return;
        active = true;
        didReorderDragRef.current = true;
        dragOverRef.current = null;
        try {
          nodeEl.setPointerCapture(pointerId);
        } catch {
          // pointer already released
        }
      }
      // Keep the last target while over the grabbed node's own slot or a gap.
      const found = findReorderTarget(laneKey, x, draggedId);
      const over = found ?? dragOverRef.current;
      applyReorder({ id: draggedId, laneKey, dx, phase: "drag" }, over);
    };

    const finish = (commit: boolean) => {
      reorderTeardownRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      scrollerRef.current?.removeEventListener("scroll", onScroll);
      try {
        nodeEl.releasePointerCapture(pointerId);
      } catch {
        // never captured
      }
      if (!active) return;
      window.setTimeout(() => {
        didReorderDragRef.current = false;
      }, 0);
      if (commit) commitReorder();
      else applyReorder(null, null);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) update(ev.clientX);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(true);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(false);
    };
    const onScroll = () => {
      if (active) update(lastClientX);
    };

    reorderTeardownRef.current = () => finish(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    scrollerRef.current?.addEventListener("scroll", onScroll, {
      passive: true,
    });
  };

  // A tap selects the node under it — revealing its link handles and the
  // inspect badge — or clears selection on empty space. Navigation is via the
  // badge's Open action, so a low-zoom tap never opens the item blind.
  const handleTouchTap = (pt: CanvasGesturePoint) => {
    const cp = contentPointFromLocal(pt);
    const hit = hitTestNodeLeaf(cp.x, cp.y);
    if (!hit) {
      setHovered(null);
      setSelectedEdgeId(null);
      return;
    }
    setHovered({ rootId: hit.root.node.id, leafId: hit.leafId });
    setHoverX(cp.x);
  };

  // Long-press grabs a queue member for reordering; on a non-draggable node it
  // falls back to selecting (so the gesture never feels dead).
  const handleTouchLongPress = (pt: CanvasGesturePoint) => {
    const cp = contentPointFromLocal(pt);
    const hit = hitTestNodeLeaf(cp.x, cp.y);
    if (!hit) return;
    const lane = laneForNode(hit.root.node.id);
    if (lane && !hit.root.node.completed) {
      touchReorderRef.current = {
        draggedId: hit.root.node.id,
        laneKey: lane.lane.key,
        grabX: cp.x,
      };
      didReorderDragRef.current = true;
      applyReorder(
        { id: hit.root.node.id, laneKey: lane.lane.key, dx: 0, phase: "drag" },
        null,
      );
    } else {
      setHovered({ rootId: hit.root.node.id, leafId: hit.leafId });
      setHoverX(cp.x);
    }
  };

  const handleTouchDragMove = (
    dx: number,
    dy: number,
    pt: CanvasGesturePoint,
  ) => {
    const active = touchReorderRef.current;
    if (active) {
      const cp = contentPointFromLocal(pt);
      const over =
        findReorderTarget(active.laneKey, cp.x, active.draggedId) ??
        dragOverRef.current;
      applyReorder(
        {
          id: active.draggedId,
          laneKey: active.laneKey,
          dx: cp.x - active.grabX,
          phase: "drag",
        },
        over,
      );
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft -= dx;
    el.scrollTop -= dy;
  };

  const handleTouchDragEnd = () => {
    if (!touchReorderRef.current) return;
    touchReorderRef.current = null;
    commitReorder();
    window.setTimeout(() => {
      didReorderDragRef.current = false;
    }, 0);
  };

  const handleTouchPinch = ({ scaleFactor, centroid }: CanvasPinchInfo) => {
    zoomAnchorRef.current = centroid.x;
    onZoomDeltaRef.current(pinchZoomDelta(scaleFactor, GRAPH_LOG_RANGE));
  };

  // Drop the anchor so a clamped pinch at the zoom extremes doesn't leak its
  // centroid into a later slider zoom (the pxPerDay effect only clears it when
  // the zoom actually changes).
  const handleTouchPinchEnd = () => {
    zoomAnchorRef.current = null;
  };

  useCanvasGestures(scrollerRef, {
    enabled: touch,
    onTap: handleTouchTap,
    onLongPress: handleTouchLongPress,
    onDragMove: handleTouchDragMove,
    onDragEnd: handleTouchDragEnd,
    onPinch: handleTouchPinch,
    onPinchEnd: handleTouchPinchEnd,
  });

  const hoverMeta = (
    laid: LaidNode,
    leaf: LaidLeaf | null,
  ): string => {
    const row = leaf ? leaf.leaf.planner : laid.node.planner;
    const span = leaf ? leaf.leaf.span : laid.node.span;
    const parts = span
      ? [
          `${format(span.start, "MMM d, HH:mm")} – ${format(span.end, "MMM d, HH:mm")}`,
        ]
      : [laid.node.unreadyGoal ? "not ready" : "not scheduled"];
    if (row.duration > 0) parts.push(formatDurationCompact(row.duration));
    return parts.join(" · ");
  };

  const edgeStroke = (edge: EdgeGeometry): React.CSSProperties => {
    const active =
      edge.edge?.id === selectedEdgeId ||
      (hovered !== null &&
        (edge.fromId === hovered.rootId || edge.toId === hovered.rootId));
    if (edge.kind === "chain") {
      return {
        stroke: vars.status.error,
        strokeOpacity: active ? 0.85 : 0.65,
        strokeWidth: 1.5,
        strokeDasharray: "4 3",
        fill: "none",
      };
    }
    return {
      stroke: edge.broken
        ? vars.status.error
        : active
          ? vars.accent.primary
          : vars.muted,
      strokeOpacity: active ? 1 : 0.65,
      strokeWidth: active ? 2 : 1.5,
      strokeDasharray: edge.broken ? "4 3" : undefined,
      fill: "none",
    };
  };

  const arrowFill = (edge: EdgeGeometry): React.CSSProperties => {
    const style = edgeStroke(edge);
    return { fill: style.stroke as string, fillOpacity: style.strokeOpacity };
  };

  const renderPill = (opts: {
    pillKey: string;
    laidLane: LaidLane;
    rootLaid: LaidNode;
    leaf: LaidLeaf | null;
    rect: { x: number; y: number; w: number };
    offset: { x: number; y: number };
    accent: string | null;
    draggable: boolean;
    withHandles: boolean;
    // Band root card: title-fit width, shorter than a leaf pill.
    compact?: boolean;
    maxWidth?: number;
    transform?: string;
    dragActive?: boolean;
    settling?: boolean;
  }) => {
    const rootId = opts.rootLaid.node.id;
    const row = opts.leaf ? opts.leaf.leaf.planner : opts.rootLaid.node.planner;
    const completed = opts.leaf
      ? opts.leaf.leaf.completed
      : opts.rootLaid.node.completed;
    const docked = !opts.leaf && opts.rootLaid.docked;
    const title = row.title || "Untitled";
    const leafId = opts.leaf?.leaf.id ?? null;
    // Touch: a tap-selected pill reveals its (enlarged) link handles.
    const selected =
      touch && hovered?.rootId === rootId && hovered?.leafId === leafId;
    const pillH = opts.compact ? rootH : nodeH;
    const showInlineTitle = opts.compact || opts.rect.w >= TITLE_MIN_WIDTH;
    const showInitial =
      !showInlineTitle && nodeH >= INITIAL_MIN_NODE_HEIGHT;
    const fontSize = opts.compact
      ? pillH >= 17
        ? 10.5
        : 9.5
      : nodeH >= 22
        ? 12
        : 10;

    return (
      <div
        key={opts.pillKey}
        className={nodeClass}
        style={{
          left: opts.rect.x - opts.offset.x,
          top: opts.rect.y - opts.offset.y,
          width: opts.compact ? "max-content" : opts.rect.w,
          maxWidth: opts.compact ? opts.maxWidth : undefined,
          height: pillH,
          borderLeft: opts.accent ? `3px solid ${opts.accent}` : undefined,
          transform: opts.transform,
        }}
        data-completed={completed || undefined}
        data-docked={docked || undefined}
        data-draggable={opts.draggable || undefined}
        data-drag-active={opts.dragActive || undefined}
        data-settling={opts.settling || undefined}
        data-selected={selected || undefined}
        data-link-target={
          linkDrag?.targetId === rootId
            ? linkDrag.valid
              ? "valid"
              : "invalid"
            : undefined
        }
        onPointerDown={
          opts.draggable
            ? (e) => beginReorder(e, rootId, opts.laidLane.lane.key)
            : undefined
        }
        onClickCapture={(e) => {
          // On touch a pill tap selects (via the gesture recognizer); the Link
          // must not also navigate. On desktop, only a completed reorder drag
          // suppresses the click.
          if (touch || didReorderDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onMouseEnter={(e) => {
          setHovered({ rootId, leafId });
          setHoverX(toContentPoint(e).x);
        }}
        onMouseMove={(e) => {
          if (hoverLabels && !linkDrag && !reorder) {
            setHoverX(toContentPoint(e).x);
          }
        }}
        onMouseLeave={() =>
          setHovered((prev) =>
            prev && prev.rootId === rootId && prev.leafId === leafId
              ? null
              : prev,
          )
        }
      >
        <Link
          href={`/items/${leafId ?? rootId}`}
          className={nodeLink}
          draggable={false}
          aria-label={title}
          style={
            showInitial
              ? { padding: 0, justifyContent: "center", fontSize }
              : opts.compact
                ? { padding: "0 8px", fontSize }
                : opts.rect.w < TITLE_TIGHT_PAD_WIDTH
                  ? { padding: "0 5px", fontSize }
                  : { fontSize }
          }
        >
          {showInlineTitle && <span className={nodeTitle}>{title}</span>}
          {showInitial && (
            <span className={nodeInitial}>
              {(row.title || "?").trim().charAt(0).toUpperCase()}
            </span>
          )}
          {showInlineTitle && docked && (
            <span className={nodeHint}>
              {opts.rootLaid.node.unreadyGoal ? "not ready" : "not scheduled"}
            </span>
          )}
        </Link>
        {opts.withHandles && !completed && (
          <>
            <button
              type="button"
              className={linkHandleIn}
              data-gesture-skip
              aria-label={`Schedule "${title}" after another item — drag to it`}
              onPointerDown={(e) =>
                beginLink(e, rootId, "backward", {
                  x: opts.rect.x,
                  y: opts.rect.y + nodeH / 2,
                })
              }
              onPointerMove={handleLinkMove}
              onPointerUp={handleLinkUp}
              onPointerCancel={() => setLinkDrag(null)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <button
              type="button"
              className={linkHandleOut}
              data-gesture-skip
              aria-label={`Schedule another item after "${title}" — drag to it`}
              onPointerDown={(e) =>
                beginLink(e, rootId, "forward", {
                  x: opts.rect.x + opts.rect.w,
                  y: opts.rect.y + nodeH / 2,
                })
              }
              onPointerMove={handleLinkMove}
              onPointerUp={handleLinkUp}
              onPointerCancel={() => setLinkDrag(null)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          </>
        )}
      </div>
    );
  };

  // Plain items render as one pill. Expanded items (leaf view) render as a
  // band: root pill on top (the drag handle), grouping brace, leaf pills
  // below carrying the link handles.
  const renderItem = (laidLane: LaidLane, laid: LaidNode) => {
    const graphLane = laidLane.lane;
    const nodeDraggable = !!graphLane.queue && !laid.node.completed;
    const accent = accentById.get(laid.node.id) ?? null;
    const dragState = reorder && reorder.id === laid.node.id ? reorder : null;
    const shift = dragState
      ? null
      : (activePreview?.shifts.get(laid.node.id) ?? null);
    const transform = dragState
      ? dragState.phase === "drag"
        ? `translate(${dragState.dx}px, 0px)`
        : activePreview?.anchorShift
          ? `translate(${activePreview.anchorShift.dx}px, ${activePreview.anchorShift.dy}px)`
          : undefined
      : shift
        ? `translate(${shift.dx}px, ${shift.dy}px)`
        : undefined;

    if (laid.leaves.length === 0) {
      return renderPill({
        pillKey: laid.node.id,
        laidLane,
        rootLaid: laid,
        leaf: null,
        rect: { x: laid.x, y: laid.y, w: laid.w },
        offset: { x: 0, y: laidLane.y },
        accent,
        draggable: nodeDraggable,
        withHandles: true,
        transform,
        dragActive: dragState?.phase === "drag",
        settling: dragState?.phase === "settle",
      });
    }

    let leavesLeft = Number.POSITIVE_INFINITY;
    let leavesRight = Number.NEGATIVE_INFINITY;
    for (const leaf of laid.leaves) {
      if (leaf.x < leavesLeft) leavesLeft = leaf.x;
      if (leaf.x + leaf.w > leavesRight) leavesRight = leaf.x + leaf.w;
    }
    const left = Math.min(laid.x, leavesLeft);
    const right = Math.max(laid.x + laid.w, leavesRight);
    const offset = { x: left, y: laid.y };

    return (
      <div
        key={laid.node.id}
        className={band}
        style={{
          left,
          top: laid.y - laidLane.y,
          width: right - left,
          height: laid.leaves[0].y + nodeH - laid.y,
          transform,
        }}
        data-drag-active={dragState?.phase === "drag" || undefined}
        data-settling={dragState?.phase === "settle" || undefined}
      >
        {renderPill({
          pillKey: "root",
          laidLane,
          rootLaid: laid,
          leaf: null,
          rect: { x: laid.x, y: laid.y, w: laid.w },
          offset,
          accent,
          draggable: nodeDraggable,
          withHandles: false,
          compact: true,
          maxWidth: right - left,
        })}
        <div
          className={bandBrace}
          style={{
            left: leavesLeft - left,
            top: rootH + 3,
            width: Math.max(2, leavesRight - leavesLeft),
            height: 7,
          }}
          aria-hidden
        />
        {laid.leaves.map((leaf) =>
          renderPill({
            pillKey: leaf.leaf.id,
            laidLane,
            rootLaid: laid,
            leaf,
            rect: { x: leaf.x, y: leaf.y, w: leaf.w },
            offset,
            accent: leaf.leaf.planner.color ?? accent,
            draggable: false,
            withHandles: !laid.node.completed,
          }),
        )}
      </div>
    );
  };

  const hoveredLaid =
    (hoverLabels || touch) && hovered && !linkDrag && !reorder
      ? (layout.nodeById.get(hovered.rootId) ?? null)
      : null;
  const hoveredLeaf =
    hoveredLaid && hovered?.leafId
      ? (hoveredLaid.leaves.find((l) => l.leaf.id === hovered.leafId) ?? null)
      : null;
  const hoveredRect = hoveredLaid
    ? hoveredLeaf
      ? { x: hoveredLeaf.x, y: hoveredLeaf.y, w: hoveredLeaf.w, h: nodeH }
      : {
          x: hoveredLaid.x,
          y: hoveredLaid.y,
          w: hoveredLaid.w,
          h: hoveredLaid.leaves.length > 0 ? rootH : nodeH,
        }
    : null;

  const badgeRef = useRef<HTMLSpanElement>(null);
  const [badgeWidth, setBadgeWidth] = useState(0);
  useLayoutEffect(() => {
    setBadgeWidth(badgeRef.current?.offsetWidth ?? 0);
  }, [hovered]);

  // Follows the pointer inside nodes wider than the badge, clamped to the
  // scroller's visible window (left edge wins).
  const badgeLeft = (rect: { x: number; w: number }): number => {
    const half = badgeWidth / 2;
    const min = rect.x + half;
    const max = rect.x + rect.w - half;
    const target =
      min >= max ? rect.x + rect.w / 2 : Math.min(Math.max(hoverX, min), max);
    const el = scrollerRef.current;
    if (!el) return target;
    const viewMin = el.scrollLeft + half + 8;
    const viewMax = el.scrollLeft + el.clientWidth - half - 8;
    return Math.max(Math.min(target, viewMax), viewMin);
  };

  // data-zooming disables position easing — zoom moves every node per frame.
  const settledPxPerDayRef = useRef(layout.pxPerDay);
  const zooming = settledPxPerDayRef.current !== layout.pxPerDay;
  useEffect(() => {
    settledPxPerDayRef.current = layout.pxPerDay;
  });

  return (
    <div
      ref={scrollerRef}
      className={scroller}
      data-reordering={reorder?.phase === "drag" || undefined}
      data-touch={touch || undefined}
      onClick={() => setSelectedEdgeId(null)}
    >
      <div className={axis} style={{ width: layout.width }}>
        {ticks
          .filter((tick) => tick.label !== "")
          .map((tick) => (
            <span
              key={`${tick.unit}:${tick.x}`}
              className={axisTick}
              style={{ left: tick.x }}
              data-emphasized={tick.unit === "month" || undefined}
            >
              {tick.label}
            </span>
          ))}
        {layout.dockX !== null && (
          <span className={axisDockLabel} style={{ left: layout.dockX }}>
            Not scheduled
          </span>
        )}
      </div>

      <div
        ref={contentRef}
        className={content}
        style={{ width: layout.width, height: contentHeight }}
        data-zooming={zooming || undefined}
      >
        <svg
          className={svgLayer}
          style={{ zIndex: 0 }}
          width={layout.width}
          height={contentHeight}
          aria-hidden
        >
          {ticks.map((tick) => (
            <line
              key={`${tick.unit}:${tick.x}`}
              x1={tick.x}
              y1={0}
              x2={tick.x}
              y2={contentHeight}
              style={{
                stroke: vars.rule,
                strokeOpacity: TICK_LINE_OPACITY[tick.unit],
              }}
            />
          ))}
          {layout.scheduleEndX !== null && (
            <>
              <rect
                x={layout.scheduleEndX}
                y={0}
                width={Math.max(0, layout.width - layout.scheduleEndX)}
                height={contentHeight}
                style={{ fill: vars.ink, fillOpacity: 0.035 }}
              />
              <line
                x1={layout.scheduleEndX}
                y1={0}
                x2={layout.scheduleEndX}
                y2={contentHeight}
                style={{
                  stroke: vars.muted,
                  strokeWidth: 1.5,
                  strokeDasharray: "6 4",
                }}
              >
                <title>End of the scheduled forecast</title>
              </line>
            </>
          )}
          {layout.lanes
            .filter((laidLane) => !laidLane.lane.headerOnly)
            .map((laidLane) => (
              <line
                key={laidLane.lane.key}
                x1={0}
                y1={laidLane.y + laidLane.height}
                x2={layout.width}
                y2={laidLane.y + laidLane.height}
                style={{ stroke: vars.rule }}
              />
            ))}
          <line
            x1={layout.nowX}
            y1={0}
            x2={layout.nowX}
            y2={contentHeight}
            style={{ stroke: vars.accent.now, strokeWidth: 1.5 }}
          />
        </svg>

        {layout.lanes.map((laidLane) => {
          const laneColor = laneColorByKey.get(laidLane.lane.key);
          return (
            <div
              key={laidLane.lane.key}
              className={laneClass}
              style={{
                height: laidLane.height,
                width: layout.width,
                background: laneColor
                  ? `color-mix(in srgb, ${laneColor} 7%, transparent)`
                  : undefined,
              }}
            >
              <div
                className={laneHead}
                style={
                  laidLane.lane.depth > 0
                    ? { paddingLeft: laidLane.lane.depth * 24 }
                    : undefined
                }
              >
                {laidLane.lane.category && (
                  <CategoryDot
                    color={categoryColor(
                      laidLane.lane.category,
                      dark ? "dark" : "light",
                    )}
                    size={7}
                  />
                )}
                <span className={laneTitle}>
                  {laidLane.lane.queue && (
                    <span className={laneQueueCaption}>{"Queue: "}</span>
                  )}
                  {laidLane.lane.title}
                </span>
                {!laidLane.lane.headerOnly && (
                  <span className={laneCount}>
                    {laidLane.nodes.length}{" "}
                    {laidLane.nodes.length === 1 ? "item" : "items"}
                  </span>
                )}
                {laidLane.lane.queue && laidLane.nodes.length === 0 && (
                  <span className={emptyLaneNote}>
                    empty — add items on the Queues page
                  </span>
                )}
              </div>
              {activePreview &&
                activePreview.laneKey === laidLane.lane.key &&
                activePreview.slot && (
                  <div
                    className={dropSlot}
                    style={{
                      left: activePreview.slot.x,
                      top: activePreview.slot.y - laidLane.y,
                      width: activePreview.slot.w,
                      height: nodeH,
                    }}
                  />
                )}
              {laidLane.nodes.map((laid) => renderItem(laidLane, laid))}
            </div>
          );
        })}

        <svg
          className={svgLayer}
          style={{ zIndex: 1 }}
          width={layout.width}
          height={contentHeight}
        >
          {edges.map((edge) => (
            <g key={edge.key} className={edgeGroup}>
              <path d={edge.path} style={edgeStroke(edge)} />
              <path
                d={`M ${edge.x2} ${edge.y2} l -7 -4 l 0 8 z`}
                style={arrowFill(edge)}
              />
              {edge.kind === "dependency" && edge.edge && (
                <path
                  d={edge.path}
                  className={edgeHit}
                  style={{
                    stroke: "transparent",
                    strokeWidth: touch ? 26 : 14,
                    fill: "none",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdgeId(edge.edge!.id);
                  }}
                >
                  <title>Prerequisite — click to inspect or remove</title>
                </path>
              )}
            </g>
          ))}
        </svg>

        {linkDrag && (
          <svg
            className={svgLayer}
            style={{ zIndex: 4 }}
            width={layout.width}
            height={contentHeight}
            aria-hidden
          >
            <path
              d={edgePath(
                linkDrag.originX,
                linkDrag.originY,
                linkDrag.pointerX,
                linkDrag.pointerY,
                linkDrag.direction === "forward" ? 1 : -1,
              )}
              style={{
                stroke:
                  linkDrag.targetId && !linkDrag.valid
                    ? vars.status.error
                    : vars.accent.primary,
                strokeWidth: 2,
                strokeDasharray: "5 4",
                fill: "none",
              }}
            />
          </svg>
        )}

        {linkDrag?.targetId && !linkDrag.valid && linkDrag.reason && (
          <span
            className={linkReasonChip}
            style={{
              left: linkDrag.pointerX + 12,
              top: linkDrag.pointerY + 14,
            }}
          >
            {linkDrag.reason}
          </span>
        )}

        {hoveredLaid && hoveredRect && (
          <span
            ref={badgeRef}
            className={nodeNameBadge}
            style={{
              left: badgeLeft(hoveredRect),
              top: hoveredRect.y + hoveredRect.h + 6,
            }}
          >
            <span className={nodeNameBadgeTitle}>
              {(hoveredLeaf
                ? hoveredLeaf.leaf.planner.title
                : hoveredLaid.node.planner.title) || "Untitled"}
            </span>
            <span className={nodeNameBadgeMeta}>
              {hoverMeta(hoveredLaid, hoveredLeaf)}
            </span>
            {touch && hovered && (
              <Link
                href={`/items/${hovered.leafId ?? hovered.rootId}`}
                className={nodeBadgeOpen}
                data-gesture-skip
              >
                Open →
              </Link>
            )}
          </span>
        )}

        {selectedEdge?.edge && (
          <div
            className={edgeChip}
            style={{
              left: (selectedEdge.x1 + selectedEdge.x2) / 2,
              top: (selectedEdge.y1 + selectedEdge.y2) / 2,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={edgeChipLabel}>
              {layout.nodeById.get(selectedEdge.fromId)?.node.planner.title ||
                "Untitled"}{" "}
              → before →{" "}
              {layout.nodeById.get(selectedEdge.toId)?.node.planner.title ||
                "Untitled"}
            </span>
            <button
              type="button"
              className={edgeChipRemove}
              aria-label="Remove dependency"
              onClick={() => {
                onRemoveDependency(selectedEdge.edge!.id);
                setSelectedEdgeId(null);
              }}
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
