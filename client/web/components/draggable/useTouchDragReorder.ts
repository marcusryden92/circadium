"use client";

import { useCallback, useEffect, useRef } from "react";

import { useCalendarProvider } from "@/context/CalendarProvider";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import { moveToEdge, moveToMiddle } from "@/utils/goal-handlers/moveItem";
import {
  resolveTouchDropTarget,
  TouchDropTarget,
} from "@/components/draggable/touchDropResolution";

const DRAG_THRESHOLD_PX = 8;
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_STEP_PX = 14;

interface UseTouchDragReorderProps {
  taskId: string;
  taskTitle: string;
  parentId: string | null;
  onDragStart: () => void;
}

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

// Touch counterpart to the mouse drag in TaskItem/DraggableItem/TaskDivider.
// Touch pointers are implicitly captured to the grip, so hover targets never
// fire; hit-testing runs through document.elementFromPoint instead, and the
// result feeds the same moveToEdge/moveToMiddle handlers as a mouse drop.
export function useTouchDragReorder({
  taskId,
  taskTitle,
  parentId,
  onDragStart,
}: UseTouchDragReorderProps) {
  const { planner, updatePlannerArray } = useCalendarProvider();
  const {
    setCurrentlyClickedItem,
    setTouchDropTarget,
    flashDroppedTask,
    moveGuard,
  } = useDraggableContext();

  const plannerRef = useRef(planner);
  plannerRef.current = planner;

  const pointerIdRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragOccurredRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const dropTargetRef = useRef<TouchDropTarget>(null);
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
    dropTargetRef.current = null;
    setTouchDropTarget(null);
    setCurrentlyClickedItem(null);
  }, [setTouchDropTarget, setCurrentlyClickedItem]);

  useEffect(
    () => () => {
      if (pointerIdRef.current !== null) endGesture();
    },
    [endGesture],
  );

  const updateDropTarget = useCallback(
    (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      let next: TouchDropTarget = null;

      const divider = el?.closest<HTMLElement>("[data-divider-target]");
      if (divider) {
        next = {
          taskId: divider.dataset.dividerTarget as string,
          kind: divider.dataset.dividerLocation === "bottom" ? "bottom" : "top",
        };
      } else {
        const rowEl = el?.closest<HTMLElement>('[id^="draggable-"]');
        if (rowEl) {
          const rect = rowEl.getBoundingClientRect();
          // The nested list wrapper is the row's next sibling; a collapsed
          // subtree animates to height 0, so offsetHeight doubles as the
          // expansion check.
          const listWrapper = rowEl.nextElementSibling as HTMLElement | null;
          next = resolveTouchDropTarget({
            planner: plannerRef.current,
            draggedId: taskId,
            draggedParentId: parentId,
            rowTaskId: rowEl.id.slice("draggable-".length),
            rowTop: rect.top,
            rowHeight: rect.height,
            clientY: y,
            childrenExpanded: !!listWrapper && listWrapper.offsetHeight > 0,
          });
        }
      }

      const prev = dropTargetRef.current;
      const unchanged =
        prev === next ||
        (!!prev &&
          !!next &&
          prev.taskId === next.taskId &&
          prev.kind === next.kind);
      if (!unchanged) {
        dropTargetRef.current = next;
        setTouchDropTarget(next);
      }
    },
    [taskId, parentId, setTouchDropTarget],
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
        // Content moved under a stationary finger; re-resolve the target.
        if (scrollParent.scrollTop !== before)
          updateDropTarget(lastPointRef.current.x, lastPointRef.current.y);
      }
    }
    rafRef.current = requestAnimationFrame(autoScrollStep);
  }, [updateDropTarget]);

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (pointerIdRef.current !== null) return;

      pointerIdRef.current = e.pointerId;
      draggingRef.current = false;
      dragOccurredRef.current = false;
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
          dragOccurredRef.current = true;
          onDragStart();
          setCurrentlyClickedItem({
            taskId,
            taskTitle,
            parentId: parentId || "",
          });
          scrollParentRef.current = getScrollParent(gripEl);
          rafRef.current = requestAnimationFrame(autoScrollStep);
        }
        updateDropTarget(ev.clientX, ev.clientY);
      };

      const handleUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerIdRef.current) return;
        const wasDragging = draggingRef.current;
        const target = dropTargetRef.current;
        endGesture();
        if (!wasDragging || !target) return;

        const clickedItem = { taskId, taskTitle };
        const moved =
          target.kind === "nest"
            ? moveToMiddle({
                planner: plannerRef.current,
                updatePlannerArray,
                currentlyClickedItem: clickedItem,
                currentlyHoveredItem: target.taskId,
                precedence: moveGuard,
              })
            : moveToEdge({
                planner: plannerRef.current,
                updatePlannerArray,
                currentlyClickedItem: clickedItem,
                targetId: target.taskId,
                mouseLocationInItem: target.kind,
                precedence: moveGuard,
              });
        if (moved) flashDroppedTask(taskId);
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
    [
      taskId,
      taskTitle,
      parentId,
      onDragStart,
      setCurrentlyClickedItem,
      updateDropTarget,
      autoScrollStep,
      endGesture,
      updatePlannerArray,
      flashDroppedTask,
    ],
  );

  // The browser synthesizes a click on the grip after touchend; a real drag
  // must not toggle the move menu on drop.
  const consumeDragClick = useCallback(() => {
    const occurred = dragOccurredRef.current;
    dragOccurredRef.current = false;
    return occurred;
  }, []);

  return { onGripPointerDown, consumeDragClick };
}

function speedForDistance(distance: number): number {
  const clamped = Math.min(Math.max(distance, 0), AUTO_SCROLL_EDGE_PX);
  return Math.ceil(
    (1 - clamped / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP_PX,
  );
}
