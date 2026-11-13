"use client";

import { useEffect, useRef } from "react";
import { dragBox } from "@/components/tasks/lumenTasks.css";

// The subtasks DragBox visual (floating title pill following the pointer),
// fed by the categories drag state instead of DraggableContext. Mounted
// permanently so the pointer position is already current when a drag starts;
// pointermove (not mousemove) so the pill also follows touch drags.
export default function CategoryDragBox({ label }: { label: string | null }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);

  // Keeps the last real label through the fade-out after a drop.
  const shownLabel = useRef("");
  if (label) shownLabel.current = label;

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    }

    document.addEventListener("pointermove", handlePointerMove);

    function frame() {
      if (boxRef.current) {
        const { offsetWidth, offsetHeight } = boxRef.current;
        const style = boxRef.current.style;
        style.top = `${pointerRef.current.y - offsetHeight * 0.7}px`;
        style.left = `${pointerRef.current.x - offsetWidth / 2}px`;
      }
      frameRef.current = requestAnimationFrame(frame);
    }

    frameRef.current = requestAnimationFrame(frame);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div ref={boxRef} className={dragBox} style={{ opacity: label ? 0.85 : 0 }}>
      {shownLabel.current}
    </div>
  );
}
