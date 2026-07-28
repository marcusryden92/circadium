import { addDays, format, startOfDay } from "date-fns";
import type {
  Category,
  Planner,
  PlannerDependency,
  Queue,
  SimpleEvent,
} from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { plannerIdFromEventId } from "@/utils/planRecurrence";
import { isCompletedSegmentEventId } from "@/utils/taskSplitting";
import { sortQueueMembers } from "@/utils/queue-handlers/mutateQueueMembers";
import { plannerIsCompleted } from "@/utils/plannerCompletion";

export type GraphSpan = { start: number; end: number };

export const INDEPENDENT_LANE_KEY = "independent";

const DAY_MS = 24 * 60 * 60 * 1000;

export const ZOOM_MIN_PX_PER_DAY = 6;
export const ZOOM_MAX_PX_PER_DAY = 960;

const NODE_HEIGHT_MIN = 18;
const NODE_HEIGHT_MAX = 30;

// Node size follows the zoom (log-scaled, like the slider), so zooming out
// shrinks the tiles with the timeline. Min width equals the height, so a
// fully squished node clamps to a perfect circle at every zoom level.
export function nodeHeightForZoom(pxPerDay: number): number {
  const t = Math.max(
    0,
    Math.min(
      1,
      Math.log(pxPerDay / ZOOM_MIN_PX_PER_DAY) /
        Math.log(ZOOM_MAX_PX_PER_DAY / ZOOM_MIN_PX_PER_DAY),
    ),
  );
  return Math.round(NODE_HEIGHT_MIN + t * (NODE_HEIGHT_MAX - NODE_HEIGHT_MIN));
}

// The band's root card is a compact label, not a span bar — shorter than
// leaf pills and only as wide as its title (width is CSS max-content).
export const bandRootHeight = (nodeHeight: number): number =>
  Math.max(14, Math.round(nodeHeight * 0.65));

export const GRAPH_METRICS = {
  rowSpacing: 8,
  lanePadTop: 8,
  lanePadBottom: 14,
  laneHeadHeight: 26,
  headerLanePadBottom: 2,
  dockNodeWidth: 150,
  dockGap: 56,
  dockNodeGap: 10,
  rightPad: 48,
  minRowGapX: 6,
  // Vertical gap between an expanded item's root pill and its leaf row —
  // hosts the grouping brace.
  bandGap: 12,
} as const;

const makeRootResolver = (planner: Planner[]) => {
  const parentById = new Map<string, string | null>();
  for (const row of planner) parentById.set(row.id, row.parentId ?? null);

  const rootCache = new Map<string, string | null>();
  return (id: string): string | null => {
    const cached = rootCache.get(id);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    let current = id;
    let root: string | null = null;
    for (;;) {
      if (seen.has(current)) break;
      seen.add(current);
      const parent = parentById.get(current);
      if (parent === undefined) break;
      if (parent === null) {
        root = current;
        break;
      }
      current = parent;
    }
    rootCache.set(id, root);
    return root;
  };
};

// Completed-segment events on a goal-typed row WITH children are calendar
// history from before the row became a container (a splittable task retyped
// into a goal): the engine never schedules a goal container's own row, so
// such segments must not drag the root's span back in time. A task-typed
// row with children still schedules its own block — its segments are live.
const makeStaleSegmentCheck = (planner: Planner[]) => {
  const goalContainers = new Set<string>();
  const goalIds = new Set<string>();
  for (const row of planner) {
    if (row.plannerType === "goal") goalIds.add(row.id);
  }
  for (const row of planner) {
    if (row.parentId && goalIds.has(row.parentId)) {
      goalContainers.add(row.parentId);
    }
  }
  return (eventId: string, plannerId: string): boolean =>
    isCompletedSegmentEventId(eventId) && goalContainers.has(plannerId);
};

export function buildRootSpans(
  calendar: SimpleEvent[],
  planner: Planner[],
): Map<string, GraphSpan> {
  const rootOf = makeRootResolver(planner);
  const isStaleSegment = makeStaleSegmentCheck(planner);
  const spans = new Map<string, GraphSpan>();
  for (const event of calendar) {
    if (event.extendedProps?.eventType !== "planner") continue;
    const plannerId = plannerIdFromEventId(event.id);
    if (isStaleSegment(event.id, plannerId)) continue;
    const rootId = rootOf(plannerId);
    if (!rootId) continue;
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const existing = spans.get(rootId);
    if (!existing) {
      spans.set(rootId, { start, end });
    } else {
      if (start < existing.start) existing.start = start;
      if (end > existing.end) existing.end = end;
    }
  }
  return spans;
}

// Leaf-level spans grouped by root: rootId -> leaf plannerId -> span. A
// leaf's chunk/segment/occurrence events aggregate into one span, so the
// leaf view shows per-leaf placement without chunk-level noise.
export function buildLeafSpans(
  calendar: SimpleEvent[],
  planner: Planner[],
): Map<string, Map<string, GraphSpan>> {
  const rootOf = makeRootResolver(planner);
  const isStaleSegment = makeStaleSegmentCheck(planner);
  const result = new Map<string, Map<string, GraphSpan>>();
  for (const event of calendar) {
    if (event.extendedProps?.eventType !== "planner") continue;
    const leafId = plannerIdFromEventId(event.id);
    if (isStaleSegment(event.id, leafId)) continue;
    const rootId = rootOf(leafId);
    if (!rootId) continue;
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    let bucket = result.get(rootId);
    if (!bucket) {
      bucket = new Map();
      result.set(rootId, bucket);
    }
    const existing = bucket.get(leafId);
    if (!existing) {
      bucket.set(leafId, { start, end });
    } else {
      if (start < existing.start) existing.start = start;
      if (end > existing.end) existing.end = end;
    }
  }
  return result;
}

export type GraphLeaf = {
  id: string;
  planner: Planner;
  span: GraphSpan;
  completed: boolean;
};

export type GraphNode = {
  id: string;
  planner: Planner;
  span: GraphSpan | null;
  laneKey: string;
  completed: boolean;
  unreadyGoal: boolean;
  // Leaf view only: the root's placed bottom-layer blocks, span-ordered.
  // Empty when the item's only block is its own (nothing to expand).
  leaves: GraphLeaf[];
};

export type GraphLane = {
  key: string;
  queue: Queue | null;
  category: Category | null;
  title: string;
  // Heading indent: category tree depth; an attached queue sits one below it.
  depth: number;
  // Category heading with no lane body — its items live in lanes below it.
  headerOnly: boolean;
  nodes: GraphNode[];
  // Full member order (completed included) — drop-index math runs against it.
  memberOrderRows: Planner[];
};

const sortNodesByStart = (nodes: GraphNode[]): GraphNode[] =>
  [...nodes].sort((a, b) => {
    const aStart = a.span?.start ?? Number.POSITIVE_INFINITY;
    const bStart = b.span?.start ?? Number.POSITIVE_INFINITY;
    return (
      aStart - bStart ||
      (a.planner.title || "").localeCompare(b.planner.title || "")
    );
  });

export function buildGraphLanes({
  planner,
  queues,
  dependencies,
  categories,
  spans,
  leafSpans,
  showCompleted,
  showLooseTasks,
}: {
  planner: Planner[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  categories: Category[];
  spans: Map<string, GraphSpan>;
  leafSpans?: Map<string, Map<string, GraphSpan>> | null;
  showCompleted: boolean;
  /** Admit root tasks with no queue/dependency involvement as nodes. */
  showLooseTasks?: boolean;
}): GraphLane[] {
  const plannerById = new Map(planner.map((p) => [p.id, p]));
  const knownCategoryIds = new Set(categories.map((c) => c.id));
  const orderedQueues = [...queues].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );

  const toLeaves = (rootId: string): GraphLeaf[] => {
    const bucket = leafSpans?.get(rootId);
    if (!bucket) return [];
    const entries: GraphLeaf[] = [];
    for (const [leafId, span] of bucket) {
      const leafRow = plannerById.get(leafId);
      if (!leafRow) continue;
      entries.push({
        id: leafId,
        planner: leafRow,
        span,
        completed: plannerIsCompleted(leafRow),
      });
    }
    entries.sort(
      (a, b) =>
        a.span.start - b.span.start ||
        (a.planner.title || "").localeCompare(b.planner.title || ""),
    );
    // A lone block that is the root's own is nothing to expand.
    return entries.some((leaf) => leaf.id !== rootId) ? entries : [];
  };

  const toNode = (row: Planner, laneKey: string): GraphNode => ({
    id: row.id,
    planner: row,
    span: spans.get(row.id) ?? null,
    laneKey,
    completed: plannerIsCompleted(row),
    unreadyGoal: row.plannerType === "goal" && row.isReady !== true,
    leaves: toLeaves(row.id),
  });

  const queuedIds = new Set<string>();
  const memberRowsByQueueId = new Map<string, Planner[]>();
  for (const queue of orderedQueues) {
    const rows = sortQueueMembers(queue.members)
      .map((m) => plannerById.get(m.plannerId))
      .filter((p): p is Planner => !!p);
    for (const row of rows) queuedIds.add(row.id);
    memberRowsByQueueId.set(queue.id, rows);
  }

  // A category-attached queue nests under its category like a subcategory.
  const queuesByCategoryId = new Map<string, Queue[]>();
  const unattachedQueues: Queue[] = [];
  for (const queue of orderedQueues) {
    if (queue.categoryId && knownCategoryIds.has(queue.categoryId)) {
      const list = queuesByCategoryId.get(queue.categoryId);
      if (list) list.push(queue);
      else queuesByCategoryId.set(queue.categoryId, [queue]);
    } else {
      unattachedQueues.push(queue);
    }
  }

  const toQueueLane = (queue: Queue, depth: number): GraphLane => {
    const rows = memberRowsByQueueId.get(queue.id) ?? [];
    return {
      key: queue.id,
      queue,
      category: null,
      title: queue.title || "Untitled queue",
      depth,
      headerOnly: false,
      nodes: rows
        .map((row) => toNode(row, queue.id))
        .filter((n) => showCompleted || !n.completed),
      memberOrderRows: rows,
    };
  };

  const lanes: GraphLane[] = unattachedQueues.map((queue) =>
    toQueueLane(queue, 0),
  );

  const endpointIds = new Set<string>();
  for (const edge of dependencies) {
    endpointIds.add(edge.predecessorId);
    endpointIds.add(edge.successorId);
  }

  const independentNodes = planner
    .filter(
      (p) =>
        p.parentId == null &&
        p.isTriaged &&
        (p.plannerType === "task" || p.plannerType === "goal") &&
        !queuedIds.has(p.id) &&
        (p.plannerType === "goal" ||
          showLooseTasks === true ||
          endpointIds.has(p.id)),
    )
    .map((row) => toNode(row, INDEPENDENT_LANE_KEY))
    .filter((n) => showCompleted || !n.completed);

  // Non-queue items group under their category, lanes ordered as an indented
  // depth-first walk of the category tree. Roots carry categoryId directly
  // (the root-only invariant), so no parent-chain resolution is needed.
  const nodesByCategoryId = new Map<string | null, GraphNode[]>();
  for (const node of independentNodes) {
    const categoryId =
      node.planner.categoryId && knownCategoryIds.has(node.planner.categoryId)
        ? node.planner.categoryId
        : null;
    const list = nodesByCategoryId.get(categoryId);
    if (list) list.push(node);
    else nodesByCategoryId.set(categoryId, [node]);
  }

  const childrenByParent = new Map<string | null, Category[]>();
  for (const category of [...categories].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  )) {
    const parentKey =
      category.parentId && knownCategoryIds.has(category.parentId)
        ? category.parentId
        : null;
    const list = childrenByParent.get(parentKey);
    if (list) list.push(category);
    else childrenByParent.set(parentKey, [category]);
  }

  const subtreeHasContentCache = new Map<string, boolean>();
  const subtreeHasContent = (categoryId: string): boolean => {
    const cached = subtreeHasContentCache.get(categoryId);
    if (cached !== undefined) return cached;
    // Seed before recursing — a parentId cycle then resolves to false
    // instead of recursing forever.
    subtreeHasContentCache.set(categoryId, false);
    const result =
      (nodesByCategoryId.get(categoryId)?.length ?? 0) > 0 ||
      (queuesByCategoryId.get(categoryId)?.length ?? 0) > 0 ||
      (childrenByParent.get(categoryId) ?? []).some((child) =>
        subtreeHasContent(child.id),
      );
    subtreeHasContentCache.set(categoryId, result);
    return result;
  };

  const walkCategory = (category: Category, depth: number) => {
    if (!subtreeHasContent(category.id)) return;
    const direct = nodesByCategoryId.get(category.id) ?? [];
    lanes.push({
      key: `category:${category.id}`,
      queue: null,
      category,
      title: category.name,
      depth,
      headerOnly: direct.length === 0,
      nodes: sortNodesByStart(direct),
      memberOrderRows: [],
    });
    for (const queue of queuesByCategoryId.get(category.id) ?? []) {
      lanes.push(toQueueLane(queue, depth + 1));
    }
    for (const child of childrenByParent.get(category.id) ?? []) {
      walkCategory(child, depth + 1);
    }
  };
  for (const top of childrenByParent.get(null) ?? []) walkCategory(top, 0);

  const uncategorized = nodesByCategoryId.get(null) ?? [];
  if (uncategorized.length > 0) {
    lanes.push({
      key: INDEPENDENT_LANE_KEY,
      queue: null,
      category: null,
      title: "Uncategorized",
      depth: 0,
      headerOnly: false,
      nodes: sortNodesByStart(uncategorized),
      memberOrderRows: [],
    });
  }

  return lanes;
}

export type LaidLeaf = {
  leaf: GraphLeaf;
  x: number;
  w: number;
  y: number;
};

export type LaidNode = {
  node: GraphNode;
  x: number;
  w: number;
  y: number;
  row: number;
  docked: boolean;
  leaves: LaidLeaf[];
};

export type LaidLane = {
  lane: GraphLane;
  y: number;
  height: number;
  rows: number;
  nodes: LaidNode[];
};

export type GraphLayout = {
  domainStart: number;
  domainEnd: number;
  pxPerDay: number;
  nodeHeight: number;
  width: number;
  height: number;
  lanes: LaidLane[];
  nodeById: Map<string, LaidNode>;
  dockX: number | null;
  nowX: number;
  // Where the engine's placements end; null when nothing is scheduled.
  scheduleEndX: number | null;
};

export function layoutGraph(
  lanes: GraphLane[],
  { pxPerDay, now }: { pxPerDay: number; now: number },
): GraphLayout {
  const M = GRAPH_METRICS;
  const nodeHeight = nodeHeightForZoom(pxPerDay);

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const lane of lanes) {
    for (const node of lane.nodes) {
      if (!node.span) continue;
      if (node.span.start < minStart) minStart = node.span.start;
      if (node.span.end > maxEnd) maxEnd = node.span.end;
    }
  }
  const rawScheduleEnd =
    maxEnd === Number.NEGATIVE_INFINITY ? null : maxEnd;
  if (minStart === Number.POSITIVE_INFINITY) {
    minStart = now;
    maxEnd = now + 13 * DAY_MS;
  }
  minStart = Math.min(minStart, now);
  maxEnd = Math.max(maxEnd, now);
  const domainStart = minStart - DAY_MS;
  const domainEnd = maxEnd + DAY_MS;

  const toX = (t: number) => ((t - domainStart) / DAY_MS) * pxPerDay;

  const hasDock = lanes.some((lane) => lane.nodes.some((n) => !n.span));
  const dockX = hasDock ? toX(domainEnd) + M.dockGap : null;

  let yCursor = 0;
  let maxRight = toX(domainEnd);
  let scheduledRight = Number.NEGATIVE_INFINITY;
  const laidLanes: LaidLane[] = [];
  const nodeById = new Map<string, LaidNode>();

  for (const lane of lanes) {
    if (lane.headerOnly) {
      const height = M.laneHeadHeight + M.headerLanePadBottom;
      laidLanes.push({ lane, y: yCursor, height, rows: 0, nodes: [] });
      yCursor += height;
      continue;
    }
    const laid: LaidNode[] = [];
    let dockIndex = 0;
    for (const node of lane.nodes) {
      if (node.span) {
        const left = toX(node.span.start);
        const width = Math.max(nodeHeight, toX(node.span.end) - left);
        const leaves: LaidLeaf[] = node.leaves.map((leaf) => {
          const leafLeft = toX(leaf.span.start);
          return {
            leaf,
            x: leafLeft,
            w: Math.max(nodeHeight, toX(leaf.span.end) - leafLeft),
            y: 0,
          };
        });
        laid.push({
          node,
          x: left,
          w: width,
          y: 0,
          row: 0,
          docked: false,
          leaves,
        });
      } else {
        const left =
          (dockX ?? 0) + dockIndex * (M.dockNodeWidth + M.dockNodeGap);
        dockIndex += 1;
        laid.push({
          node,
          x: left,
          w: M.dockNodeWidth,
          y: 0,
          row: 0,
          docked: true,
          leaves: [],
        });
      }
    }

    // Expanded items (root card + brace + leaf row) always get a row of their
    // own so no other item's pills overlap the band.
    const rootHeight = bandRootHeight(nodeHeight);
    const bandHeight = rootHeight + M.bandGap + nodeHeight;
    const hasBands = laid.some((item) => item.leaves.length > 0);
    const rowPlan: { items: LaidNode[]; h: number }[] = [];
    if (lane.queue && !hasBands) {
      // Weave rows so back-to-back members don't read as one bar.
      laid.forEach((item, index) => {
        item.row = index % 2;
      });
      const rows = Math.min(2, Math.max(1, laid.length));
      for (let row = 0; row < rows; row++) {
        rowPlan.push({
          items: laid.filter((item) => item.row === row),
          h: nodeHeight,
        });
      }
    } else if (lane.queue) {
      for (const item of laid) {
        rowPlan.push({
          items: [item],
          h: item.leaves.length > 0 ? bandHeight : nodeHeight,
        });
      }
    } else {
      const plain = laid
        .filter((item) => item.leaves.length === 0)
        .sort((a, b) => a.x - b.x);
      const rowEnds: number[] = [];
      const packed: LaidNode[][] = [];
      for (const item of plain) {
        let row = rowEnds.findIndex((end) => end + M.minRowGapX <= item.x);
        if (row === -1) {
          row = rowEnds.length;
          rowEnds.push(Number.NEGATIVE_INFINITY);
          packed.push([]);
        }
        rowEnds[row] = item.x + item.w;
        packed[row].push(item);
      }
      for (const items of packed) rowPlan.push({ items, h: nodeHeight });
      const bands = laid
        .filter((item) => item.leaves.length > 0)
        .sort((a, b) => a.x - b.x);
      for (const item of bands) rowPlan.push({ items: [item], h: bandHeight });
    }
    if (rowPlan.length === 0) rowPlan.push({ items: [], h: nodeHeight });

    let rowY = yCursor + M.laneHeadHeight + M.lanePadTop;
    rowPlan.forEach((row, index) => {
      for (const item of row.items) {
        item.row = index;
        item.y = rowY;
        let right = item.x + item.w;
        for (const leaf of item.leaves) {
          leaf.y = rowY + rootHeight + M.bandGap;
          if (leaf.x + leaf.w > right) right = leaf.x + leaf.w;
        }
        if (right > maxRight) maxRight = right;
        if (!item.docked && right > scheduledRight) scheduledRight = right;
        nodeById.set(item.node.id, item);
      }
      rowY += row.h + M.rowSpacing;
    });
    const rowsHeight =
      rowPlan.reduce((sum, row) => sum + row.h, 0) +
      (rowPlan.length - 1) * M.rowSpacing;
    const height =
      M.laneHeadHeight + M.lanePadTop + rowsHeight + M.lanePadBottom;

    laidLanes.push({ lane, y: yCursor, height, rows: rowPlan.length, nodes: laid });
    yCursor += height;
  }

  return {
    domainStart,
    domainEnd,
    pxPerDay,
    nodeHeight,
    width: Math.ceil(maxRight + M.rightPad),
    height: yCursor,
    lanes: laidLanes,
    nodeById,
    dockX,
    nowX: toX(now),
    // Min-width clamping can render a pill past its span's raw end.
    scheduleEndX:
      rawScheduleEnd !== null
        ? Math.max(toX(rawScheduleEnd), scheduledRight)
        : null,
  };
}

export type GraphTickUnit = "hour" | "day" | "week" | "month";

export type GraphTick = { x: number; label: string; unit: GraphTickUnit };

export type GraphTickUnits = Record<GraphTickUnit, boolean>;

const MAX_TICK_DAYS = 1500;
const TICK_LINE_MIN_SPACING = 10;
const TICK_LABEL_MIN_SPACING: Record<GraphTickUnit, number> = {
  hour: 44,
  day: 56,
  week: 56,
  month: 32,
};
// Hour lines stay hourly, but labels thin out to every Nth hour so adjacent
// timestamps can never collide.
const HOUR_LABEL_STRIDES = [1, 2, 3, 6, 12];

// Each enabled unit contributes vertical markers, auto-hidden while its
// spacing is too tight to read (lines below 10px apart, labels per unit).
// A day that is also a week/month boundary belongs to the coarsest visible
// unit. Hour ticks are viewport-windowed — a season-long domain at hour zoom
// would otherwise emit tens of thousands of ticks.
export function buildGraphTicks(
  layout: GraphLayout,
  weekStartDay: WeekDayIntegers,
  units: GraphTickUnits,
  window?: { start: number; end: number },
): GraphTick[] {
  const { domainStart, domainEnd, pxPerDay } = layout;
  const toX = (t: number) => ((t - domainStart) / DAY_MS) * pxPerDay;

  const spacing: Record<GraphTickUnit, number> = {
    hour: pxPerDay / 24,
    day: pxPerDay,
    week: pxPerDay * 7,
    month: pxPerDay * 28,
  };
  const lineVisible = (unit: GraphTickUnit) =>
    units[unit] && spacing[unit] >= TICK_LINE_MIN_SPACING;
  const labelFor = (unit: GraphTickUnit, text: string) =>
    spacing[unit] >= TICK_LABEL_MIN_SPACING[unit] ? text : "";

  const ticks: GraphTick[] = [];
  const taken = new Set<number>();
  const push = (x: number, label: string, unit: GraphTickUnit) => {
    const key = Math.round(x * 2);
    if (taken.has(key)) return;
    taken.add(key);
    ticks.push({ x, label, unit });
  };

  let day = startOfDay(new Date(domainStart));
  for (
    let i = 0;
    day.getTime() <= domainEnd && i < MAX_TICK_DAYS;
    i++, day = addDays(day, 1)
  ) {
    if (day.getTime() < domainStart) continue;
    const isMonthStart = day.getDate() === 1;
    const isWeekStart = day.getDay() === weekStartDay;
    if (isMonthStart && lineVisible("month")) {
      push(toX(day.getTime()), labelFor("month", format(day, "MMM")), "month");
    } else if (isWeekStart && lineVisible("week")) {
      push(toX(day.getTime()), labelFor("week", format(day, "MMM d")), "week");
    } else if (lineVisible("day")) {
      push(toX(day.getTime()), labelFor("day", format(day, "EEE d")), "day");
    }
  }

  if (lineVisible("hour")) {
    const HOUR_MS = 60 * 60 * 1000;
    const labelStride =
      HOUR_LABEL_STRIDES.find(
        (n) => n * spacing.hour >= TICK_LABEL_MIN_SPACING.hour,
      ) ?? null;
    const from = window
      ? Math.max(domainStart, domainStart + (window.start / pxPerDay) * DAY_MS)
      : domainStart;
    const to = window
      ? Math.min(domainEnd, domainStart + (window.end / pxPerDay) * DAY_MS)
      : domainEnd;
    let hourDay = startOfDay(new Date(from));
    for (
      let i = 0;
      hourDay.getTime() <= to && i < MAX_TICK_DAYS;
      i++, hourDay = addDays(hourDay, 1)
    ) {
      for (let hour = 0; hour < 24; hour++) {
        const t = hourDay.getTime() + hour * HOUR_MS;
        if (t < from || t > to || t > domainEnd) continue;
        const label =
          labelStride !== null && hour % labelStride === 0
            ? format(new Date(t), "HH:mm")
            : "";
        push(toX(t), label, "hour");
      }
    }
  }

  return ticks;
}
