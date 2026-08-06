"use client";

import { useCallback } from "react";
import { AppDispatch } from "@/redux/store";

import {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import { updateAllCalendarStates } from "@/redux/thunks/calendarThunks";

export type CalendarUpdateOptions = {
  engineMode?: "inline" | "worker";
  /**
   * Undo-history label for updateAll callers that pass source arrays
   * (assistant save, onboarding commits). The four domain setters take the
   * label as a required parameter instead.
   */
  label?: string;
};

// The label parameter is deliberately REQUIRED on the domain setters: every
// edit surface names its own change ("the code tells us at the UX location"),
// and the compiler finds any new call site that forgets. Labels surface as
// `Undid/Redid "<label>"` toasts — build them from utils/historyMessages.
export default function useCalendarStateActions(dispatch: AppDispatch) {
  const updatePlannerArray = useCallback(
    (
      planner: Planner[] | ((prev: Planner[]) => Planner[]),
      label: string,
      options?: CalendarUpdateOptions,
    ) => {
      dispatch(
        updateAllCalendarStates({
          planner,
          label,
          engineMode: options?.engineMode,
        }),
      );
    },
    [],
  );

  const updateTemplateArray = useCallback(
    (
      template: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
      label: string,
      options?: CalendarUpdateOptions,
    ) => {
      dispatch(
        updateAllCalendarStates({
          template,
          label,
          engineMode: options?.engineMode,
        }),
      );
    },
    [],
  );

  const updateQueueArray = useCallback(
    (
      queues: Queue[] | ((prev: Queue[]) => Queue[]),
      label: string,
      options?: CalendarUpdateOptions,
    ) => {
      dispatch(
        updateAllCalendarStates({
          queues,
          label,
          engineMode: options?.engineMode,
        }),
      );
    },
    [],
  );

  const updateDependencyArray = useCallback(
    (
      dependencies:
        | PlannerDependency[]
        | ((prev: PlannerDependency[]) => PlannerDependency[]),
      label: string,
      options?: CalendarUpdateOptions,
    ) => {
      dispatch(
        updateAllCalendarStates({
          dependencies,
          label,
          engineMode: options?.engineMode,
        }),
      );
    },
    [],
  );

  const updateAll = useCallback(
    (
      planner?: Planner[] | ((prev: Planner[]) => Planner[]),
      calendar?: SimpleEvent[] | ((prev: SimpleEvent[]) => SimpleEvent[]),
      template?: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
      categories?: Category[] | ((prev: Category[]) => Category[]),
      queues?: Queue[] | ((prev: Queue[]) => Queue[]),
      dependencies?:
        | PlannerDependency[]
        | ((prev: PlannerDependency[]) => PlannerDependency[]),
      options?: CalendarUpdateOptions,
    ) => {
      dispatch(
        updateAllCalendarStates({
          planner,
          calendar,
          template,
          categories,
          queues,
          dependencies,
          label: options?.label,
          engineMode: options?.engineMode,
        }),
      );
    },
    [],
  );

  return {
    updatePlannerArray,
    updateTemplateArray,
    updateQueueArray,
    updateDependencyArray,
    updateAll,
  };
}
