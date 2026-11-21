"use client";

import React from "react";
import { rootList } from "@/components/tasks/lumenTasks.css";

const RootTaskListWrapper = ({
  subtasksLength,
  children,
}: {
  subtasksLength: number;
  children: React.ReactNode;
}) => {
  if (subtasksLength === 0) return null;
  return <div className={rootList}>{children}</div>;
};

export default RootTaskListWrapper;
