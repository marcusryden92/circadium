import React, { useRef, useEffect } from "react";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import { dragBox } from "@/components/tasks/lumenTasks.css";

export default function DragBox() {
  const { currentlyClickedItem, displayDragBox, setDisplayDragBox } =
    useDraggableContext();
  const dragBoxRef = useRef<HTMLDivElement | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);

  const taskTitle = useRef<string>("");
  if (currentlyClickedItem) taskTitle.current = currentlyClickedItem.taskTitle;

  // The grip initiates the click; show the drag box immediately.
  useEffect(() => {
    setDisplayDragBox(!!currentlyClickedItem);
  }, [currentlyClickedItem, setDisplayDragBox]);

  useEffect(() => {
    // pointermove instead of mousemove so the box also follows touch drags.
    function handlePointerMove(e: PointerEvent) {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    }

    document.addEventListener("pointermove", handlePointerMove);

    function animationFrame() {
      if (dragBoxRef.current) {
        const boxWidth = dragBoxRef.current.offsetWidth;
        const boxHeight = dragBoxRef.current.offsetHeight;

        const top = `${mousePositionRef.current.y - boxHeight * 0.7}px`;
        const left = `${mousePositionRef.current.x - boxWidth / 2}px`;

        const style = dragBoxRef.current.style;
        style.top = top;
        style.left = left;
      }

      animationFrameId.current = requestAnimationFrame(animationFrame);
    }

    animationFrameId.current = requestAnimationFrame(animationFrame);

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div
      ref={dragBoxRef}
      className={dragBox}
      style={{
        opacity: displayDragBox ? 0.85 : 0,
      }}
    >
      {taskTitle.current}
    </div>
  );
}
