import type { Planner, PlannerDependency, Queue } from "@/types/prisma";
import { canLinkAsDetour } from "@/utils/precedence/detourLinks";
import type { DraftForest } from "./plannerForestToJson";
import type { DraftNode } from "./plannerTreeToJson";

// Save-time apply for detour links. Runs AFTER the forest apply (node and
// target ids may be drafts minted permanent there — both sides remap through
// nodeIdMap) and BEFORE the precedence apply (whose final cycle defense
// contracts detour components from the planner it receives, so it must see
// these links). Delta-based and concurrent-safe: only links the assistant
// actually changed (working vs canonical, undefined = untouched) are applied,
// and every set is re-validated against the live array with the app's own
// canLinkAsDetour — an invalid or contradictory link is dropped, never
// half-applied. The forest apply's delete+recreate path stamps linkedItemId
// null on re-minted rows, so this pass is also what makes a user-authored
// link survive an assistant restructure.
export function applyDraftDetours({
  planner,
  canonical,
  working,
  nodeIdMap,
  queues,
  dependencies,
  now,
}: {
  planner: Planner[];
  canonical: DraftForest;
  working: DraftForest;
  nodeIdMap: ReadonlyMap<string, string>;
  queues: Queue[];
  dependencies: PlannerDependency[];
  now: string;
}): Planner[] {
  const canonicalLinks = new Map<string, string | null>();
  const collectCanonical = (node: DraftNode) => {
    if (node.id) canonicalLinks.set(node.id, node.linkedItemId ?? null);
    for (const child of node.children) collectCanonical(child);
  };
  for (const goal of canonical.goals) collectCanonical(goal);

  // node id -> desired link, for nodes whose working value is DEFINED and
  // differs from canonical (new nodes count as canonical-null).
  const changes: { nodeId: string; targetId: string | null }[] = [];
  const collectWorking = (node: DraftNode) => {
    if (node.id && node.linkedItemId !== undefined) {
      const before = canonicalLinks.get(node.id) ?? null;
      if ((node.linkedItemId ?? null) !== before) {
        changes.push({ nodeId: node.id, targetId: node.linkedItemId ?? null });
      }
    }
    for (const child of node.children) collectWorking(child);
  };
  for (const goal of working.goals) collectWorking(goal);
  if (changes.length === 0) return planner;

  let current = planner;
  let changedAnything = false;
  for (const change of changes) {
    const nodeId = nodeIdMap.get(change.nodeId) ?? change.nodeId;
    const row = current.find((p) => p.id === nodeId);
    if (!row) continue;
    if (change.targetId === null) {
      if (row.linkedItemId === null) continue;
      current = current.map((p) =>
        p.id === nodeId ? { ...p, linkedItemId: null, updatedAt: now } : p,
      );
      changedAnything = true;
      continue;
    }
    const targetId = nodeIdMap.get(change.targetId) ?? change.targetId;
    if (row.linkedItemId === targetId) continue;
    // Applied sequentially so each check sees links set earlier this save.
    const check = canLinkAsDetour(current, nodeId, targetId, queues, dependencies);
    if (!check.ok) continue;
    current = current.map((p) =>
      p.id === nodeId ? { ...p, linkedItemId: targetId, updatedAt: now } : p,
    );
    changedAnything = true;
  }

  return changedAnything ? current : planner;
}
