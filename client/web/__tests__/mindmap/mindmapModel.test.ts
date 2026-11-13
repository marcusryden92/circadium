import type { Category, Planner } from "@/types/prisma";
import {
  buildMindmapTree,
  layoutMindmap,
  mindmapZoomToScale,
  mindmapScaleToZoom,
  MINDMAP_UNCATEGORIZED_ID,
  MINDMAP_LAYOUT_DEFAULTS,
  type MindmapTreeNode,
  type MindmapLayoutOptions,
} from "@/app/(protected)/mindmap/_lib/mindmapModel";

const layoutH = (tree: MindmapTreeNode, over: Partial<MindmapLayoutOptions> = {}) =>
  layoutMindmap(tree, { ...MINDMAP_LAYOUT_DEFAULTS, layout: "horizontal", ...over });
const layoutR = (tree: MindmapTreeNode, over: Partial<MindmapLayoutOptions> = {}) =>
  layoutMindmap(tree, { ...MINDMAP_LAYOUT_DEFAULTS, layout: "radial", ...over });

const makePlanner = (overrides: Partial<Planner> & { id: string }): Planner =>
  ({
    title: overrides.id,
    parentId: null,
    plannerType: "task",
    isReady: true,
    isTriaged: true,
    duration: 60,
    deadline: null,
    starts: null,
    sortOrder: 0,
    completedStartTime: null,
    completedEndTime: null,
    priority: 4,
    userId: "user-1",
    color: null,
    locationId: null,
    useParentLocation: false,
    categoryId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as Planner;

const makeCategory = (
  id: string,
  parentId: string | null = null,
  overrides: Partial<Category> = {},
): Category =>
  ({
    id,
    name: id,
    parentId,
    sortOrder: 0,
    color: null,
    ...overrides,
  }) as Category;

const buildTree = (
  planner: Planner[],
  categories: Category[],
  opts: {
    showCompleted?: boolean;
    hideEmpty?: boolean;
    showLeaves?: boolean;
  } = {},
): MindmapTreeNode =>
  buildMindmapTree({
    planner,
    categories,
    userName: "Me",
    theme: "light",
    showCompleted: opts.showCompleted ?? false,
    hideEmpty: opts.hideEmpty ?? false,
    showLeaves: opts.showLeaves ?? false,
  });

const flatten = (node: MindmapTreeNode): MindmapTreeNode[] => [
  node,
  ...node.children.flatMap(flatten),
];

const findNode = (root: MindmapTreeNode, id: string) =>
  flatten(root).find((n) => n.id === id);

// Extent of a set of angles around a hub: full circle minus the widest empty
// gap between neighbouring (sorted) angles.
const angularExtent = (angles: number[]): number => {
  const sorted = [...angles].sort((a, b) => a - b);
  let maxGap = sorted[0] + Math.PI * 2 - sorted[sorted.length - 1];
  for (let i = 1; i < sorted.length; i++) {
    maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
  }
  return Math.PI * 2 - maxGap;
};

describe("buildMindmapTree", () => {
  it("nests roles, subcategories, and items with correct kinds and counts", () => {
    const categories = [
      makeCategory("Work", null, { color: "#112233" }),
      makeCategory("ProjectA", "Work"),
    ];
    const planner = [
      makePlanner({ id: "t-work", categoryId: "Work" }),
      makePlanner({ id: "t-project", categoryId: "ProjectA" }),
    ];

    const root = buildTree(planner, categories);
    const work = findNode(root, "Work")!;
    const projectA = findNode(root, "ProjectA")!;

    expect(root.kind).toBe("root");
    expect(work.kind).toBe("role");
    expect(projectA.kind).toBe("category");
    // Work's direct children: the subcategory then its own item.
    expect(work.children.map((c) => c.id)).toEqual(["ProjectA", "t-work"]);
    expect(projectA.children.map((c) => c.id)).toEqual(["t-project"]);
    // Subtree count aggregates the descendant item.
    expect(work.itemCount).toBe(2);
    expect(projectA.itemCount).toBe(1);
  });

  it("inherits the role color down the branch to uncolored items", () => {
    const categories = [makeCategory("Work", null, { color: "#112233" })];
    const planner = [
      makePlanner({ id: "t-inherit", categoryId: "Work" }),
      makePlanner({ id: "t-own", categoryId: "Work", color: "#ff0000" }),
    ];

    const root = buildTree(planner, categories);
    expect(findNode(root, "Work")!.color).toBe("#112233");
    expect(findNode(root, "t-inherit")!.color).toBe("#112233");
    expect(findNode(root, "t-own")!.color).toBe("#ff0000");
  });

  it("routes null, unknown, and orphan-category items into Uncategorized", () => {
    // Orphan = a category whose parent is missing, so it is unreachable from
    // any root and never becomes a node. Its items must not vanish.
    const categories = [
      makeCategory("Work"),
      makeCategory("Orphan", "deleted-parent"),
    ];
    const planner = [
      makePlanner({ id: "t-null", categoryId: null }),
      makePlanner({ id: "t-unknown", categoryId: "ghost" }),
      makePlanner({ id: "t-orphan", categoryId: "Orphan" }),
      makePlanner({ id: "t-work", categoryId: "Work" }),
    ];

    const root = buildTree(planner, categories);
    const uncategorized = findNode(root, MINDMAP_UNCATEGORIZED_ID);

    expect(uncategorized).toBeDefined();
    expect(uncategorized!.children.map((c) => c.id).sort()).toEqual([
      "t-null",
      "t-orphan",
      "t-unknown",
    ]);
    // The reachable Work item is not swept into Uncategorized.
    expect(findNode(root, "Work")!.children.map((c) => c.id)).toEqual([
      "t-work",
    ]);
    // No orphan item is silently dropped from the whole map.
    const itemIds = flatten(root)
      .filter((n) => n.kind === "item")
      .map((n) => n.id)
      .sort();
    expect(itemIds).toEqual(["t-null", "t-orphan", "t-unknown", "t-work"]);
  });

  it("hides completed items unless showCompleted is set", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "t-open", categoryId: "Work" }),
      makePlanner({
        id: "t-done",
        categoryId: "Work",
        completedStartTime: "2026-07-01T09:00:00.000Z",
        completedEndTime: "2026-07-01T10:00:00.000Z",
      }),
    ];

    expect(findNode(buildTree(planner, categories), "t-done")).toBeUndefined();
    expect(
      findNode(buildTree(planner, categories, { showCompleted: true }), "t-done"),
    ).toBeDefined();
  });

  it("only includes triaged root tasks and goals", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "t-ok", categoryId: "Work" }),
      makePlanner({ id: "t-untriaged", categoryId: "Work", isTriaged: false }),
      makePlanner({ id: "t-child", categoryId: "Work", parentId: "t-ok" }),
      makePlanner({ id: "t-plan", categoryId: "Work", plannerType: "plan" }),
    ];

    const itemIds = flatten(buildTree(planner, categories))
      .filter((n) => n.kind === "item")
      .map((n) => n.id);
    expect(itemIds).toEqual(["t-ok"]);
  });

  it("expands a goal into its bottom-layer leaf tasks only when showLeaves", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "goal", plannerType: "goal", categoryId: "Work" }),
      makePlanner({ id: "sub", parentId: "goal", plannerType: "goal" }),
      makePlanner({ id: "leaf1", parentId: "sub", sortOrder: 0 }),
      makePlanner({ id: "leaf2", parentId: "goal", sortOrder: 1 }),
      makePlanner({ id: "task", plannerType: "task", categoryId: "Work" }),
    ];

    const collapsed = findNode(buildTree(planner, categories), "goal")!;
    expect(collapsed.children).toHaveLength(0);

    const expanded = buildTree(planner, categories, { showLeaves: true });
    const goal = findNode(expanded, "goal")!;
    // Bottom layer only — the intermediate "sub" goal is not a leaf.
    expect(goal.children.map((c) => c.id).sort()).toEqual(["leaf1", "leaf2"]);
    expect(goal.children.every((c) => c.kind === "leaf")).toBe(true);
    expect(findNode(expanded, "leaf1")!.href).toBe("/items/leaf1");
    // A non-goal task never expands.
    expect(findNode(expanded, "task")!.children).toHaveLength(0);
  });

  it("does not expand a childless goal into itself, and honors showCompleted on leaves", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "lonely", plannerType: "goal", categoryId: "Work" }),
      makePlanner({ id: "goal", plannerType: "goal", categoryId: "Work" }),
      makePlanner({ id: "open", parentId: "goal" }),
      makePlanner({
        id: "done",
        parentId: "goal",
        completedStartTime: "2026-07-01T09:00:00.000Z",
        completedEndTime: "2026-07-01T10:00:00.000Z",
      }),
    ];

    const expanded = buildTree(planner, categories, { showLeaves: true });
    expect(findNode(expanded, "lonely")!.children).toHaveLength(0);
    expect(findNode(expanded, "goal")!.children.map((c) => c.id)).toEqual([
      "open",
    ]);

    const withDone = buildTree(planner, categories, {
      showLeaves: true,
      showCompleted: true,
    });
    expect(
      findNode(withDone, "goal")!.children.map((c) => c.id).sort(),
    ).toEqual(["done", "open"]);
  });

  it("prunes empty roles when hideEmpty, keeping populated branches", () => {
    const categories = [makeCategory("Empty"), makeCategory("Work")];
    const planner = [
      makePlanner({ id: "t-work", categoryId: "Work" }),
      makePlanner({ id: "t-loose", categoryId: null }),
    ];

    const shown = buildTree(planner, categories, { hideEmpty: true });
    const shownRootIds = shown.children.map((c) => c.id);
    expect(shownRootIds).toHaveLength(2);
    expect(shownRootIds).toContain("Work");
    expect(shownRootIds).toContain(MINDMAP_UNCATEGORIZED_ID);
    expect(findNode(shown, "Empty")).toBeUndefined();

    // Without hiding, the empty role is still present as a childless node.
    const all = buildTree(planner, categories, { hideEmpty: false });
    expect(findNode(all, "Empty")).toBeDefined();
  });
});

describe("layoutMindmap", () => {
  const smallTree = () => {
    const categories = [makeCategory("Work"), makeCategory("Life")];
    const planner = [
      makePlanner({ id: "a", categoryId: "Work" }),
      makePlanner({ id: "b", categoryId: "Work" }),
      makePlanner({ id: "c", categoryId: "Life" }),
    ];
    return buildTree(planner, categories);
  };

  it("pins the root at the origin center in both layouts", () => {
    for (const layout of [layoutH(smallTree()), layoutR(smallTree())]) {
      const root = layout.nodeById.get("mindmap:root")!;
      expect(layout.centerX).toBe(0);
      expect(layout.centerY).toBe(0);
      expect(root.x).toBe(0);
      expect(root.y).toBe(0);
      for (const node of layout.nodes) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
        expect(Math.abs(node.x)).toBeLessThanOrEqual(layout.width / 2);
        expect(Math.abs(node.y)).toBeLessThanOrEqual(layout.height / 2);
      }
    }
  });

  it("keeps the root locked at center when the tree changes", () => {
    // The Me node must not drift when leaf view toggles — the center is a
    // constant so the viewport stays put.
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "goal", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 4 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "goal", sortOrder: i }),
      ),
    ];
    for (const make of [layoutH, layoutR]) {
      const collapsed = make(buildTree(planner, categories));
      const expanded = make(buildTree(planner, categories, { showLeaves: true }));
      expect(collapsed.centerX).toBe(expanded.centerX);
      expect(collapsed.centerY).toBe(expanded.centerY);
      for (const layout of [collapsed, expanded]) {
        const root = layout.nodeById.get("mindmap:root")!;
        expect(root.x).toBe(layout.centerX);
        expect(root.y).toBe(layout.centerY);
      }
    }
  });

  it("is deterministic — the same tree lays out identically twice", () => {
    const categories = [makeCategory("Work"), makeCategory("Life")];
    const planner = [
      ...Array.from({ length: 6 }, (_, i) =>
        makePlanner({ id: `w${i}`, categoryId: "Work" }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makePlanner({ id: `f${i}`, categoryId: "Life" }),
      ),
    ];
    for (const make of [layoutH, layoutR]) {
      const a = make(buildTree(planner, categories));
      const b = make(buildTree(planner, categories));
      for (const node of a.nodes) {
        const other = b.nodeById.get(node.node.id)!;
        expect(other.x).toBe(node.x);
        expect(other.y).toBe(node.y);
      }
    }
  });

  it("horizontal: separates every node so labels never overlap", () => {
    const categories = [makeCategory("Work"), makeCategory("Life")];
    const planner = [
      ...Array.from({ length: 7 }, (_, i) =>
        makePlanner({ id: `w${i}`, categoryId: "Work" }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makePlanner({ id: `f${i}`, categoryId: "Life" }),
      ),
    ];

    const nodes = layoutH(buildTree(planner, categories)).nodes;
    // The tidy tree gives every subtree a disjoint band and every depth its own
    // column, so no two pill boxes ever sit on top of each other.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        expect(overlapX <= 1 || overlapY <= 1).toBe(true);
      }
    }
  });

  it("horizontal: grows outward by depth and splits the roles into two halves", () => {
    const layout = layoutH(smallTree());
    const parentOf = new Map(layout.edges.map((e) => [e.toId, e.fromId]));

    for (const node of layout.nodes) {
      if (node.node.kind === "root") continue;
      const parent = layout.nodeById.get(parentOf.get(node.node.id)!)!;
      expect(Math.abs(node.x)).toBeGreaterThan(Math.abs(parent.x));
    }

    const work = layout.nodeById.get("Work")!;
    const life = layout.nodeById.get("Life")!;
    expect(Math.sign(work.x)).toBe(-Math.sign(life.x));
  });

  it("horizontal: keeps a long flat fan in one column so connectors never cross", () => {
    const categories = [makeCategory("Work")];
    const planner = Array.from({ length: 24 }, (_, i) =>
      makePlanner({ id: `t${i}`, categoryId: "Work" }),
    );

    const items = layoutH(buildTree(planner, categories)).nodes.filter(
      (n) => n.node.kind === "item",
    );
    expect(items).toHaveLength(24);
    const columns = new Set(items.map((n) => Math.round(n.x)));
    expect(columns.size).toBe(1);
  });

  it("radial: radiates roles in more than one direction, not a single side", () => {
    const categories = [
      makeCategory("Work"),
      makeCategory("Life"),
      makeCategory("Home"),
    ];
    const planner = [
      makePlanner({ id: "a", categoryId: "Work" }),
      makePlanner({ id: "b", categoryId: "Life" }),
      makePlanner({ id: "c", categoryId: "Home" }),
    ];
    const layout = layoutR(buildTree(planner, categories));
    const roles = ["Work", "Life", "Home"].map((id) => layout.nodeById.get(id)!);
    // Roles fan around the center: their angles are distinct, and they do not
    // all sit on one side of the root.
    const angles = roles.map((r) => Math.atan2(r.y, r.x));
    expect(new Set(angles.map((a) => Math.round(a * 100))).size).toBe(3);
    expect(new Set(roles.map((r) => Math.sign(r.x))).size).toBeGreaterThan(1);
  });

  it("radial: never overlaps any pair, at any leaf spread", () => {
    const categories = [
      makeCategory("Work"),
      makeCategory("Life"),
      makeCategory("Home"),
    ];
    const planner = [
      makePlanner({ id: "big", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 9 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "big", sortOrder: i }),
      ),
      makePlanner({ id: "small", plannerType: "goal", categoryId: "Life" }),
      ...Array.from({ length: 3 }, (_, i) =>
        makePlanner({ id: `m${i}`, parentId: "small", sortOrder: i }),
      ),
      makePlanner({ id: "t1", categoryId: "Home" }),
      makePlanner({ id: "t2", categoryId: "Home" }),
    ];
    const tree = buildTree(planner, categories, { showLeaves: true });

    // The hard requirement: no two pills overlap at any bubble size or wrap.
    for (const leafSpread of [0, 0.5, 1]) {
      for (const leafWrap of [0, 0.5, 1]) {
        const nodes = layoutR(tree, { leafSpread, leafWrap }).nodes;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
            const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
            expect(overlapX <= 1 || overlapY <= 1).toBe(true);
          }
        }
      }
    }
  });

  it("radial: leafSpread grows the bubble radius monotonically", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "big", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 12 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "big", sortOrder: i }),
      ),
    ];
    const tree = buildTree(planner, categories, { showLeaves: true });
    const meanRadius = (leafSpread: number): number => {
      const layout = layoutR(tree, { leafSpread });
      const goal = layout.nodeById.get("big")!;
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const l = layout.nodeById.get(`l${i}`)!;
        sum += Math.hypot(l.x - goal.x, l.y - goal.y);
      }
      return sum / 12;
    };
    const tight = meanRadius(0);
    const mid = meanRadius(0.5);
    const ring = meanRadius(1);
    expect(tight).toBeLessThan(mid);
    expect(mid).toBeLessThan(ring);
  });

  it("radial: full spread puts a larger family on one single ring", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "big", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 12 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "big", sortOrder: i }),
      ),
    ];
    const layout = layoutR(
      buildTree(planner, categories, { showLeaves: true }),
      { leafSpread: 1 },
    );
    const goal = layout.nodeById.get("big")!;
    const rs = Array.from({ length: 12 }, (_, i) => {
      const l = layout.nodeById.get(`l${i}`)!;
      return Math.hypot(l.x - goal.x, l.y - goal.y);
    });
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(3);
  });

  it("radial: a small family at full spread rings its goal", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "goal", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 4 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "goal", sortOrder: i }),
      ),
    ];
    const layout = layoutR(
      buildTree(planner, categories, { showLeaves: true }),
      { leafSpread: 1 },
    );
    const goal = layout.nodeById.get("goal")!;
    const polar = Array.from({ length: 4 }, (_, i) => {
      const l = layout.nodeById.get(`l${i}`)!;
      return {
        r: Math.hypot(l.x - goal.x, l.y - goal.y),
        a: Math.atan2(l.y - goal.y, l.x - goal.x),
      };
    });
    // One shell: equidistant, wrapping well past a half-circle.
    const rs = polar.map((p) => p.r);
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(2);
    expect(angularExtent(polar.map((p) => p.a))).toBeGreaterThan(
      Math.PI * 1.2,
    );
  });

  it("radial: a large family encircles its goal — big ring at full spread, compact disc at zero", () => {
    // The regression for the reported bug: a large family must never collapse
    // into a straight wall of pills, and at full spread it must be a literal
    // circle no matter how big that circle has to get.
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "big", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 40 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "big", sortOrder: i }),
      ),
    ];
    const tree = buildTree(planner, categories, { showLeaves: true });

    const relPoints = (leafSpread: number) => {
      const layout = layoutR(tree, { leafSpread });
      const hub = layout.nodeById.get("big")!;
      return Array.from({ length: 40 }, (_, i) => {
        const l = layout.nodeById.get(`l${i}`)!;
        return { x: l.x - hub.x, y: l.y - hub.y };
      });
    };

    // Tight: compact multi-shell disc near the hub.
    const tight = relPoints(0);
    const tightRs = tight.map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...tightRs)).toBeLessThan(450);
    expect(
      new Set(tightRs.map((r) => Math.round(r / 10))).size,
    ).toBeGreaterThanOrEqual(3);

    // Not collinear: real spread perpendicular to the principal axis.
    const cx = tight.reduce((s, p) => s + p.x, 0) / tight.length;
    const cy = tight.reduce((s, p) => s + p.y, 0) / tight.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of tight) {
      sxx += (p.x - cx) ** 2;
      syy += (p.y - cy) ** 2;
      sxy += (p.x - cx) * (p.y - cy);
    }
    const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const maxPerp = Math.max(
      ...tight.map((p) =>
        Math.abs(-(p.x - cx) * Math.sin(phi) + (p.y - cy) * Math.cos(phi)),
      ),
    );
    expect(maxPerp).toBeGreaterThan(60);

    // Full spread: one true circle, larger than the compact disc, wrapping
    // most of the way around the hub.
    const ring = relPoints(1);
    const ringRs = ring.map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...ringRs) - Math.min(...ringRs)).toBeLessThan(3);
    expect(Math.min(...ringRs)).toBeGreaterThan(Math.max(...tightRs));
    expect(
      angularExtent(ring.map((p) => Math.atan2(p.y, p.x))),
    ).toBeGreaterThan(Math.PI * 1.5);
  });

  it("radial: wrap angle narrows the bubble into a cone and opens it into a circle", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "goal", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 12 }, (_, i) =>
        makePlanner({ id: `l${i}`, parentId: "goal", sortOrder: i }),
      ),
    ];
    const tree = buildTree(planner, categories, { showLeaves: true });
    const extentAt = (leafWrap: number): number => {
      const layout = layoutR(tree, { leafSpread: 1, leafWrap });
      const goal = layout.nodeById.get("goal")!;
      return angularExtent(
        Array.from({ length: 12 }, (_, i) => {
          const l = layout.nodeById.get(`l${i}`)!;
          return Math.atan2(l.y - goal.y, l.x - goal.x);
        }),
      );
    };
    const cone = extentAt(0);
    const half = extentAt(0.5);
    const ring = extentAt(1);
    expect(cone).toBeLessThan(Math.PI * 0.9);
    expect(cone).toBeLessThan(half);
    expect(half).toBeLessThan(ring);
    expect(ring).toBeGreaterThan(Math.PI * 1.5);
  });

  it("radial: adjacent bubbles on one arm reserve their space", () => {
    const categories = [makeCategory("Work")];
    const planner = [
      makePlanner({ id: "g1", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 12 }, (_, i) =>
        makePlanner({ id: `a${i}`, parentId: "g1", sortOrder: i }),
      ),
      makePlanner({ id: "g2", plannerType: "goal", categoryId: "Work" }),
      ...Array.from({ length: 12 }, (_, i) =>
        makePlanner({ id: `b${i}`, parentId: "g2", sortOrder: i }),
      ),
    ];
    const nodes = layoutR(
      buildTree(planner, categories, { showLeaves: true }),
    ).nodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        expect(overlapX <= 1 || overlapY <= 1).toBe(true);
      }
    }
  });
});

describe("mindmap zoom mapping", () => {
  it("round-trips scale <-> slider position", () => {
    for (const t of [0, 25, 50, 75, 100]) {
      expect(mindmapScaleToZoom(mindmapZoomToScale(t))).toBeCloseTo(t, 5);
    }
  });
});
