"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { RootState } from "@/redux/store";
import {
  formatLongDate,
  greetingForHour,
} from "@/utils/timeFormatting";
import { buildTodayAgenda } from "../_data/buildTodayAgenda";
import { buildUncompletedItems } from "../_data/buildUncompletedItems";
import { buildPriorityGoals } from "../_data/buildPriorityGoals";
import { groupAgenda } from "../_data/groupAgenda";
import {
  pruneAgendaForRollover,
  summarizeAgenda,
} from "../_data/agendaSummary";
import type {
  AgendaRow,
  DashboardGoal,
  DashboardSummary,
  UncompletedItem,
} from "../_data/types";
import { useTickingNow } from "./useTickingNow";

type DashboardData = {
  isLoaded: boolean;
  greetingText: string;
  dateText: string;
  summary: DashboardSummary;
  uncompleted: UncompletedItem[];
  agendaRows: AgendaRow[];
  goals: DashboardGoal[];
  openItem: (plannerId: string) => void;
  completeUncompleted: (item: UncompletedItem) => void;
  postponeUncompleted: (item: UncompletedItem) => void;
};

export function useDashboardData(): DashboardData {
  const router = useRouter();
  const sessionUser = useCurrentUser();

  const {
    isLoaded,
    planner,
    calendar,
    template,
    categories,
    travelEvents,
    locations,
    inheritedLocationMap,
    queueCategoryByRootId,
    updateAll,
  } = useCalendarProvider();

  const plannerScores = useSelector(
    (state: RootState) => state.engineOutput.plannerScores,
  );

  const now = useTickingNow();

  const rawAgenda = useMemo(
    () =>
      buildTodayAgenda({
        now,
        calendar,
        travelEvents,
        templates: template,
        planners: planner,
        categories,
        locations,
        inheritedLocationMap,
        queueCategoryByRootId,
      }),
    [
      now,
      calendar,
      travelEvents,
      template,
      planner,
      categories,
      locations,
      inheritedLocationMap,
      queueCategoryByRootId,
    ],
  );

  const uncompleted = useMemo(
    () =>
      buildUncompletedItems({
        now,
        planners: planner,
        categories,
        calendar,
        queueCategoryByRootId,
      }),
    [now, planner, categories, calendar, queueCategoryByRootId],
  );

  const agenda = useMemo(
    () => pruneAgendaForRollover(rawAgenda, now, uncompleted),
    [rawAgenda, now, uncompleted],
  );

  const summary = useMemo(() => summarizeAgenda(agenda), [agenda]);

  const goals = useMemo(
    () =>
      buildPriorityGoals({
        now,
        planners: planner,
        categories,
        calendar,
        plannerScores,
      }),
    [now, planner, categories, calendar, plannerScores],
  );

  const agendaRows = useMemo(() => groupAgenda(agenda), [agenda]);

  const greetingText = greetingForHour(now.getHours(), sessionUser?.name);
  const dateText = formatLongDate(now);

  const openItem = useCallback(
    (plannerId: string) => router.push(`/items/${plannerId}`),
    [router],
  );

  // Mirrors the past-window branch of getPlannerAndCalendarForCompletedTask
  // in utils/taskHelpers.ts: stamps the originally-scheduled window (the
  // uncompleted row is by definition past) and removes the calendar
  // instance so the next regen leaves the slot free.
  const completeUncompleted = useCallback(
    (item: UncompletedItem) => {
      const startIso = item.scheduledStart.toISOString();
      const endIso = item.scheduledEnd.toISOString();
      updateAll(
        (prev) =>
          prev.map((p) =>
            p.id === item.plannerId
              ? {
                  ...p,
                  completedStartTime: startIso,
                  completedEndTime: endIso,
                }
              : p,
          ),
        (prev) => prev.filter((e) => e.id !== item.eventId),
      );
    },
    [updateAll],
  );

  // Mirrors handlePostponeTask: strip the scheduled instance and let the
  // next regen reschedule. The planner row stays untouched.
  const postponeUncompleted = useCallback(
    (item: UncompletedItem) => {
      updateAll(
        (prev) => prev,
        (prev) => prev.filter((e) => e.id !== item.eventId),
      );
    },
    [updateAll],
  );

  return {
    isLoaded,
    greetingText,
    dateText,
    summary,
    uncompleted,
    agendaRows,
    goals,
    openItem,
    completeUncompleted,
    postponeUncompleted,
  };
}
