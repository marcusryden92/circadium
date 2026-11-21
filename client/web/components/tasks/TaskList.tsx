"use client";

import React, { useState, useEffect } from "react";
import { useCalendarProvider } from "@/context/CalendarProvider";
import TaskItem from "./TaskItem";
import TaskDivider from "@/components/draggable/TaskDivider";
import { TaskListProps } from "@/lib/taskItem";
import { getTaskById } from "@/utils/taskArrayUtils";
import { getSubtasksById } from "@/utils/goalPageHandlers";
import { sortSiblings } from "@/utils/goal-handlers/sortOrderKeys";
import { Planner } from "@/types/prisma";
import { sublist } from "./lumenTasks.css";

const TaskList: React.FC<TaskListProps> = React.memo(({ id, subtasks }) => {
  const { planner, updatePlannerArray } = useCalendarProvider();

  const [sortedTasks, setSortedTasks] = useState<Planner[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const subtasksToUse = subtasks || getSubtasksById(planner, id);
    if (!subtasksToUse.length) {
      setSortedTasks([]);
      setLoading(false);
      return;
    }

    const thisTask = getTaskById(planner, id);
    if (!thisTask) {
      setLoading(false);
      return;
    }

    setSortedTasks(sortSiblings(subtasksToUse));
    setLoading(false);
  }, [id, subtasks, planner]);

  if (loading) return null;

  return (
    <div className={sublist}>
      {sortedTasks.length > 0 && (
        <>
          {sortedTasks.map((task) => (
            <div key={task.id}>
              <TaskDivider
                planner={planner}
                updatePlannerArray={updatePlannerArray}
                targetId={task.id}
                mouseLocationInItem="top"
              />
              <TaskItem planner={planner} task={task} />
            </div>
          ))}

          <TaskDivider
            planner={planner}
            updatePlannerArray={updatePlannerArray}
            targetId={sortedTasks[sortedTasks.length - 1].id}
            mouseLocationInItem="bottom"
          />
        </>
      )}
    </div>
  );
});

TaskList.displayName = "TaskList";

export default TaskList;
