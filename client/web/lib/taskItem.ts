import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Planner } from "@/types/prisma";

export interface TaskListProps {
  id: string;
  subtasks?: Planner[];
}

export interface TaskListWrapperProps {
  taskId: string;
  subtasksLength: number;
  parentId?: string;
  subtasksMinimized: boolean;
  itemIsFocused: boolean;
  children?: ReactNode;
}

export interface TaskItemProps {
  planner: Planner[];
  task: Planner;
}

export interface TaskHeaderProps {
  task: Planner;
  subtasks: Planner[]; // Array of subtasks of type Planner
  itemIsFocused: boolean; // Boolean indicating if the item is focused
  setItemIsFocused: Dispatch<SetStateAction<boolean>>;
  focusedTask: string | null;
  setFocusedTask: Dispatch<SetStateAction<string | null>>;
  devMode: boolean; // Boolean indicating if dev mode is active
}

export interface TaskDisplayProps {
  task: Planner;
  itemIsFocused: boolean;
}

export interface AddSubtaskProps {
  task: Planner;
  parentId?: string;
  isMainParent?: boolean;
  subtasksLength?: number;
}

export interface DurationDisplayProps {
  task: Planner;
  itemIsFocused: boolean;
  subtasksLength: number;
}

export type ClickedItem = { taskId: string; taskTitle: string } | null;
