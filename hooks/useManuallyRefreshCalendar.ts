"use client";

import { useCallback, useRef } from "react";
import { floorMinutes } from "@/utils/calendarUtils";
import { WeekDayIntegers } from "@/types/calendarTypes";

import { runEngineCalculation } from "@/utils/calendar-generation/engineWorkerClient";
import { taskIsCompleted } from "@/utils/taskHelpers";

import {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  EngineMessage,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import { AppDispatch, RootState } from "@/redux/store";
import { applyEngineRun } from "@/redux/slices/engineOutputSlice";
import { useSelector } from "react-redux";
import {
  travelTimeArrayToMap,
  deriveTravelTimeMatrix,
  type SerializedTravelTimeEntry,
  type DebugStrategyConfig,
} from "@/redux/slices/schedulingSettingsSlice";
import { deriveExternalBusyEvents } from "@/utils/external-calendar/deriveExternalBusyEvents";
import { deriveOccurrenceCompletions } from "@/utils/deriveOccurrenceCompletions";
import type { OccurrenceCompletionInput } from "@/utils/calendar-generation/models/SchedulingModels";

const useManuallyRefreshCalendar = (
  userId: string | undefined,
  calendarState: {
    planner: Planner[];
    calendar: SimpleEvent[];
    template: EventTemplate[];
    categories: Category[];
  },
  weekStartDay: WeekDayIntegers,
  dispatch: AppDispatch
) => {
  const { planner, calendar, template, categories } = calendarState;
  const bufferTimeMinutes = useSelector(
    (state: RootState) => state.schedulingSettings.bufferTimeMinutes
  );
  const enableTravelEvents = useSelector(
    (state: RootState) => state.schedulingSettings.enableTravelEvents
  );
  const allTravelTimes = useSelector(
    (state: RootState) => state.schedulingSettings.allTravelTimes
  );
  const defaultTransportMode = useSelector(
    (state: RootState) => state.schedulingSettings.defaultTransportMode
  );
  // Derived fresh from the source-of-truth rows so travel-time and transport-
  // mode changes take effect on the next regen without a page reload.
  const travelTimeMatrix = deriveTravelTimeMatrix(
    allTravelTimes,
    defaultTransportMode
  );
  const debugStrategyConfig = useSelector(
    (state: RootState) => state.schedulingSettings.debugStrategyConfig
  );
  const previousEngineMessages = useSelector(
    (state: RootState) => state.engineOutput.engineMessages
  );
  const queues = useSelector(
    (state: RootState) => state.calendarSource.queues
  );
  const dependencies = useSelector(
    (state: RootState) => state.calendarSource.dependencies
  );
  const externalSources = useSelector(
    (state: RootState) => state.externalCalendar.sources
  );
  const externalEvents = useSelector(
    (state: RootState) => state.externalCalendar.events
  );
  const occurrenceCompletionRows = useSelector(
    (state: RootState) => state.occurrenceCompletions.rows
  );

  // Store latest values in refs so callback doesn't need to depend on them
  const stateRef = useRef<{
    userId: string | undefined;
    planner: Planner[];
    calendar: SimpleEvent[];
    template: EventTemplate[];
    categories: Category[];
    queues: Queue[];
    dependencies: PlannerDependency[];
    externalBusyEvents: SimpleEvent[];
    occurrenceCompletions: OccurrenceCompletionInput[];
    weekStartDay: WeekDayIntegers;
    bufferTimeMinutes: number;
    enableTravelEvents: boolean;
    travelTimeMatrix: SerializedTravelTimeEntry[] | null;
    debugStrategyConfig: DebugStrategyConfig;
    previousEngineMessages: EngineMessage[];
    dispatch: AppDispatch;
  }>({
    userId,
    planner,
    calendar,
    template,
    categories,
    queues,
    dependencies,
    externalBusyEvents: deriveExternalBusyEvents(
      externalSources,
      externalEvents,
    ),
    occurrenceCompletions: deriveOccurrenceCompletions(occurrenceCompletionRows),
    weekStartDay,
    bufferTimeMinutes,
    enableTravelEvents,
    travelTimeMatrix,
    debugStrategyConfig,
    previousEngineMessages,
    dispatch,
  });
  stateRef.current = {
    userId,
    planner,
    calendar,
    template,
    categories,
    queues,
    dependencies,
    externalBusyEvents: deriveExternalBusyEvents(
      externalSources,
      externalEvents,
    ),
    occurrenceCompletions: deriveOccurrenceCompletions(occurrenceCompletionRows),
    weekStartDay,
    bufferTimeMinutes,
    enableTravelEvents,
    travelTimeMatrix,
    debugStrategyConfig,
    previousEngineMessages,
    dispatch,
  };

  const manuallyRefreshCalendar = useCallback(() => {
    const {
      userId,
      planner,
      calendar,
      template,
      categories,
      queues,
      dependencies,
      externalBusyEvents,
      occurrenceCompletions,
      weekStartDay,
      bufferTimeMinutes,
      enableTravelEvents,
      travelTimeMatrix,
      debugStrategyConfig,
      previousEngineMessages,
      dispatch,
    } = stateRef.current;

    if (!userId) throw new Error("Id missing in manuallyRefreshCalendar");

    const now = floorMinutes(new Date());
    if (template && planner && calendar) {
      const overdueIds = new Set<string>(
        planner.filter((e) => !taskIsCompleted(e)).map((e) => e.id)
      );

      const filteredCalendar: SimpleEvent[] =
        calendar?.filter(
          (e: SimpleEvent) =>
            !overdueIds.has(e.id) && floorMinutes(new Date(e.start)) < now
        ) || [];

      // Convert serialized array to Map for calendar generation
      const travelTimeMap = travelTimeArrayToMap(travelTimeMatrix);

      void runEngineCalculation({
        userId,
        weekStartDay,
        template,
        planner,
        prevCalendar: filteredCalendar,
        options: {
          bufferTimeMinutes,
          travelTimeMatrix: travelTimeMap ?? undefined,
          injectTravelEvents: enableTravelEvents,
          strategyWeights: debugStrategyConfig.weights,
          locationGroupingScores: debugStrategyConfig.locationGrouping.scores,
          locationGroupingPenalties:
            debugStrategyConfig.locationGrouping.penalties,
          categories,
          queues,
          dependencies,
          externalBusyEvents,
          occurrenceCompletions,
          previousEngineMessages,
        },
      }).then((result) => {
        // Null means a newer regen superseded this one mid-flight.
        if (!result) return;
        // Source inputs (planner/template/categories) pass through unchanged,
        // so only the derived slice needs a dispatch.
        dispatch(
          applyEngineRun({
            calendar: result.events,
            categoryEvents: result.categoryEvents,
            travelEvents: result.travelEvents,
            engineMessages: result.messages,
            plannerScores: result.plannerScores,
            ranAt: new Date().toISOString(),
          }),
        );
      });
    }
  }, []);

  return manuallyRefreshCalendar;
};

export default useManuallyRefreshCalendar;
