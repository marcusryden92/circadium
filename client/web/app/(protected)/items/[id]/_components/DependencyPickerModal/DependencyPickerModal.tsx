"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import type { Planner, Queue, PlannerDependency } from "@/types/prisma";
import { BottomSheet, Input, TypeBadge } from "@/components/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import { plannerIsCompleted } from "@/utils/plannerCompletion";
import { isValidDependencyEndpoint } from "@/utils/precedence/endpoints";
import { getRootParentId } from "@/utils/goalPageHandlers";
import {
  collectValidationEdges,
  contractPrecedenceEdges,
  detourComponentMap,
  subtreeBoundaryLeaves,
} from "@/utils/precedence/validationEdges";
import {
  overlay,
  dialog,
  inputRow,
  inputIcon,
  input,
  scrollArea,
  item,
  itemActive,
  itemBlocked,
  itemBody,
  itemTitle,
  itemCrumbs,
  itemReason,
  emptyState,
} from "./DependencyPickerModal.css";

// SearchPalette's rank function, reused for consistent feel.
function matchScore(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  const idx = h.indexOf(n);
  if (idx >= 0) return 60 - Math.min(idx, 40);
  return 0;
}

type CandidateRow = {
  planner: Planner;
  // "Goal › Sub › Item" for interior nodes; empty for roots.
  crumbs: string;
  blockedReason: "same-goal" | "loop" | null;
};

type DependencyPickerModalProps = {
  open: boolean;
  onClose: () => void;
  // The successor: picking an item makes it this item's prerequisite.
  anchor: Planner;
  planner: Planner[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  // Ids already linked to the anchor in either direction (hidden).
  linkedIds: ReadonlySet<string>;
  onPick: (predecessorId: string) => void;
};

export function DependencyPickerModal({
  open,
  onClose,
  anchor,
  planner,
  queues,
  dependencies,
  linkedIds,
  onPick,
}: DependencyPickerModalProps) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQuery("");
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // One reverse-reachability set per open instead of a cycle check per
  // option: adding cand -> anchor closes a loop iff the anchor's expanded
  // node already reaches cand's expanded node over the contracted graph.
  const candidates = useMemo<CandidateRow[]>(() => {
    if (!open) return [];
    const byId = new Map(planner.map((p) => [p.id, p]));
    const anchorRoot = getRootParentId(planner, anchor.id) ?? anchor.id;

    const repr = detourComponentMap(planner);
    const contracted = (id: string) => repr.get(id) ?? id;
    const edges = contractPrecedenceEdges(
      collectValidationEdges(queues, dependencies, planner),
      repr,
    );
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      const list = adjacency.get(edge.fromId);
      if (list) list.push(edge.toId);
      else adjacency.set(edge.fromId, [edge.toId]);
    }
    const startNode = contracted(
      subtreeBoundaryLeaves(planner, anchor.id).firstLeafId,
    );
    const reachable = new Set<string>([startNode]);
    const stack = [startNode];
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const next of adjacency.get(node) ?? []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        stack.push(next);
      }
    }

    const crumbsFor = (p: Planner): string => {
      if (!p.parentId) return "";
      const parts: string[] = [];
      const seen = new Set<string>([p.id]);
      let current = byId.get(p.parentId);
      while (current) {
        parts.unshift(current.title || "Untitled");
        if (!current.parentId || seen.has(current.parentId)) break;
        seen.add(current.parentId);
        current = byId.get(current.parentId);
      }
      return parts.join(" › ");
    };

    return planner
      .filter(
        (p) =>
          p.id !== anchor.id &&
          !linkedIds.has(p.id) &&
          !plannerIsCompleted(p) &&
          isValidDependencyEndpoint(byId, p.id),
      )
      .map((p): CandidateRow => {
        const sameGoal =
          (getRootParentId(planner, p.id) ?? p.id) === anchorRoot;
        const loop =
          !sameGoal &&
          reachable.has(
            contracted(subtreeBoundaryLeaves(planner, p.id).lastLeafId),
          );
        return {
          planner: p,
          crumbs: crumbsFor(p),
          blockedReason: sameGoal ? "same-goal" : loop ? "loop" : null,
        };
      })
      .sort(
        (a, b) =>
          (a.blockedReason ? 1 : 0) - (b.blockedReason ? 1 : 0) ||
          (a.planner.title || "").localeCompare(b.planner.title || ""),
      );
  }, [open, planner, queues, dependencies, anchor.id, linkedIds]);

  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return candidates.slice(0, 40);
    return candidates
      .map((row) => ({
        row,
        score: Math.max(
          matchScore(row.planner.title ?? "", q),
          matchScore(row.crumbs, q) - 10,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(({ row }) => row);
  }, [candidates, query]);

  const pickable = visible.filter((row) => !row.blockedReason);

  const pick = (row: CandidateRow) => {
    if (row.blockedReason) return;
    onPick(row.planner.id);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (pickable.length === 0) return;
      setActiveIndex((i) => (i + 1) % pickable.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (pickable.length === 0) return;
      setActiveIndex((i) => (i - 1 + pickable.length) % pickable.length);
    } else if (e.key === "Enter") {
      const target = pickable[activeIndex];
      if (!target) return;
      e.preventDefault();
      pick(target);
    }
  };

  const reasonText = (reason: "same-goal" | "loop"): string =>
    reason === "same-goal"
      ? "same goal — order is set by the list"
      : "would create a loop";

  const content = (
    <>
      <div className={inputRow}>
        <span className={inputIcon} aria-hidden>
          <Search size={16} strokeWidth={2} />
        </span>
        <Input
          ref={inputRef}
          variant="bare"
          className={input}
          placeholder="Add a prerequisite…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search items to depend on"
        />
      </div>

      <div className={scrollArea}>
        {visible.length === 0 ? (
          <div className={emptyState}>
            {query.trim()
              ? `No matches for "${query}"`
              : "No eligible items to depend on."}
          </div>
        ) : (
          visible.map((row) => {
            const activeId = pickable[activeIndex]?.planner.id;
            return (
              <button
                key={row.planner.id}
                type="button"
                className={`${item} ${
                  row.blockedReason
                    ? itemBlocked
                    : row.planner.id === activeId
                      ? itemActive
                      : ""
                }`}
                aria-disabled={row.blockedReason !== null}
                onMouseEnter={() => {
                  if (row.blockedReason) return;
                  const idx = pickable.findIndex(
                    (r) => r.planner.id === row.planner.id,
                  );
                  if (idx >= 0) setActiveIndex(idx);
                }}
                onClick={() => pick(row)}
              >
                <TypeBadge size="sm">{row.planner.plannerType}</TypeBadge>
                <span className={itemBody}>
                  <span className={itemTitle}>
                    {row.planner.title || "Untitled"}
                  </span>
                  {row.crumbs && (
                    <span className={itemCrumbs}>{row.crumbs}</span>
                  )}
                </span>
                {row.blockedReason && (
                  <span className={itemReason}>
                    {reasonText(row.blockedReason)}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        title="Add prerequisite"
        hideTitle
        flush
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {content}
      </BottomSheet>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title style={{ position: "absolute", left: -10000 }}>
            Add prerequisite
          </Dialog.Title>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
