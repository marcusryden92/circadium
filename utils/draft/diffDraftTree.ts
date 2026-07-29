import type { DraftNode } from "./plannerTreeToJson";

export type DiffStatus = "unchanged" | "modified" | "added" | "deleted";

export interface DiffNode extends Omit<DraftNode, "children"> {
  status: DiffStatus;
  children: DiffNode[];
  // Populated only when status === "modified". Names of the fields that
  // differ between canonical and working (title, duration, deadline, etc.).
  changedFields: string[];
}

// Produce a tree that overlays working onto canonical, tagging each node with
// its diff status. Deleted nodes (present in canonical, missing from working)
// are re-inserted at the end of their original parent's child list so the user
// still sees "this used to be here, it's gone" at the correct level of the
// hierarchy.
export function diffDraftTree(
  working: DraftNode | null,
  canonical: DraftNode | null,
): DiffNode | null {
  if (!working && !canonical) return null;
  if (!working && canonical) return markSubtree(canonical, "deleted");
  if (working && !canonical) return markSubtree(working, "added");
  return diffNode(working!, canonical!);
}

function diffNode(working: DraftNode, canonical: DraftNode): DiffNode {
  const changedFields = fieldsThatChanged(working, canonical);
  const status: DiffStatus =
    changedFields.length > 0 ? "modified" : "unchanged";

  const canonicalChildById = new Map<string, DraftNode>();
  for (const c of canonical.children) {
    if (c.id) canonicalChildById.set(c.id, c);
  }
  const workingChildIds = new Set<string>();
  for (const c of working.children) {
    if (c.id) workingChildIds.add(c.id);
  }

  const diffedChildren: DiffNode[] = [];

  // Retained + added children — preserve the order the AI proposed.
  for (const workingChild of working.children) {
    const canonicalChild = workingChild.id
      ? canonicalChildById.get(workingChild.id)
      : undefined;
    if (canonicalChild) {
      diffedChildren.push(diffNode(workingChild, canonicalChild));
    } else {
      diffedChildren.push(markSubtree(workingChild, "added"));
    }
  }

  // Deleted children — appended at the end of THIS parent's children so the
  // user still sees the removal in place.
  for (const canonicalChild of canonical.children) {
    if (canonicalChild.id && !workingChildIds.has(canonicalChild.id)) {
      diffedChildren.push(markSubtree(canonicalChild, "deleted"));
    }
  }

  return {
    id: working.id,
    title: working.title,
    plannerType: working.plannerType,
    duration: working.duration,
    deadline: working.deadline,
    priority: working.priority,
    isReady: working.isReady,
    categoryId: working.categoryId,
    color: working.color ?? null,
    splitting: working.splitting ?? null,
    maxMinutesPerDay: working.maxMinutesPerDay ?? null,
    recurrence: working.recurrence ?? null,
    status,
    children: diffedChildren,
    changedFields,
  };
}

export function markSubtree(node: DraftNode, status: DiffStatus): DiffNode {
  return {
    id: node.id,
    title: node.title,
    plannerType: node.plannerType,
    duration: node.duration,
    deadline: node.deadline,
    priority: node.priority,
    isReady: node.isReady,
    categoryId: node.categoryId,
    color: node.color ?? null,
    splitting: node.splitting ?? null,
    maxMinutesPerDay: node.maxMinutesPerDay ?? null,
    recurrence: node.recurrence ?? null,
    status,
    changedFields: [],
    children: node.children.map((c) => markSubtree(c, status)),
  };
}

function splittingEqual(a: DraftNode["splitting"], b: DraftNode["splitting"]): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null || right === null) return left === right;
  return (
    left.minMinutes === right.minMinutes &&
    left.maxMinutes === right.maxMinutes &&
    (left.maxMinutesPerDay ?? null) === (right.maxMinutesPerDay ?? null) &&
    (left.minSpacingMinutes ?? null) === (right.minSpacingMinutes ?? null)
  );
}

function recurrenceEqual(
  a: DraftNode["recurrence"],
  b: DraftNode["recurrence"],
): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null || right === null) return left === right;
  return (
    left.freq === right.freq &&
    left.interval === right.interval &&
    (left.until ?? null) === (right.until ?? null)
  );
}

function fieldsThatChanged(a: DraftNode, b: DraftNode): string[] {
  const changed: string[] = [];
  if (a.title !== b.title) changed.push("title");
  if (a.plannerType !== b.plannerType) changed.push("plannerType");
  if (a.duration !== b.duration) changed.push("duration");
  if (a.deadline !== b.deadline) changed.push("deadline");
  if (a.priority !== b.priority) changed.push("priority");
  if (a.isReady !== b.isReady) changed.push("isReady");
  if (a.categoryId !== b.categoryId) changed.push("categoryId");
  if ((a.color ?? null) !== (b.color ?? null)) changed.push("color");
  if (!splittingEqual(a.splitting, b.splitting)) changed.push("splitting");
  if ((a.maxMinutesPerDay ?? null) !== (b.maxMinutesPerDay ?? null))
    changed.push("maxMinutesPerDay");
  if (!recurrenceEqual(a.recurrence, b.recurrence)) changed.push("recurrence");
  return changed;
}

export function diffSubtreeHasChanges(node: DiffNode): boolean {
  if (node.status !== "unchanged") return true;
  return node.children.some(diffSubtreeHasChanges);
}

// Shallow-fields-plus-ordered-children equality. Cheap and sufficient: the AI
// writes wholesale subtree replacements, so a real edit always changes at
// least one field, id, or child ordering. Child order IS semantic within a
// goal (schedule order); top-level forest order is not — see draftForestsEqual.
export function draftTreesEqual(a: DraftNode, b: DraftNode): boolean {
  if (fieldsThatChanged(a, b).length > 0) return false;
  if (a.id !== b.id || a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!draftTreesEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}
