import type { Category, Planner } from "@/types/prisma";
import { buildCategoryTree, type CategoryNode } from "@/utils/categoryUtils";
import { categoryColor } from "@/lib/theme";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import { getSortedTreeBottomLayer } from "@/utils/goalPageHandlers";

export const MINDMAP_ROOT_ID = "mindmap:root";
export const MINDMAP_UNCATEGORIZED_ID = "mindmap:uncategorized";

// "role" is a top-level category (depth 1), "category" is any nested one.
// Items are the root-level planners filed under a category (or none); "leaf"
// nodes are a goal's bottom-layer subtasks, shown only when leaf view is on.
export type MindmapKind = "root" | "role" | "category" | "item" | "leaf";

export type MindmapTreeNode = {
  id: string;
  kind: MindmapKind;
  label: string;
  // Own accent — the dot color for categories, the pill accent for items.
  color: string | null;
  // The role hue inherited down the branch: connectors and uncolored items
  // adopt it so a whole role reads as one color family.
  branchColor: string | null;
  category: Category | null;
  planner: Planner | null;
  itemCount: number;
  completed: boolean;
  href: string | null;
  children: MindmapTreeNode[];
};

const sortItemsByTitle = (items: Planner[]): Planner[] =>
  // Root sortOrder is non-semantic (0 on roots), so title is the stable key.
  [...items].sort((a, b) => (a.title || "").localeCompare(b.title || ""));

export function buildMindmapTree({
  planner,
  categories,
  userName,
  theme,
  showCompleted,
  hideEmpty,
  showLeaves,
}: {
  planner: Planner[];
  categories: Category[];
  userName: string;
  theme: "light" | "dark";
  showCompleted: boolean;
  hideEmpty: boolean;
  showLeaves: boolean;
}): MindmapTreeNode {
  const categoryTree = buildCategoryTree(categories);

  // Only categories actually reachable from a root render as nodes. An item
  // filed under an orphan category (dangling parentId, e.g. after its parent
  // was deleted) would otherwise vanish — it falls into Uncategorized instead.
  const reachableCategoryIds = new Set<string>();
  const collectReachable = (nodes: CategoryNode[]): void => {
    for (const node of nodes) {
      reachableCategoryIds.add(node.id);
      collectReachable(node.children);
    }
  };
  collectReachable(categoryTree);

  // Items group by their DIRECT categoryId — roots carry it (the root-only
  // invariant), so no parent-chain walk is needed here.
  const itemsByCategory = new Map<string | null, Planner[]>();
  for (const item of planner) {
    if (item.parentId != null || !item.isTriaged) continue;
    if (item.plannerType !== "task" && item.plannerType !== "goal") continue;
    if (!showCompleted && plannerIsCompleted(item)) continue;
    const categoryId =
      item.categoryId && reachableCategoryIds.has(item.categoryId)
        ? item.categoryId
        : null;
    const list = itemsByCategory.get(categoryId);
    if (list) list.push(item);
    else itemsByCategory.set(categoryId, [item]);
  }

  const leafNode = (
    leaf: Planner,
    branchColor: string | null,
  ): MindmapTreeNode => ({
    id: leaf.id,
    kind: "leaf",
    label: leaf.title || "Untitled",
    color: leaf.color ?? branchColor,
    branchColor,
    category: null,
    planner: leaf,
    itemCount: 0,
    completed: plannerIsCompleted(leaf),
    href: `/items/${leaf.id}`,
    children: [],
  });

  // A goal expands into its bottom-layer subtasks (structural, not scheduled,
  // and detour links are not followed). The goal itself is the sole "leaf" of
  // a childless goal — filter it out so nothing expands into itself.
  const goalLeaves = (goal: Planner, branchColor: string | null) =>
    getSortedTreeBottomLayer(planner, goal.id)
      .filter(
        (leaf) =>
          leaf.id !== goal.id &&
          (showCompleted || !plannerIsCompleted(leaf)),
      )
      .map((leaf) => leafNode(leaf, branchColor));

  const itemNode = (
    item: Planner,
    branchColor: string | null,
  ): MindmapTreeNode => ({
    id: item.id,
    kind: "item",
    label: item.title || "Untitled",
    color: item.color ?? branchColor,
    branchColor,
    category: null,
    planner: item,
    itemCount: 0,
    completed: plannerIsCompleted(item),
    href: `/items/${item.id}`,
    children:
      showLeaves && item.plannerType === "goal"
        ? goalLeaves(item, branchColor)
        : [],
  });

  const categoryNode = (
    category: CategoryNode,
    depth: number,
    inheritedBranch: string | null,
  ): MindmapTreeNode => {
    const ownColor = categoryColor(category, theme);
    const branchColor = depth === 1 ? ownColor : (inheritedBranch ?? ownColor);
    const childCategories = category.children.map((child) =>
      categoryNode(child, depth + 1, branchColor),
    );
    const directItems = sortItemsByTitle(
      itemsByCategory.get(category.id) ?? [],
    ).map((item) => itemNode(item, branchColor));
    const children = [...childCategories, ...directItems];
    const itemCount =
      directItems.length +
      childCategories.reduce((sum, node) => sum + node.itemCount, 0);
    return {
      id: category.id,
      kind: depth === 1 ? "role" : "category",
      label: category.name,
      color: ownColor,
      branchColor,
      category,
      planner: null,
      itemCount,
      completed: false,
      href: "/categories",
      children,
    };
  };

  // Drop category branches with nothing under them when hiding empties; items
  // and the uncategorized bucket are always kept when present.
  const pruneEmpty = (node: MindmapTreeNode): MindmapTreeNode | null => {
    if (node.kind === "item") return node;
    if (node.id === MINDMAP_UNCATEGORIZED_ID) return node;
    const children = node.children
      .map(pruneEmpty)
      .filter((n): n is MindmapTreeNode => n !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  };

  let rootChildren = categoryTree.map((category) =>
    categoryNode(category, 1, null),
  );

  const uncategorizedItems = sortItemsByTitle(itemsByCategory.get(null) ?? []);
  if (uncategorizedItems.length > 0) {
    rootChildren.push({
      id: MINDMAP_UNCATEGORIZED_ID,
      kind: "role",
      label: "Uncategorized",
      color: null,
      branchColor: null,
      category: null,
      planner: null,
      itemCount: uncategorizedItems.length,
      completed: false,
      href: null,
      children: uncategorizedItems.map((item) => itemNode(item, null)),
    });
  }

  if (hideEmpty) {
    rootChildren = rootChildren
      .map(pruneEmpty)
      .filter((n): n is MindmapTreeNode => n !== null);
  }

  return {
    id: MINDMAP_ROOT_ID,
    kind: "root",
    label: userName || "Me",
    color: null,
    branchColor: null,
    category: null,
    planner: null,
    itemCount: rootChildren.reduce((sum, node) => sum + node.itemCount, 0),
    completed: false,
    href: null,
    children: rootChildren,
  };
}

export type MindmapLaidNode = {
  node: MindmapTreeNode;
  depth: number;
  // Sign of x: +1 right, -1 left, 0 center. Cosmetic, layout-independent.
  side: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

// A cubic bezier from parent to child — points, not an SVG string, so the
// canvas can draw it directly with bezierCurveTo.
export type MindmapLaidEdge = {
  id: string;
  fromId: string;
  toId: string;
  color: string | null;
  x1: number;
  y1: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x2: number;
  y2: number;
};

export type MindmapLayout = {
  nodes: MindmapLaidNode[];
  edges: MindmapLaidEdge[];
  nodeById: Map<string, MindmapLaidNode>;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type MindmapLayoutKind = "radial" | "horizontal";

export type MindmapLayoutOptions = {
  layout: MindmapLayoutKind;
  // Distance between a node and the next generation outward.
  levelDistance: number;
  // Gap reserved between stacked siblings.
  siblingSpacing: number;
  // Radial only: scales the first-tier radius — below 1 pulls the arms toward
  // the center (the de-overlap pass keeps them legible), above 1 pushes them
  // out so labels breathe.
  armClearance: number;
  // Radial only: how wide each role's fan opens vs. the slice it is allotted —
  // 1 fills the whole slice (one big starburst), lower narrows the fan into a
  // distinct spoke and pushes it out radially so leaf spacing is preserved.
  branchSpread: number;
  // 0 = gentle S, higher = more pronounced branch curve.
  branchCurve: number;
  // Radial only: the size of each goal's leaf bubble — 0 packs the leaves as
  // tight shells hugging the parent, 1 grows the radius until every leaf sits
  // on one big circle.
  leafSpread: number;
  // Radial only: how far the bubble wraps around its goal — 0 a narrow
  // forward cone, 1 a near-full circle whose gap faces the parent connector.
  leafWrap: number;
};

export const MINDMAP_LAYOUT_DEFAULTS: MindmapLayoutOptions = {
  layout: "radial",
  levelDistance: 150,
  siblingSpacing: 14,
  armClearance: 1.15,
  branchSpread: 0.6,
  branchCurve: 0.45,
  leafSpread: 0.5,
  leafWrap: 1,
};

const TAU = Math.PI * 2;
const CANVAS_PADDING = 160;
const BRANCH_SPREAD_MIN = 0.3;

// S-curve control-handle fraction along the depth axis, from the curve setting.
const handleFraction = (curve: number): number => 0.5 - clamp01(curve) * 0.34;
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Pill footprint — the canvas draws pills at exactly this width, so the
// reserved chrome must cover both side paddings PLUS the color dot every
// non-root pill carries (and the count on roles/categories); otherwise the
// label is clipped short.
function estimateSize(node: MindmapTreeNode): { w: number; h: number } {
  if (node.kind === "root") return { w: 112, h: 112 };
  const charWidth =
    node.kind === "role" ? 9 : node.kind === "category" ? 7.4 : 6.9;
  const labelCap =
    node.kind === "leaf" ? 120 : node.kind === "item" ? 150 : 168;
  const labelWidth = Math.min(labelCap, node.label.length * charWidth);
  const paddingWidth =
    node.kind === "role"
      ? 54
      : node.kind === "category"
        ? 50
        : node.kind === "leaf"
          ? 34
          : 40; // item
  const height =
    node.kind === "role"
      ? 32
      : node.kind === "category"
        ? 27
        : node.kind === "leaf"
          ? 22
          : 24;
  return { w: Math.max(44, Math.round(labelWidth + paddingWidth)), h: height };
}

type LayoutNode = {
  node: MindmapTreeNode;
  depth: number;
  parentIndex: number;
  children: number[];
  side: number;
  w: number;
  h: number;
  x: number;
  y: number;
};

export function layoutMindmap(
  root: MindmapTreeNode,
  options: MindmapLayoutOptions = MINDMAP_LAYOUT_DEFAULTS,
): MindmapLayout {
  const items: LayoutNode[] = [];
  const flatten = (
    node: MindmapTreeNode,
    depth: number,
    parentIndex: number,
  ) => {
    const size = estimateSize(node);
    const index = items.length;
    items.push({
      node,
      depth,
      parentIndex,
      children: [],
      side: 0,
      w: size.w,
      h: size.h,
      x: 0,
      y: 0,
    });
    if (parentIndex >= 0) items[parentIndex].children.push(index);
    for (const child of node.children) flatten(child, depth + 1, index);
  };
  flatten(root, 0, -1);

  const edges =
    options.layout === "radial"
      ? layoutRadial(items, options)
      : layoutHorizontal(items, options);

  // Root is pinned at the origin in both layouts, so the reported center is a
  // constant (0, 0) and the map stays put under the viewport when the tree
  // changes. width/height are the symmetric extent so the page frames it.
  const laid: MindmapLaidNode[] = [];
  const nodeById = new Map<string, MindmapLaidNode>();
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const it of items) {
    const rec: MindmapLaidNode = {
      node: it.node,
      depth: it.depth,
      side: it.side,
      x: it.x,
      y: it.y,
      w: it.w,
      h: it.h,
    };
    laid.push(rec);
    nodeById.set(it.node.id, rec);
    maxAbsX = Math.max(maxAbsX, Math.abs(it.x) + it.w / 2);
    maxAbsY = Math.max(maxAbsY, Math.abs(it.y) + it.h / 2);
  }

  return {
    nodes: laid,
    edges,
    nodeById,
    width: Math.ceil((maxAbsX + CANVAS_PADDING) * 2),
    height: Math.ceil((maxAbsY + CANVAS_PADDING) * 2),
    centerX: 0,
    centerY: 0,
  };
}

// --- Horizontal balanced tidy tree ----------------------------------------
// Root centered, branches split into a left and a right half, depth growing
// outward horizontally, siblings stacked vertically. Disjoint bands per
// subtree, so connectors never cross and labels never overlap.
function layoutHorizontal(
  items: LayoutNode[],
  options: MindmapLayoutOptions,
): MindmapLaidEdge[] {
  const n = items.length;
  const rowGap = options.siblingSpacing;
  const branchGap = options.siblingSpacing * 2;
  const f = handleFraction(options.branchCurve);

  const branchHeight = (i: number): number => {
    const kids = items[i].children;
    if (kids.length === 0) return items[i].h + rowGap;
    return kids.reduce((sum, k) => sum + branchHeight(k), 0);
  };

  const rightRoles: number[] = [];
  const leftRoles: number[] = [];
  let rightWeight = 0;
  let leftWeight = 0;
  for (const role of items[0].children) {
    const h = branchHeight(role);
    if (rightWeight <= leftWeight) {
      rightRoles.push(role);
      rightWeight += h;
    } else {
      leftRoles.push(role);
      leftWeight += h;
    }
  }
  const assignSide = (i: number, side: number) => {
    items[i].side = side;
    for (const c of items[i].children) assignSide(c, side);
  };
  for (const role of rightRoles) assignSide(role, 1);
  for (const role of leftRoles) assignSide(role, -1);

  let maxDepth = 0;
  for (const it of items) maxDepth = Math.max(maxDepth, it.depth);
  const maxHalf = new Array<number>(maxDepth + 1).fill(0);
  for (const it of items) maxHalf[it.depth] = Math.max(maxHalf[it.depth], it.w / 2);
  const colCenter = new Array<number>(maxDepth + 1).fill(0);
  for (let d = 1; d <= maxDepth; d++) {
    const gap = options.levelDistance * (d === 1 ? 0.55 : 0.34);
    colCenter[d] = colCenter[d - 1] + maxHalf[d - 1] + gap + maxHalf[d];
  }
  for (const it of items) it.x = it.side * colCenter[it.depth];

  const layoutSide = (rootsOnSide: number[]) => {
    if (rootsOnSide.length === 0) return;
    let cursor = 0;
    const assignY = (i: number) => {
      const kids = items[i].children;
      if (kids.length === 0) {
        items[i].y = cursor + items[i].h / 2;
        cursor += items[i].h + rowGap;
        return;
      }
      for (const c of kids) assignY(c);
      items[i].y = (items[kids[0]].y + items[kids[kids.length - 1]].y) / 2;
    };
    let top = Infinity;
    let bottom = -Infinity;
    for (let bi = 0; bi < rootsOnSide.length; bi++) {
      if (bi > 0) cursor += branchGap;
      top = Math.min(top, cursor);
      assignY(rootsOnSide[bi]);
      bottom = Math.max(bottom, cursor - rowGap);
    }
    const mid = (top + bottom) / 2;
    const shift = (i: number) => {
      items[i].y -= mid;
      for (const c of items[i].children) shift(c);
    };
    for (const role of rootsOnSide) shift(role);
  };
  layoutSide(rightRoles);
  layoutSide(leftRoles);
  items[0].x = 0;
  items[0].y = 0;

  const edges: MindmapLaidEdge[] = [];
  for (let i = 1; i < n; i++) {
    const to = items[i];
    const from = items[to.parentIndex];
    const side = to.side || 1;
    const sx = from.x + side * (from.w / 2);
    const ex = to.x - side * (to.w / 2);
    const dx = ex - sx;
    edges.push({
      id: `${from.node.id}->${to.node.id}`,
      fromId: from.node.id,
      toId: to.node.id,
      color: to.node.branchColor ?? to.node.color,
      x1: sx,
      y1: from.y,
      c1x: sx + dx * f,
      c1y: from.y,
      c2x: ex - dx * f,
      c2y: to.y,
      x2: ex,
      y2: to.y,
    });
  }
  return edges;
}

// --- Radial star with leaf bubbles ----------------------------------------
// Roles radiate around the center in every direction; each role's subtree is a
// tidy tree pointing outward along the role's angle. Siblings are spaced by
// their REAL footprint at the branch angle (a wide label on a near-vertical
// branch reserves its width, not its height), so nothing collides. A node
// whose children are all terminal (a goal with leaves, a category with only
// items) is a hub: its children wrap it in an arc — leafWrap sets the arc (a
// narrow forward cone up to a near-full circle whose gap faces the parent
// connector) and leafSpread scales the BUBBLE SIZE: 0 packs the leaves as
// tight concentric shells hugging the hub, 1 grows the radius until every
// leaf sits on ONE ring. The hub is pushed away from its parent as far as its
// bubble needs (hubGap), so the ring stays whole at any size instead of
// getting clipped or swallowing the tree behind it. Siblings are NOT stacked
// on a straight line: each arm distributes its members over the role's
// angular sector (arc position proportional to the tidy offset), so a role
// with a dozen bubbles reads as a starburst, not a chain. A final separation
// pass (skipping intra-bubble pairs, which are collision-checked at build
// time) makes zero-overlap a guarantee, not a hope.
const LEAF_WRAP_MIN = Math.PI * 0.35; // leafWrap 0 — narrow forward cone
const LEAF_WRAP_MAX = Math.PI * 1.9; // leafWrap 1 — full circle minus the gap
const LEAF_RING_GAP = 18; // gap between neighbours on a shell
const LEAF_SHELL_GAP = 18; // radial gap between consecutive shells
const LEAF_COLLISION_MARGIN = 12; // hard floor between anything in a bubble
const LEAF_NUDGE_STEP = 0.03;
const MAX_LEAF_SHELLS = 128;
const DEOVERLAP_MARGIN = 8;
const DEOVERLAP_ITERATIONS = 150;

// Half the center-to-center distance two same-size neighbours need so their
// axis-aligned pills can't overlap when offset along the branch's tangential
// direction (perpendicular to theta). Near-horizontal branches bind on height;
// near-vertical branches bind on width.
function tangentialHalf(w: number, h: number, theta: number): number {
  const s = Math.max(Math.abs(Math.sin(theta)), 0.09);
  const c = Math.max(Math.abs(Math.cos(theta)), 0.09);
  return Math.min(w / 2 / s, h / 2 / c);
}

function layoutRadial(
  items: LayoutNode[],
  options: MindmapLayoutOptions,
): MindmapLaidEdge[] {
  const n = items.length;
  const level = options.levelDistance;
  const sib = options.siblingSpacing;
  const bubbleT = clamp01(options.leafSpread);
  const wrap =
    LEAF_WRAP_MIN + clamp01(options.leafWrap) * (LEAF_WRAP_MAX - LEAF_WRAP_MIN);

  const v = new Array<number>(n).fill(0);
  const isHub = new Array<boolean>(n).fill(false);
  const isBubbleLeaf = new Array<boolean>(n).fill(false);
  const leafDX = new Array<number>(n).fill(0);
  const leafDY = new Array<number>(n).fill(0);
  const hubGap = new Array<number>(n).fill(0);

  // Wraps a hub's children around it in a near-full circle. leafSpread scales
  // the bubble: at 1 the start radius is grown until EVERY leaf fits one ring
  // (dealt evenly — a true circle); below 1 the radius shrinks toward the
  // tightest hub clearance and the overflow packs onto further concentric
  // shells. Offsets land in leafDX/leafDY relative to the hub; hubGap[hubIdx]
  // records how far the hub must sit from its parent so the ring's back edge
  // clears it; returns the disc's tangential half-breadth for tidyArm.
  const placeLeafDisc = (hubIdx: number, theta: number): number => {
    const hub = items[hubIdx];
    const kids = hub.children;
    const parent = items[hub.parentIndex];
    let leafH = 0;
    let leafW = 0;
    for (const k of kids) {
      leafH = Math.max(leafH, items[k].h);
      leafW = Math.max(leafW, items[k].w);
    }

    // Tightest radius where a leaf clears the hub at EVERY wrap angle — the
    // bubble's inner moat.
    const halfW = (hub.w + leafW) / 2 + LEAF_COLLISION_MARGIN;
    const halfH = (hub.h + leafH) / 2 + LEAF_COLLISION_MARGIN;
    let rClear = 0;
    const samples = 64;
    for (let s = 0; s <= samples; s++) {
      const a = theta - wrap / 2 + (wrap * s) / samples;
      const c = Math.max(Math.abs(Math.cos(a)), 0.02);
      const sn = Math.max(Math.abs(Math.sin(a)), 0.02);
      rClear = Math.max(rClear, Math.min(halfW / c, halfH / sn));
    }

    // Even single-ring positions at the given radius: tight angle-aware walk
    // (side positions stack by pill height, top/bottom need their width), then
    // the leftover arc dealt evenly between the slots, iterated until the
    // spacing needs — which depend on each pill's final angle — stabilize.
    // Null when the family cannot fit one ring at this radius.
    const evenRingPositions = (radius: number): number[] | null => {
      const m = kids.length;
      const pos = new Array<number>(m);
      for (let i = 0; i < m; i++) {
        pos[i] = -wrap / 2 + (wrap * (i + 0.5)) / m;
      }
      for (let iter = 0; iter < 6; iter++) {
        let cursor = -wrap / 2;
        const tight = new Array<number>(m);
        for (let i = 0; i < m; i++) {
          const half = Math.asin(
            Math.min(
              1,
              (tangentialHalf(
                items[kids[i]].w,
                items[kids[i]].h,
                theta + pos[i],
              ) +
                LEAF_RING_GAP / 2) /
                radius,
            ),
          );
          tight[i] = cursor + half;
          cursor = tight[i] + half;
        }
        const slack = wrap - (cursor + wrap / 2);
        if (slack < 0) return null;
        for (let i = 0; i < m; i++) {
          pos[i] = tight[i] + (slack * (i + 0.5)) / m;
        }
      }
      // The chord model is approximate at diagonal angles and ignores the
      // wrap-around pair across the back gap — verify every neighbouring pair
      // with real rectangles, and let the caller grow the radius on failure.
      const rects = pos.map((p, i) => ({
        x: radius * Math.cos(theta + p),
        y: radius * Math.sin(theta + p),
        w: items[kids[i]].w,
        h: items[kids[i]].h,
      }));
      const pairClear = (
        a: (typeof rects)[number],
        b: (typeof rects)[number],
      ): boolean =>
        Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + LEAF_COLLISION_MARGIN ||
        Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + LEAF_COLLISION_MARGIN;
      for (let i = 1; i < m; i++) {
        if (!pairClear(rects[i - 1], rects[i])) return null;
      }
      if (m > 1 && !pairClear(rects[m - 1], rects[0])) return null;
      return pos;
    };

    // The full-circle radius: grown until every leaf fits one ring.
    let ringR = rClear;
    for (let guard = 0; guard < 48 && !evenRingPositions(ringR); guard++) {
      ringR *= 1.12;
    }

    let r = rClear + (ringR - rClear) * bubbleT;
    let rOuter = r;

    const obstacles = [{ x: 0, y: 0, w: hub.w, h: hub.h }];
    const clears = (x: number, y: number, w: number, h: number): boolean => {
      for (const ob of obstacles) {
        if (
          Math.abs(x - ob.x) < (w + ob.w) / 2 + LEAF_COLLISION_MARGIN &&
          Math.abs(y - ob.y) < (h + ob.h) / 2 + LEAF_COLLISION_MARGIN
        ) {
          return false;
        }
      }
      return true;
    };

    let qi = 0;
    for (let shell = 0; shell < MAX_LEAF_SHELLS && qi < kids.length; shell++) {
      const arcWindow = wrap;

      // The whole family fits this first shell: one clean evenly-dealt ring.
      // Anything that needs more shells packs tight instead — stragglers
      // belong at the front of the disc, not dealt around an empty ring.
      const ringSlots = shell === 0 ? evenRingPositions(r) : null;
      if (ringSlots) {
        for (
          let slot = 0;
          slot < ringSlots.length && qi < kids.length;
          slot++
        ) {
          const k = kids[qi];
          const rel = ringSlots[slot];
          const dir = rel > 0 ? -1 : 1;
          let a = rel;
          for (
            let budget = arcWindow / 2;
            budget >= 0;
            budget -= LEAF_NUDGE_STEP
          ) {
            const x = r * Math.cos(theta + a);
            const y = r * Math.sin(theta + a);
            if (clears(x, y, items[k].w, items[k].h)) {
              leafDX[k] = x;
              leafDY[k] = y;
              obstacles.push({ x, y, w: items[k].w, h: items[k].h });
              rOuter = r;
              qi++;
              break;
            }
            a += dir * LEAF_NUDGE_STEP;
          }
        }
      } else {
        // Crowded shell: pack tight from the arm direction outward with two
        // alternating cursors, marching past anything already placed — dense
        // side columns and front rows form on their own, so the disc fills as
        // an organized round blob instead of slots landing in blocked zones.
        let plusA = 0;
        let minusA = 0;
        let plusOpen = true;
        let minusOpen = true;
        while (qi < kids.length && (plusOpen || minusOpen)) {
          const k = kids[qi];
          const usePlus = plusOpen && (!minusOpen || plusA <= -minusA);
          const dir = usePlus ? 1 : -1;
          let a = usePlus ? plusA : minusA;
          let placed = false;
          while (Math.abs(a) <= arcWindow / 2) {
            const half = Math.asin(
              Math.min(
                1,
                (tangentialHalf(items[k].w, items[k].h, theta + a) +
                  LEAF_RING_GAP / 2) /
                  r,
              ),
            );
            const center = a + dir * half;
            if (Math.abs(center) + half > arcWindow / 2) break;
            const x = r * Math.cos(theta + center);
            const y = r * Math.sin(theta + center);
            if (clears(x, y, items[k].w, items[k].h)) {
              leafDX[k] = x;
              leafDY[k] = y;
              obstacles.push({ x, y, w: items[k].w, h: items[k].h });
              rOuter = r;
              if (usePlus) plusA = center + half;
              else minusA = center - half;
              placed = true;
              qi++;
              break;
            }
            a += dir * LEAF_NUDGE_STEP;
          }
          if (!placed) {
            if (usePlus) plusOpen = false;
            else minusOpen = false;
          }
        }
      }
      r += leafH + LEAF_SHELL_GAP;
    }
    // Shell-guard overflow: dump the tail down the arm (never expected).
    for (; qi < kids.length; qi++) {
      leafDX[kids[qi]] = r * Math.cos(theta);
      leafDY[kids[qi]] = r * Math.sin(theta);
      rOuter = r;
      r += leafH + LEAF_SHELL_GAP;
    }

    // How far the hub must sit from its parent so the ring's back edge (the
    // outermost leaf plus both pills' radial extents) clears the parent.
    const radialHalf = (w: number, h: number, ang: number): number =>
      (w / 2) * Math.abs(Math.cos(ang)) + (h / 2) * Math.abs(Math.sin(ang));
    hubGap[hubIdx] =
      rOuter +
      radialHalf(leafW, leafH, theta) +
      radialHalf(parent.w, parent.h, theta) +
      LEAF_COLLISION_MARGIN;

    const px = -Math.sin(theta);
    const py = Math.cos(theta);
    const extent = (dx: number, dy: number, w: number, h: number): number =>
      Math.abs(dx * px + dy * py) +
      (w / 2) * Math.abs(px) +
      (h / 2) * Math.abs(py);
    let reach = extent(0, 0, hub.w, hub.h);
    for (const k of kids) {
      reach = Math.max(
        reach,
        extent(leafDX[k], leafDY[k], items[k].w, items[k].h),
      );
    }
    return reach;
  };

  const roles = items[0].children;

  // Tidy one arm along direction theta, spacing every node by its footprint at
  // that angle; a hub reserves its whole disc instead of stacking leaves.
  const tidyArm = (rootIdx: number, theta: number): number => {
    let cursor = 0;
    const rec = (i: number) => {
      const kids = items[i].children;
      if (kids.length === 0) {
        const half = tangentialHalf(items[i].w, items[i].h, theta) + sib / 2;
        v[i] = cursor + half;
        cursor += 2 * half;
        return;
      }
      if (kids.every((k) => items[k].children.length === 0)) {
        const reach = placeLeafDisc(i, theta);
        isHub[i] = true;
        for (const k of kids) isBubbleLeaf[k] = true;
        v[i] = cursor + reach;
        cursor += 2 * reach + sib;
        return;
      }
      for (const c of kids) rec(c);
      v[i] = (v[kids[0]] + v[kids[kids.length - 1]]) / 2;
    };
    rec(rootIdx);
    return Math.max(cursor, items[rootIdx].h);
  };

  // Sectors: provisional from leaf counts, then a real tidy gives the breadth
  // that sets the final angle per arm (breadth depends on angle, so one refine).
  const leafCount = new Array<number>(n).fill(1);
  for (let i = n - 1; i >= 0; i--) {
    if (items[i].children.length > 0) {
      leafCount[i] = items[i].children.reduce((s, c) => s + leafCount[c], 0);
    }
  }
  const gapAngle = 0.12;
  const sectorAngles = (weights: number[]): number[] => {
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    let usable = TAU - gapAngle * roles.length;
    if (usable < TAU * 0.35) usable = TAU * 0.35;
    const out: number[] = [];
    let a = -Math.PI / 2;
    for (const w of weights) {
      const sweep = usable * (w / total);
      out.push(a + sweep / 2);
      a += sweep + gapAngle;
    }
    return out;
  };

  let thetas = sectorAngles(roles.map((r) => leafCount[r]));
  const roughBreadths = roles.map((r, idx) => tidyArm(r, thetas[idx]));
  thetas = sectorAngles(roughBreadths);

  const clearance = Math.max(0, options.armClearance);
  const spread = Math.min(1, Math.max(BRANCH_SPREAD_MIN, options.branchSpread));
  // Narrowing each fan by `spread` while growing the radius by its reciprocal
  // keeps every tier's arc length (hence its spacing) identical, so tighter
  // spokes never collide — they just sit further out with wider gaps between.
  const radialScale = 1 / spread;
  const levelStep = level * radialScale;
  const totalBreadth = roughBreadths.reduce((s, b) => s + b, 0);
  let usable = TAU - gapAngle * roles.length;
  if (usable < TAU * 0.35) usable = TAU * 0.35;
  const R1 =
    Math.max(level, totalBreadth / (usable || 1)) * clearance * radialScale;
  const totalRough = roughBreadths.reduce((s, b) => s + b, 0) || 1;

  for (let idx = 0; idx < roles.length; idx++) {
    const rootIdx = roles[idx];
    const theta = thetas[idx];
    const breadth = tidyArm(rootIdx, theta);
    const vmid = breadth / 2;
    // The arm's members spread over its angular sector instead of stacking on
    // a straight tangential line: tidy offset maps to arc position. R1 is at
    // least totalBreadth/usable, so at every radius the arc length allotted to
    // a footprint is at least the footprint itself — no compression. `spread`
    // then narrows the fan within its slice (the radius grew to match).
    const sweep = ((usable * roughBreadths[idx]) / totalRough) * spread;
    const angleOf = (vv: number): number =>
      theta + (vv * sweep) / Math.max(breadth, 1);

    const members: number[] = [];
    const walk = (i: number) => {
      members.push(i);
      for (const c of items[i].children) walk(c);
    };
    walk(rootIdx);

    // Radial distance accumulates parent to child (members walk parents
    // first): a hub with a big bubble is pushed out far enough (hubGap) that
    // its ring encircles only itself. Each hub's disc is re-laid at the hub's
    // own final angle so its footprints and connector gap face the right way.
    const uOf = new Map<number, number>();
    for (const i of members) {
      if (isBubbleLeaf[i]) continue;
      const ang = angleOf(v[i] - vmid);
      if (isHub[i]) placeLeafDisc(i, ang);
      const base =
        items[i].depth === 1 ? 0 : (uOf.get(items[i].parentIndex) ?? 0);
      const step = Math.max(
        items[i].depth === 1 ? R1 : levelStep,
        isHub[i] ? hubGap[i] : 0,
      );
      const u = base + step;
      uOf.set(i, u);
      items[i].x = u * Math.cos(ang);
      items[i].y = u * Math.sin(ang);
    }
    for (const i of members) {
      if (!isHub[i]) continue;
      const hub = items[i];
      for (const k of hub.children) {
        items[k].x = hub.x + leafDX[k];
        items[k].y = hub.y + leafDY[k];
      }
    }
  }
  items[0].x = 0;
  items[0].y = 0;

  const bubbleGroup = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!isHub[i]) continue;
    bubbleGroup[i] = i;
    for (const k of items[i].children) bubbleGroup[k] = i;
  }
  separateOverlaps(items, DEOVERLAP_MARGIN, DEOVERLAP_ITERATIONS, bubbleGroup);

  for (const it of items) it.side = Math.sign(it.x) || 0;
  return radialEdges(items, options);
}

// Push apart any overlapping pills until none remain, root pinned. The radial
// placement is already close, so this is a light cleanup that turns "no
// overlap" into a guarantee rather than a hope. Pairs inside one bubble are
// skipped — the disc construction collision-checked them, and pushing
// individual leaves would shear the shells.
function separateOverlaps(
  items: LayoutNode[],
  margin: number,
  iterations: number,
  group?: number[],
): void {
  const n = items.length;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (group && group[i] >= 0 && group[i] === group[j]) continue;
        const dx = items[j].x - items[i].x;
        const dy = items[j].y - items[i].y;
        const minX = (items[i].w + items[j].w) / 2 + margin;
        const minY = (items[i].h + items[j].h) / 2 + margin;
        const ox = minX - Math.abs(dx);
        const oy = minY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const push = (dx < 0 ? -1 : 1) * ox;
          if (i === 0) items[j].x += push;
          else if (j === 0) items[i].x -= push;
          else {
            items[i].x -= push / 2;
            items[j].x += push / 2;
          }
        } else {
          const push = (dy < 0 ? -1 : 1) * oy;
          if (i === 0) items[j].y += push;
          else if (j === 0) items[i].y -= push;
          else {
            items[i].y -= push / 2;
            items[j].y += push / 2;
          }
        }
      }
    }
    if (!moved) break;
  }
  items[0].x = 0;
  items[0].y = 0;
}

// Edges from final positions (after separation): each branch leaves its parent
// and arrives at its child along the radial direction, for an organic
// outward-growing look independent of how far separation nudged a node.
function radialEdges(
  items: LayoutNode[],
  options: MindmapLayoutOptions,
): MindmapLaidEdge[] {
  const amt = 0.28 + clamp01(options.branchCurve) * 0.24;
  const edges: MindmapLaidEdge[] = [];
  for (let i = 1; i < items.length; i++) {
    const c = items[i];
    const p = items[c.parentIndex];
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const pr = Math.hypot(p.x, p.y);
    const pdx = pr > 1 ? p.x / pr : dx / len;
    const pdy = pr > 1 ? p.y / pr : dy / len;
    const cr = Math.hypot(c.x, c.y) || 1;
    edges.push({
      id: `${p.node.id}->${c.node.id}`,
      fromId: p.node.id,
      toId: c.node.id,
      color: c.node.branchColor ?? c.node.color,
      x1: p.x,
      y1: p.y,
      c1x: p.x + pdx * len * amt,
      c1y: p.y + pdy * len * amt,
      c2x: c.x - (c.x / cr) * len * amt,
      c2y: c.y - (c.y / cr) * len * amt,
      x2: c.x,
      y2: c.y,
    });
  }
  return edges;
}

// Slider 0..100 maps to the scale range logarithmically, so each step feels
// proportionally the same at both ends (mirrors the graph view's zoom).
export const MINDMAP_ZOOM_MIN_SCALE = 0.14;
export const MINDMAP_ZOOM_MAX_SCALE = 2.4;

export const mindmapZoomToScale = (t: number): number =>
  MINDMAP_ZOOM_MIN_SCALE *
  Math.pow(MINDMAP_ZOOM_MAX_SCALE / MINDMAP_ZOOM_MIN_SCALE, t / 100);

export const mindmapScaleToZoom = (scale: number): number => {
  const clamped = Math.max(
    MINDMAP_ZOOM_MIN_SCALE,
    Math.min(MINDMAP_ZOOM_MAX_SCALE, scale),
  );
  return Math.max(
    0,
    Math.min(
      100,
      (100 * Math.log(clamped / MINDMAP_ZOOM_MIN_SCALE)) /
        Math.log(MINDMAP_ZOOM_MAX_SCALE / MINDMAP_ZOOM_MIN_SCALE),
    ),
  );
};
