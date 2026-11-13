"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { Planner, Category } from "@/types/prisma";
import type { PlannerType } from "@/generated/client";

export interface ItemContextValue {
  item: Planner;
  category: Category | null;
  categories: Category[];
  subtasks: Planner[];
  totalDuration: number;
  completedDuration: number;
  totalSubtasks: number;
  completedSubtasks: number;
  pct: number;
  locationOverrideEnabled: boolean;
  categoryHasLocation: boolean;

  // Mutations (all sync from caller perspective; the hook handles async DB calls inside)
  saveTitle: (newTitle: string) => void;
  updateField: (field: keyof Planner, value: unknown) => void;
  changeColor: (color: string) => void;
  setPlannerType: (type: PlannerType) => void;
  changeCategory: (categoryId: string | null) => void;
  changeLocation: (locationId: string | null) => void;
  toggleLocationOverride: () => void;
  changeDate: (date: Date | undefined) => void;
  toggleReady: () => void;
  requestDelete: () => void;
  requestResetSubgoalLocations: () => void;
}

const Ctx = createContext<ItemContextValue | null>(null);

export function ItemProvider({
  value,
  children,
}: {
  value: ItemContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useItem(): ItemContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useItem must be used inside ItemProvider");
  return v;
}
