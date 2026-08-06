import React, { useState } from "react";
import { useDraggableContext } from "@/components/draggable/DraggableContext";

import { moveToEdge } from "@/utils/goal-handlers/moveItem";
import { Planner } from "@/types/prisma";
import {
  dropDivider,
  dropDividerActive,
  dropDividerTouchTarget,
} from "@/components/tasks/lumenTasks.css";

interface TaskDividerProps {
  planner: Planner[];
  updatePlannerArray: (
    planner: Planner[] | ((prev: Planner[]) => Planner[]),
    label: string,
  ) => void;
  targetId: string;
  mouseLocationInItem: "top" | "bottom";
}

const TaskDivider: React.FC<TaskDividerProps> = ({
  planner,
  updatePlannerArray,
  targetId,
  mouseLocationInItem,
}) => {
  const {
    currentlyClickedItem,
    setCurrentlyClickedItem,
    displayDragBox,
    touchDropTarget,
    flashDroppedTask,
    moveGuard,
  } = useDraggableContext();
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const handleDragEnd = () => {
    if (!currentlyClickedItem || !isHovered || !displayDragBox) return;

    const moved = moveToEdge({
      planner,
      updatePlannerArray,
      currentlyClickedItem,
      targetId,
      mouseLocationInItem,
      precedence: moveGuard,
    });
    if (moved) flashDroppedTask(currentlyClickedItem.taskId);

    setCurrentlyClickedItem(null);
  };

  const active = currentlyClickedItem && displayDragBox;
  const isTouchTarget =
    !!touchDropTarget &&
    touchDropTarget.taskId === targetId &&
    touchDropTarget.kind === mouseLocationInItem;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseUp={handleDragEnd}
      data-divider-target={targetId}
      data-divider-location={mouseLocationInItem}
      className={`${dropDivider} ${active ? dropDividerActive : ""} ${isTouchTarget ? dropDividerTouchTarget : ""}`}
    />
  );
};

export default TaskDivider;
