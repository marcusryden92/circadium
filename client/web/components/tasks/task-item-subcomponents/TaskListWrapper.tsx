"use client";

import React from "react";
import { TaskListWrapperProps } from "@/lib/taskItem";
import { useDraggableContext } from "@/components/draggable/DraggableContext";
import { DURATIONS } from "@/lib/theme";
import {
  nested,
  nestedFocused,
  nestedDragged,
} from "@/components/tasks/lumenTasks.css";

const TaskListWrapper: React.FC<TaskListWrapperProps> = ({
  taskId,
  subtasksLength,
  parentId,
  subtasksMinimized,
  itemIsFocused,
  children,
}) => {
  const { displayDragBox, currentlyClickedItem } = useDraggableContext();

  if (subtasksLength === 0) return null;

  const isBeingDragged =
    taskId === currentlyClickedItem?.taskId && displayDragBox;

  const indentClass = parentId
    ? `${nested} ${isBeingDragged ? nestedDragged : itemIsFocused ? nestedFocused : ""}`
    : "";

  return (
    <div
      className={indentClass}
      style={{
        height: subtasksMinimized ? 0 : "auto",
        transition: `height ${DURATIONS.collapse}s ease`,
      }}
    >
      {children}
    </div>
  );
};

export default TaskListWrapper;
