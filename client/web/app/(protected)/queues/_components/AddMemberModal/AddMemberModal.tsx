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
import { isValidPrecedenceEndpoint } from "@/utils/precedence/endpoints";
import { formatDurationCompact } from "@/utils/timeFormatting";
import { wouldCreateCycleAddingQueueMember } from "@/utils/precedence/findCycle";
import {
  overlay,
  dialog,
  inputRow,
  inputIcon,
  input,
  scrollArea,
  item,
  itemActive,
  itemTitle,
  itemDuration,
  emptyState,
} from "./AddMemberModal.css";

// SearchPalette's rank function, reused verbatim for consistent feel.
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

type AddMemberModalProps = {
  open: boolean;
  onClose: () => void;
  queue: Queue;
  queues: Queue[];
  dependencies: PlannerDependency[];
  planner: Planner[];
  onPick: (plannerId: string) => void;
};

export function AddMemberModal({
  open,
  onClose,
  queue,
  queues,
  dependencies,
  planner,
  onPick,
}: AddMemberModalProps) {
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

  const candidates = useMemo(() => {
    const inAnyQueue = new Set(
      queues.flatMap((q) => q.members.map((m) => m.plannerId)),
    );
    const base = planner.filter(
      (p) =>
        isValidPrecedenceEndpoint(p) &&
        !plannerIsCompleted(p) &&
        !inAnyQueue.has(p.id) &&
        // Members append to the end; anything that would close a cycle
        // through an external dependency or detour path is excluded outright.
        !wouldCreateCycleAddingQueueMember(
          queues,
          dependencies,
          queue.id,
          p.id,
          undefined,
          planner,
        ),
    );
    const q = query.trim();
    if (!q) {
      return [...base]
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
        .slice(0, 30);
    }
    return base
      .map((p) => ({ p, score: matchScore(p.title ?? "", q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(({ p }) => p);
  }, [planner, queues, dependencies, queue.id, query]);

  const pick = (plannerId: string) => {
    onPick(plannerId);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (candidates.length === 0) return;
      setActiveIndex((i) => (i + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (candidates.length === 0) return;
      setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter") {
      const target = candidates[activeIndex];
      if (!target) return;
      e.preventDefault();
      pick(target.id);
    }
  };

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
          placeholder="Add a task or goal…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search items to add"
        />
      </div>

      <div className={scrollArea}>
        {candidates.length === 0 ? (
          <div className={emptyState}>
            {query.trim()
              ? `No matches for "${query}"`
              : "No eligible items — only top-level tasks and goals that aren't already in a queue can be added."}
          </div>
        ) : (
          candidates.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              className={`${item} ${idx === activeIndex ? itemActive : ""}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => pick(p.id)}
            >
              <TypeBadge size="sm">{p.plannerType}</TypeBadge>
              <span className={itemTitle}>{p.title || "Untitled"}</span>
              {p.duration > 0 && (
                <span className={itemDuration}>
                  {formatDurationCompact(p.duration)}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={(next) => !next && onClose()}
        title="Add to queue"
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
            Add to queue
          </Dialog.Title>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
