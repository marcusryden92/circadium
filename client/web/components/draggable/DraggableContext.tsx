"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
  SetStateAction,
} from "react";

import DragBox from "@/components/draggable/DragBox";
import { ReorderRefusalBanner } from "@/components/draggable/ReorderRefusalBanner";
import { TouchDropTarget } from "@/components/draggable/touchDropResolution";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { MovePrecedenceGuard } from "@/utils/goal-handlers/moveItem";

type ClickedItem = {
  taskId: string;
  taskTitle: string;
  parentId: string;
} | null;

// Define the type for the context state
interface DraggableContextType {
  currentlyHoveredItem: string | null;
  setCurrentlyHoveredItem: React.Dispatch<SetStateAction<string | null>>;
  currentlyClickedItem: ClickedItem | null;
  setCurrentlyClickedItem: React.Dispatch<SetStateAction<ClickedItem | null>>;
  displayDragBox: boolean;
  setDisplayDragBox: React.Dispatch<SetStateAction<boolean>>;
  // Touch drags can't set hover state on the rows/dividers under the finger;
  // useTouchDragReorder resolves the target via elementFromPoint and the
  // matching row/divider highlights off this instead.
  touchDropTarget: TouchDropTarget;
  setTouchDropTarget: React.Dispatch<SetStateAction<TouchDropTarget>>;
  focusedTask: string | null;
  setFocusedTask: React.Dispatch<React.SetStateAction<string | null>>;
  // Transient post-drop marker: the just-moved row flashes so it's findable
  // wherever it landed. Self-clears; separate from focusedTask, which opens
  // the edit drawer on the subtasks page.
  droppedTask: string | null;
  flashDroppedTask: (taskId: string) => void;
  // Ready-made guard for moveToEdge/moveToMiddle: validates the proposed
  // order against node-level dependency loops and surfaces refusals through
  // the shared banner. One wiring point for every drag surface.
  moveGuard: MovePrecedenceGuard;
}

const DraggableContext = createContext<DraggableContextType | null>(null);

export const DraggableContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // States to track hovered and clicked items
  const [currentlyHoveredItem, setCurrentlyHoveredItem] = useState<
    string | null
  >(null);
  const [currentlyClickedItem, setCurrentlyClickedItem] =
    useState<ClickedItem>(null);
  const [displayDragBox, setDisplayDragBox] = useState<boolean>(false);
  const [touchDropTarget, setTouchDropTarget] =
    useState<TouchDropTarget>(null);
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const [droppedTask, setDroppedTask] = useState<string | null>(null);
  const droppedTimerRef = useRef<number | null>(null);
  const { queues, dependencies } = useCalendarProvider();
  const [reorderRefusal, setReorderRefusal] = useState<string | null>(null);
  const refusalTimerRef = useRef<number | null>(null);

  const flashReorderRefusal = useCallback((message: string) => {
    if (refusalTimerRef.current !== null)
      window.clearTimeout(refusalTimerRef.current);
    setReorderRefusal(message);
    refusalTimerRef.current = window.setTimeout(() => {
      setReorderRefusal(null);
      refusalTimerRef.current = null;
    }, 6000);
  }, []);

  useEffect(
    () => () => {
      if (refusalTimerRef.current !== null)
        window.clearTimeout(refusalTimerRef.current);
    },
    [],
  );

  const moveGuard = useMemo<MovePrecedenceGuard>(
    () => ({ queues, dependencies, onRefused: flashReorderRefusal }),
    [queues, dependencies, flashReorderRefusal],
  );

  // Duration matches the dropFlash keyframe animation in lumenTasks.css.ts.
  const flashDroppedTask = useCallback((taskId: string) => {
    if (droppedTimerRef.current !== null)
      window.clearTimeout(droppedTimerRef.current);
    setDroppedTask(taskId);
    droppedTimerRef.current = window.setTimeout(() => {
      setDroppedTask(null);
      droppedTimerRef.current = null;
    }, 700);
  }, []);

  useEffect(
    () => () => {
      if (droppedTimerRef.current !== null)
        window.clearTimeout(droppedTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    function resetDisplayDragBox() {
      setDisplayDragBox(false);
    }

    document.addEventListener("mouseup", resetDisplayDragBox);

    return () => {
      document.removeEventListener("mouseup", resetDisplayDragBox);
    };
  }, []);

  // Escape aborts an in-progress drag: with the clicked/hovered state cleared,
  // the mouseup that follows fails handleMouseUp's guards and nothing commits.
  useEffect(() => {
    if (!displayDragBox && !currentlyClickedItem) return;

    function cancelDrag(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDisplayDragBox(false);
      setCurrentlyClickedItem(null);
      setCurrentlyHoveredItem(null);
      setTouchDropTarget(null);
    }

    document.addEventListener("keydown", cancelDrag);
    return () => document.removeEventListener("keydown", cancelDrag);
  }, [displayDragBox, currentlyClickedItem]);

  // Context value with hover and click state setters
  const value: DraggableContextType = {
    currentlyHoveredItem,
    setCurrentlyHoveredItem,
    currentlyClickedItem,
    setCurrentlyClickedItem,
    displayDragBox,
    setDisplayDragBox,
    touchDropTarget,
    setTouchDropTarget,
    focusedTask,
    setFocusedTask,
    droppedTask,
    flashDroppedTask,
    moveGuard,
  };

  return (
    <DraggableContext.Provider value={value}>
      <DragBox />
      <ReorderRefusalBanner message={reorderRefusal} />
      {children}
    </DraggableContext.Provider>
  );
};

// Hook to use the context in other components
export const useDraggableContext = () => {
  const context = useContext(DraggableContext);
  if (!context) {
    throw new Error(
      "useDraggableContext must be used within a DraggableContextProvider"
    );
  }
  return context;
};
