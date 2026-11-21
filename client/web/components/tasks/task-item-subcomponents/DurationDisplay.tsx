"use client";

import { useEffect, useState } from "react";
import { formatMinutesToHours } from "@/utils/taskArrayUtils";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { totalSubtaskDuration } from "@/utils/taskArrayUtils";

import { DurationDisplayProps } from "@/lib/taskItem";
import {
  durationText,
  durationTextFocused,
} from "@/components/tasks/lumenTasks.css";

const DurationDisplay: React.FC<DurationDisplayProps> = ({
  task,
  itemIsFocused,
  subtasksLength,
}) => {
  const { planner } = useCalendarProvider();
  const [totalTaskDuration, setTotalTaskDuration] = useState(
    totalSubtaskDuration(task.id, planner),
  );

  useEffect(() => {
    setTotalTaskDuration(totalSubtaskDuration(task.id, planner));
  }, [planner, task.id]);

  return (
    <span
      className={`${durationText} ${itemIsFocused ? durationTextFocused : ""}`}
    >
      {formatMinutesToHours(
        subtasksLength === 0 ? task.duration || 0 : totalTaskDuration,
      )}
    </span>
  );
};

export default DurationDisplay;
