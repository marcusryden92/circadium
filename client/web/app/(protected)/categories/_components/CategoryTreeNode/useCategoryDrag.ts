"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CategoryDropTarget } from "./CategoryTreeNode";

const DRAG_THRESHOLD_PX = 8;
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_STEP_PX = 14;

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node;
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

function speedForDistance(distance: number): number {
  const clamped = Math.min(Math.max(distance, 0), AUTO_SCROLL_EDGE_PX);
  return Math.ceil(
    (1 - clamped / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP_PX,
  );
}

// The rail's one drag system, grip-initiated for mouse and touch alike (same
// shape as the subtasks list's useTouchDragReorder): the grip captures the
// pointer, hit-testing runs through document.elementFromPoint against the
// rows' data-category-id, and the drop feeds the page's existing performDrop
// path. Rows carry no HTML5 draggable — pointer events keep the cursor and
// the floating drag pill under our control. Folder semantics: a row is an
// "into" target, rail space outside any row is the "root" target (move to
// top level; skipped when the dragged category is already top-level).
export function useCategoryDrag({
  nodeId,
  isTopLevel,
  setDraggedId,
  setDragOver,
  onDrop,
}: {
  nodeId: string;
  isTopLevel: boolean;
  setDraggedId: (id: string | null) => void;
  setDragOver: (s: CategoryDropTarget | null) => void;
  onDrop: (sourceId: string, target: CategoryDropTarget) => void;
}) {
  // Window listeners bind at pointerdown; refs keep the latest props reachable
  // from those closures across re-renders.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const setDragOverRef = useRef(setDragOver);
  setDragOverRef.current = setDragOver;
  const setDraggedIdRef = useRef(setDraggedId);
  setDraggedIdRef.current = setDraggedId;

  const pointerIdRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const dropRef = useRef<CategoryDropTarget | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);

  const endGesture = useCallback(() => {
    pointerIdRef.current = null;
    draggingRef.current = false;
    removeListenersRef.current?.();
    removeListenersRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    scrollParentRef.current = null;
    dropRef.current = null;
    setDragOverRef.current(null);
    setDraggedIdRef.current(null);
  }, []);

  useEffect(
    () => () => {
      if (pointerIdRef.current !== null) endGesture();
    },
    [endGesture],
  );

  const updateDropTarget = useCallback(
    (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      const rowEl = el?.closest<HTMLElement>("[data-category-id]");
      let next: CategoryDropTarget | null = null;
      if (rowEl) {
        if (rowEl.dataset.categoryId !== nodeId) {
          next = { kind: "into", id: rowEl.dataset.categoryId as string };
        }
      } else if (!isTopLevel && el?.closest("[data-category-root-zone]")) {
        next = { kind: "root" };
      }

      const prev = dropRef.current;
      const unchanged =
        prev === next ||
        (!!prev &&
          !!next &&
          prev.kind === next.kind &&
          (prev.kind !== "into" ||
            prev.id === (next as { kind: "into"; id: string }).id));
      if (!unchanged) {
        dropRef.current = next;
        setDragOverRef.current(next);
      }
    },
    [nodeId, isTopLevel],
  );

  const autoScrollStep = useCallback(() => {
    const scrollParent = scrollParentRef.current;
    if (scrollParent) {
      const isRoot = scrollParent === document.scrollingElement;
      const rect = isRoot ? null : scrollParent.getBoundingClientRect();
      const top = Math.max(rect?.top ?? 0, 0);
      const bottom = Math.min(rect?.bottom ?? Infinity, window.innerHeight);
      const y = lastPointRef.current.y;

      let delta = 0;
      if (y - top < AUTO_SCROLL_EDGE_PX) {
        delta = -speedForDistance(y - top);
      } else if (bottom - y < AUTO_SCROLL_EDGE_PX) {
        delta = speedForDistance(bottom - y);
      }

      if (delta !== 0) {
        const before = scrollParent.scrollTop;
        scrollParent.scrollTop = before + delta;
        if (scrollParent.scrollTop !== before)
          updateDropTarget(lastPointRef.current.x, lastPointRef.current.y);
      }
    }
    rafRef.current = requestAnimationFrame(autoScrollStep);
  }, [updateDropTarget]);

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (pointerIdRef.current !== null) return;
      // Canceling pointerdown suppresses the mousedown default action, so a
      // mouse drag doesn't paint a text selection across the rail.
      if (e.pointerType === "mouse") e.preventDefault();

      pointerIdRef.current = e.pointerId;
      draggingRef.current = false;
      const start = { x: e.clientX, y: e.clientY };
      lastPointRef.current = start;
      const gripEl = e.currentTarget as HTMLElement;

      const handleMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        lastPointRef.current = { x: ev.clientX, y: ev.clientY };

        if (!draggingRef.current) {
          const dx = ev.clientX - start.x;
          const dy = ev.clientY - start.y;
          if (dx * dx + dy * dy <= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX)
            return;
          draggingRef.current = true;
          setDraggedIdRef.current(nodeId);
          scrollParentRef.current = getScrollParent(gripEl);
          rafRef.current = requestAnimationFrame(autoScrollStep);
        }
        updateDropTarget(ev.clientX, ev.clientY);
      };

      const handleUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        const wasDragging = draggingRef.current;
        const target = dropRef.current;
        endGesture();
        if (!wasDragging || !target) return;
        onDropRef.current(nodeId, target);
      };

      const handleCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        endGesture();
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      removeListenersRef.current = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleCancel);
      };
    },
    [nodeId, updateDropTarget, autoScrollStep, endGesture],
  );

  return { onGripPointerDown };
}
