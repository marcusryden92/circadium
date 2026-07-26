"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  Search,
  Target,
  CheckSquare,
  Calendar as CalendarIcon,
  Repeat,
  Layers,
  MapPin,
  CornerDownLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSearch } from "../SearchContext";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { RootState } from "@/redux/store";
import type { Planner, Category, Location } from "@/types/prisma";
import { Input, Kbd } from "@/components/ui";
import { BottomSheet } from "../../BottomSheet";
import {
  overlay,
  dialog,
  inputRow,
  inputIcon,
  input,
  scrollArea,
  group,
  groupLabel,
  item,
  itemActive,
  itemIcon,
  itemBody,
  itemTitle,
  itemSub,
  emptyState,
  footer,
  footerHints,
} from "./SearchPalette.css";

const MAX_PER_GROUP = 5;

type ResultKind = "item" | "category" | "location";

type SearchResult = {
  kind: ResultKind;
  id: string;
  title: string;
  sub: string;
  icon: LucideIcon;
  href: string;
};

const PLANNER_ICONS: Record<Planner["plannerType"], LucideIcon> = {
  task: CheckSquare,
  goal: Target,
  plan: CalendarIcon,
  habit: Repeat,
};

function plannerSub(p: Planner): string {
  const type = p.plannerType.charAt(0).toUpperCase() + p.plannerType.slice(1);
  if (p.plannerType === "task" && p.duration) return `${type} · ${p.duration}m`;
  if (p.plannerType === "plan" && p.starts) {
    const d = new Date(p.starts);
    return `${type} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  return type;
}

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

export function SearchPalette() {
  const { open, setOpen } = useSearch();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { planner, categories } = useCalendarProvider();
  const locations = useSelector(
    (state: RootState) => state.schedulingSettings.locations,
  ) as Location[];

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

  const { groups, flat } = useMemo(() => {
    const q = query.trim();

    const itemResults: SearchResult[] = q
      ? planner
          .map((p) => ({ p, score: matchScore(p.title ?? "", q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_PER_GROUP)
          .map(({ p }) => ({
            kind: "item" as const,
            id: p.id,
            title: p.title || "Untitled",
            sub: plannerSub(p),
            icon: PLANNER_ICONS[p.plannerType] ?? CheckSquare,
            href: `/items/${p.id}`,
          }))
      : [];

    const categoryResults: SearchResult[] = q
      ? categories
          .map((c: Category) => ({ c, score: matchScore(c.name ?? "", q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_PER_GROUP)
          .map(({ c }) => ({
            kind: "category" as const,
            id: c.id,
            title: c.name,
            sub: "Category",
            icon: Layers,
            href: `/categories`,
          }))
      : [];

    const locationResults: SearchResult[] = q
      ? locations
          .map((l) => ({
            l,
            score: Math.max(
              matchScore(l.name ?? "", q),
              matchScore(l.address ?? "", q) * 0.7,
            ),
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_PER_GROUP)
          .map(({ l }) => ({
            kind: "location" as const,
            id: l.id,
            title: l.name,
            sub: l.address || "",
            icon: MapPin,
            href: `/locations`,
          }))
      : [];

    const grouped: { label: string; results: SearchResult[] }[] = [];
    if (itemResults.length)
      grouped.push({
        label: `items · ${itemResults.length}`,
        results: itemResults,
      });
    if (categoryResults.length)
      grouped.push({
        label: `categories · ${categoryResults.length}`,
        results: categoryResults,
      });
    if (locationResults.length)
      grouped.push({
        label: `locations · ${locationResults.length}`,
        results: locationResults,
      });

    const flatList = grouped.flatMap((g) => g.results);
    return { groups: grouped, flat: flatList };
  }, [query, planner, categories, locations]);

  const activate = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length === 0) return;
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      const target = flat[activeIndex];
      if (!target) return;
      e.preventDefault();
      activate(target);
    }
  };

  const showEmpty = query.trim().length > 0 && flat.length === 0;

  const content = (
    <>
      <div className={inputRow}>
        <span className={inputIcon} aria-hidden>
          <Search size={18} strokeWidth={2} />
        </span>
        <Input
          ref={inputRef}
          variant="bare"
          className={input}
          placeholder="Search items, categories, locations…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search"
        />
      </div>

      <div className={scrollArea}>
        {showEmpty && (
          <div className={emptyState}>No matches for &ldquo;{query}&rdquo;</div>
        )}
        {!showEmpty && query.trim().length === 0 && (
          <div className={emptyState}>
            Start typing to search across items, categories, and locations.
          </div>
        )}
        {groups.map((g) => {
          const startIdx = flat.indexOf(g.results[0]);
          return (
            <div key={g.label} className={group}>
              <div className={groupLabel}>{g.label}</div>
              {g.results.map((r, j) => {
                const Icon = r.icon;
                const idx = startIdx + j;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`${r.kind}-${r.id}`}
                    type="button"
                    className={`${item} ${isActive ? itemActive : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => activate(r)}
                  >
                    <span className={itemIcon} aria-hidden>
                      <Icon size={16} strokeWidth={2} />
                    </span>
                    <span className={itemBody}>
                      <span className={itemTitle}>{r.title}</span>
                      {r.sub && <span className={itemSub}>{r.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className={footer}>
        <span className={footerHints}>
          <Kbd keys={["↑", "↓"]} separator="/" instruction="navigate" />
          <Kbd
            keys={<CornerDownLeft size={9} strokeWidth={2.4} />}
            instruction="open"
          />
          <Kbd keys="esc" instruction="close" />
        </span>
        <span>across items, categories, locations</span>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Search"
        hideTitle
        flush
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {content}
      </BottomSheet>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title style={{ position: "absolute", left: -10000 }}>
            Search
          </Dialog.Title>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
