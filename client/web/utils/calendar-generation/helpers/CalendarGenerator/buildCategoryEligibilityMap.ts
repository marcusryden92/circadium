import { Category } from "@/types/prisma";

/**
 * For each category, the set of category ids whose windows its items may occupy:
 * the category itself, then each ancestor up the parentId chain, stopping at
 * (and including) the first category flagged `confineToOwnWindows` — that
 * category is the ceiling — or the root.
 *
 * A category flagged `confineToOwnWindows` therefore yields just itself: its
 * items stay in its own windows. Because the flag also breaks the climb of any
 * descendant, it caps a whole subtree at that category.
 *
 * Non-window-bearing ancestors are still included; the match sites intersect
 * against the window-bearing set, so a classification-only ancestor contributes
 * no slots and is harmless in the set.
 */
export function buildCategoryEligibilityMap(
  categories: Category[],
): Map<string, Set<string>> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const result = new Map<string, Set<string>>();

  for (const category of categories) {
    const eligible = new Set<string>();
    let cur: Category | undefined = category;
    // `seen` guards against a malformed cyclic parent chain.
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      eligible.add(cur.id);
      if (cur.confineToOwnWindows) break;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    result.set(category.id, eligible);
  }

  return result;
}
