"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import {
  hydrateSource,
  markCalendarLoaded,
} from "@/redux/slices/calendarSourceSlice";
import { hydrateEngineOutput } from "@/redux/slices/engineOutputSlice";
import {
  Planner,
  Category,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import { SimpleEvent } from "@/types/prisma";
import { EventTemplate } from "@/types/prisma";
import { fetchCalendarData } from "@/actions/calendar-actions/fetchCalendarData";
import { retry } from "@/lib/retry";

interface Data {
  planner: Planner[];
  calendar: SimpleEvent[];
  template: EventTemplate[];
  categories: Category[];
  categoryEvents: CategoryEvent[];
  travelEvents: TravelEvent[];
  engineMessages: EngineMessage[];
  queues: Queue[];
  dependencies: PlannerDependency[];
}

export function useFetchCalendarData(
  userId: string | undefined,
  initializeState: (
    planner: Planner[],
    calendar: SimpleEvent[],
    template: EventTemplate[],
    categories: Category[],
    categoryEvents: CategoryEvent[],
    travelEvents: TravelEvent[],
    engineMessages: EngineMessage[],
    queues: Queue[],
    dependencies: PlannerDependency[],
    dataVersion: number,
  ) => void,
) {
  const dispatch = useDispatch<AppDispatch>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) return;

      setLoading(true);
      setError(null);

      try {
        // Retry through a cold-start window: a failed first call would
        // otherwise leave isLoaded false and strand the app on the loading
        // screen until a manual refresh.
        const response = await retry(async () => {
          const result = await fetchCalendarData();
          if (!result.success) {
            throw new Error(result.error);
          }
          return result;
        });

        const {
          planner,
          calendar,
          template,
          categories,
          categoryEvents,
          travelEvents,
          engineMessages,
          queues,
          dependencies,
          dataVersion,
        } = response.data;
        const newData = {
          planner,
          calendar,
          template,
          categories,
          categoryEvents,
          travelEvents,
          engineMessages,
          queues,
          dependencies,
        };

        setData(newData);

        // Dispatch to Redux
        dispatch(
          hydrateSource({
            planner: newData.planner,
            template: newData.template,
            categories: newData.categories,
            queues: newData.queues,
            dependencies: newData.dependencies,
          }),
        );
        dispatch(
          hydrateEngineOutput({
            calendar: newData.calendar,
            categoryEvents: newData.categoryEvents,
            travelEvents: newData.travelEvents,
            engineMessages: newData.engineMessages,
          }),
        );
        dispatch(markCalendarLoaded());
        initializeState(
          newData.planner,
          newData.calendar,
          newData.template,
          newData.categories,
          newData.categoryEvents,
          newData.travelEvents,
          newData.engineMessages,
          newData.queues,
          newData.dependencies,
          dataVersion,
        );
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, dispatch, initializeState]);

  return { data, loading, error };
}
