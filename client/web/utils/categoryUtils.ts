import type { Category } from "@/types/prisma";

// Sibling order is alphabetical: categories carry no user-authored ordering
// (the rail's drag is folder-like — nest/unnest only, no reordering), so name
// is the one predictable sort. numeric keeps "Week 2" ahead of "Week 10";
// createdAt breaks name ties deterministically.
export function compareCategoryNames(a: Category, b: Category): number {
  const byName = a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (byName !== 0) return byName;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export type IndentedCategory = Category & {
  depth: number;
  isLastSibling: boolean;
  prefix: string; // visual connectors like "│   ├─ "
  label: string; // prefix + name, empty prefix for depth 0
};

/**
 * Build a hierarchically ordered, indented category list from a flat array.
 * Ensures parents appear before children and provides a depth value for indentation.
 */
export function buildIndentedCategoryList(
  categories: Category[]
): IndentedCategory[] {
  const result: IndentedCategory[] = [];

  // Group by parentId (null for roots)
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }

  for (const group of byParent.values()) {
    group.sort(compareCategoryNames);
  }

  const visit = (cat: Category, depth: number) => {
    // Determine sibling info for this node within its parent group
    const siblings = byParent.get(cat.parentId ?? null) || [];
    const index = siblings.findIndex((s) => s.id === cat.id);
    const isLastSibling = index === siblings.length - 1;

    // Build prefix and label
    const pipes = Array(Math.max(0, depth - 1))
      .fill("│   ")
      .join("");
    const connector = depth === 0 ? "" : isLastSibling ? "└─ " : "├─ ";
    const prefix = depth === 0 ? "" : `${pipes}${connector}`;

    result.push({
      ...cat,
      depth,
      isLastSibling,
      prefix,
      label: `${prefix}${cat.name}`,
    });

    const children = byParent.get(cat.id) || [];
    for (const child of children) visit(child, depth + 1);
  };

  // Roots: parentId null; if any orphan with missing parent, treat as root
  const roots = (byParent.get(null) || []).slice();

  // Include orphans (categories whose parentId not present in list)
  const knownIds = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    if (c.parentId && !knownIds.has(c.parentId)) {
      if (!roots.find((r) => r.id === c.id)) roots.push(c);
    }
  }

  for (const root of roots) visit(root, 0);

  return result;
}

// Build a deep category tree from a flat list
export type CategoryNode = Category & { children: CategoryNode[] };

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }

  for (const group of byParent.values()) {
    group.sort(compareCategoryNames);
  }

  const buildNode = (cat: Category): CategoryNode => {
    const children = (byParent.get(cat.id) || []).map(buildNode);
    return { ...cat, children };
  };

  const roots = (byParent.get(null) || []).map(buildNode);
  return roots;
}

/**
 * Get all descendant category IDs for a given category (including the category itself)
 */
export function getCategoryAndDescendants(
  categoryId: string,
  categories: Category[]
): string[] {
  const result: string[] = [categoryId];
  const byParent = new Map<string | null, Category[]>();

  for (const c of categories) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }

  const visit = (id: string) => {
    const children = byParent.get(id) || [];
    for (const child of children) {
      result.push(child.id);
      visit(child.id);
    }
  };

  visit(categoryId);
  return result;
}
