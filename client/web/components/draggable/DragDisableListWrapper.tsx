import React from "react";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import {
  dragDisableWrap,
  dragDisableWrapDragged,
} from "@/components/tasks/lumenTasks.css";

export default function DragDisableListWrapper({
  children,
  taskId,
}: {
  children: React.ReactNode;
  taskId: string;
}) {
  const { currentlyClickedItem, displayDragBox } = useDraggableContext();
  const dragged =
    taskId === currentlyClickedItem?.taskId && displayDragBox;
  return (
    <div className={`${dragDisableWrap} ${dragged ? dragDisableWrapDragged : ""}`}>
      {children}
    </div>
  );
}
