"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

// Arrow-key navigation for an inline list that lives next to its trigger
// input (a typeahead dropdown). ArrowDown / ArrowUp walk the items, Enter
// commits the highlighted one (or the first row if none is highlighted yet).
// The active index resets whenever the items array reference changes so a
// fresh search doesn't carry a stale highlight.
//
// Attach `containerRef` to the scrollable list element and set
// `data-knav-index={i}` on each row — the hook scrolls the active row into
// view when keyboard navigation moves the highlight past the visible bounds.
export function useListKeyboardNav<T>(
  items: T[],
  onSelect: (item: T) => void,
): {
  activeIndex: number | null;
  setActiveIndex: (i: number | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  containerRef: RefObject<HTMLDivElement | null>;
} {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveIndex(null);
  }, [items]);

  useEffect(() => {
    if (activeIndex === null) return;
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(
      `[data-knav-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((cur) =>
        cur === null ? 0 : Math.min(cur + 1, items.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((cur) =>
        cur === null ? items.length - 1 : Math.max(cur - 1, 0),
      );
    } else if (e.key === "Enter") {
      const target = activeIndex !== null ? items[activeIndex] : items[0];
      if (target !== undefined) {
        e.preventDefault();
        onSelect(target);
      }
    }
  };

  return { activeIndex, setActiveIndex, onKeyDown, containerRef };
}
