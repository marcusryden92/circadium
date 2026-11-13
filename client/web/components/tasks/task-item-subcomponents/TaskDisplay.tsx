"use client";

import { TaskDisplayProps } from "@/lib/taskItem";
import {
  taskTitle,
  taskTitleFocused,
  taskTitleCompleted,
} from "@/components/tasks/lumenTasks.css";

export const TaskDisplay: React.FC<TaskDisplayProps> = ({
  task,
  itemIsFocused,
}) => {
  const completed = !!task.completedEndTime;
  return (
    <span
      className={`${taskTitle} ${itemIsFocused ? taskTitleFocused : ""} ${
        completed ? taskTitleCompleted : ""
      }`}
    >
      {task.title}
    </span>
  );
};

export default TaskDisplay;
