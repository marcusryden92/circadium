"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import schedulingSettingsSlice from "@/redux/slices/schedulingSettingsSlice";
import { hydrateSource } from "@/redux/slices/calendarSourceSlice";
import { hydrateEngineOutput } from "@/redux/slices/engineOutputSlice";
import { markSaved } from "@/redux/slices/syncStatusSlice";
import {
  createSyncLoop,
  type SyncLoop,
  type SyncSnapshot,
} from "@circadium/shared/sync/syncLoop";
import { syncCalendarData } from "@/actions/calendar-actions/syncCalendarData";
import type { FreshState } from "@/actions/calendar-actions/fetchFreshState";

const useCalendarServerSync = (
  userId: string | undefined,
  calendarState: SyncSnapshot,
  // Hard off-switch for snapshot impersonation: Redux holds ANOTHER user's
  // data, so a diff against the admin's own refs must never reach the server.
  // Belt and braces — inspection also never calls initializeState, so
  // isInitialized stays false — but the invariant deserves to be explicit.
  disabled = false,
) => {
  // Previous state refs to track what the server has
  const previousPlanner = useRef<Planner[]>([]);
  const previousCalendar = useRef<SimpleEvent[]>([]);
  const previousTemplate = useRef<EventTemplate[]>([]);
  const previousCategories = useRef<Category[]>([]);
  const previousCategoryEvents = useRef<CategoryEvent[]>([]);
  const previousTravelEvents = useRef<TravelEvent[]>([]);
  const previousEngineMessages = useRef<EngineMessage[]>([]);
  const previousQueues = useRef<Queue[]>([]);
  const previousDependencies = useRef<PlannerDependency[]>([]);
  const previousLocations = useRef<SerializedLocation[]>([]);
  const previousTravelTimes = useRef<SerializedTravelTime[]>([]);
  // OCC token. Every successful sync bumps the server-side User.dataVersion
  // by 1; we send the version we think is current and the server rejects the
  // sync if it has moved on. Seeded by initializeState from fetchCalendarData.
  const knownDataVersion = useRef<number>(0);

  const [isInitialized, setIsInitialized] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

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
    locations,
    travelTimes,
  } = calendarState;

  const initializeState = useCallback(
    (
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
    ) => {
      previousPlanner.current = planner;
      previousCalendar.current = calendar;
      previousTemplate.current = template;
      previousCategories.current = categories;
      previousCategoryEvents.current = categoryEvents;
      previousTravelEvents.current = travelEvents;
      previousEngineMessages.current = engineMessages;
      previousQueues.current = queues;
      previousDependencies.current = dependencies;
      // Locations are loaded asynchronously by UserProvider, which may race
      // with the calendar fetch. We seed previousLocations from the current
      // value; the diff's create-branch is a no-op for locations (Google
      // Places lookup must happen server-side via a direct action), so a
      // late-arriving setLocations(loaded) will be absorbed without sending
      // spurious create operations on the next sync pass.
      previousLocations.current = locationsAtInitRef.current;
      previousTravelTimes.current = travelTimesAtInitRef.current;
      knownDataVersion.current = dataVersion;
      setIsInitialized(true);
    },
    [],
  );

  // Mirrors locations + travel times into refs so initializeState can read the
  // latest values at the moment of init without taking them as parameters
  // (which would re-trigger useFetchCalendarData on every change).
  const locationsAtInitRef = useRef<SerializedLocation[]>(locations);
  locationsAtInitRef.current = locations;
  const travelTimesAtInitRef = useRef<SerializedTravelTime[]>(travelTimes);
  travelTimesAtInitRef.current = travelTimes;

  // Direct server actions that bypass the diff (createLocation needs Google
  // Places; refreshAllTravelTimes / fetchMissingTravelTimes need Google
  // distance) should call this after their dispatch so the next sync pass
  // doesn't see them as missing-on-server.
  const markSynced = useCallback(
    (
      kind: "categories" | "locations" | "travelTimes",
      current: Category[] | SerializedLocation[] | SerializedTravelTime[],
    ) => {
      if (kind === "categories") {
        previousCategories.current = current as Category[];
      } else if (kind === "locations") {
        previousLocations.current = current as SerializedLocation[];
      } else {
        previousTravelTimes.current = current as SerializedTravelTime[];
      }
    },
    [],
  );

  // Snap Redux back to the last server-confirmed state stored in the refs.
  // Called when a sync transaction fails so the client doesn't keep diverging
  // optimistically from the DB. Without this, the same failing diff would
  // re-fire indefinitely against stale refs.
  const rollbackToLastConfirmedState = useCallback(() => {
    dispatch(
      hydrateSource({
        planner: previousPlanner.current,
        template: previousTemplate.current,
        categories: previousCategories.current,
        queues: previousQueues.current,
        dependencies: previousDependencies.current,
      }),
    );
    dispatch(
      hydrateEngineOutput({
        calendar: previousCalendar.current,
        categoryEvents: previousCategoryEvents.current,
        travelEvents: previousTravelEvents.current,
        engineMessages: previousEngineMessages.current,
      }),
    );
    dispatch(
      schedulingSettingsSlice.actions.setLocations(previousLocations.current),
    );
    dispatch(
      schedulingSettingsSlice.actions.setAllTravelTimes(
        previousTravelTimes.current,
      ),
    );
  }, [dispatch]);

  // Replace Redux + every ref with the server's fresh snapshot. Used when the
  // sync is rejected as stale (OCC mismatch) — the client's in-flight edit is
  // discarded because applying it on top of a divergent DAG would corrupt
  // state. Refs advance to the new dataVersion so the next sync starts clean.
  const adoptFreshServerState = useCallback(
    (fresh: FreshState) => {
      previousPlanner.current = fresh.planner;
      previousCalendar.current = fresh.calendar;
      previousTemplate.current = fresh.template;
      previousCategories.current = fresh.categories;
      previousCategoryEvents.current = fresh.categoryEvents;
      previousTravelEvents.current = fresh.travelEvents;
      previousEngineMessages.current = fresh.engineMessages;
      previousQueues.current = fresh.queues;
      previousDependencies.current = fresh.dependencies;
      previousLocations.current = fresh.locations;
      previousTravelTimes.current = fresh.travelTimes;
      knownDataVersion.current = fresh.dataVersion;

      dispatch(
        hydrateSource({
          planner: fresh.planner,
          template: fresh.template,
          categories: fresh.categories,
          queues: fresh.queues,
          dependencies: fresh.dependencies,
        }),
      );
      dispatch(
        hydrateEngineOutput({
          calendar: fresh.calendar,
          categoryEvents: fresh.categoryEvents,
          travelEvents: fresh.travelEvents,
          engineMessages: fresh.engineMessages,
        }),
      );
      dispatch(schedulingSettingsSlice.actions.setLocations(fresh.locations));
      dispatch(
        schedulingSettingsSlice.actions.setAllTravelTimes(fresh.travelTimes),
      );
    },
    [dispatch],
  );

  // Latest state mirrored into a ref so a queued re-sync reads fresh values
  // instead of the (possibly stale) closure the timer was created with.
  const latestStateRef = useRef(calendarState);
  latestStateRef.current = calendarState;

  // Live disabled flag for the loop, which is created once and would otherwise
  // close over the first render's value.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // The host-agnostic sync loop (serialization guard, stale/error branches,
  // transport retry) lives in @circadium/shared; this hook wires it to the
  // refs + Redux dispatch and injects the web transport. Created once so its
  // in-flight/retry state persists across renders. The transport is the single
  // seam the Java migration (item 1.13) swaps.
  const loopRef = useRef<SyncLoop | null>(null);
  if (!loopRef.current) {
    loopRef.current = createSyncLoop({
      transport: (changes, clientKnownDataVersion) =>
        syncCalendarData(changes, clientKnownDataVersion),
      getSnapshot: () => latestStateRef.current,
      getBaseline: () => ({
        planner: previousPlanner.current,
        calendar: previousCalendar.current,
        template: previousTemplate.current,
        categories: previousCategories.current,
        categoryEvents: previousCategoryEvents.current,
        travelEvents: previousTravelEvents.current,
        engineMessages: previousEngineMessages.current,
        queues: previousQueues.current,
        dependencies: previousDependencies.current,
        locations: previousLocations.current,
        travelTimes: previousTravelTimes.current,
      }),
      getDataVersion: () => knownDataVersion.current,
      isDisabled: () => disabledRef.current,
      onSuccess: (sent, newDataVersion) => {
        previousPlanner.current = sent.planner;
        previousCalendar.current = sent.calendar;
        previousTemplate.current = sent.template;
        previousCategories.current = sent.categories;
        previousCategoryEvents.current = sent.categoryEvents;
        previousTravelEvents.current = sent.travelEvents;
        previousEngineMessages.current = sent.engineMessages;
        previousQueues.current = sent.queues;
        previousDependencies.current = sent.dependencies;
        previousLocations.current = sent.locations;
        previousTravelTimes.current = sent.travelTimes;
        knownDataVersion.current = newDataVersion;
        dispatch(markSaved());
      },
      onStale: (fresh) => adoptFreshServerState(fresh),
      onError: () => rollbackToLastConfirmedState(),
    });
  }

  const hasLocalPendingChanges = useCallback(
    (s: SyncSnapshot) =>
      !(
        JSON.stringify(previousPlanner.current) === JSON.stringify(s.planner) &&
        JSON.stringify(previousCalendar.current) ===
          JSON.stringify(s.calendar) &&
        JSON.stringify(previousTemplate.current) ===
          JSON.stringify(s.template) &&
        JSON.stringify(previousCategories.current) ===
          JSON.stringify(s.categories) &&
        JSON.stringify(previousCategoryEvents.current) ===
          JSON.stringify(s.categoryEvents) &&
        JSON.stringify(previousTravelEvents.current) ===
          JSON.stringify(s.travelEvents) &&
        JSON.stringify(previousEngineMessages.current) ===
          JSON.stringify(s.engineMessages) &&
        JSON.stringify(previousQueues.current) === JSON.stringify(s.queues) &&
        JSON.stringify(previousDependencies.current) ===
          JSON.stringify(s.dependencies) &&
        JSON.stringify(previousLocations.current) ===
          JSON.stringify(s.locations) &&
        JSON.stringify(previousTravelTimes.current) ===
          JSON.stringify(s.travelTimes)
      ),
    [],
  );

  useEffect(() => {
    if (disabled || !isInitialized || !userId) return;
    if (!hasLocalPendingChanges(latestStateRef.current)) return;

    const timeout = setTimeout(() => void loopRef.current?.runSync(), 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    planner,
    calendar,
    template,
    categories,
    categoryEvents,
    travelEvents,
    engineMessages,
    queues,
    dependencies,
    locations,
    travelTimes,
    isInitialized,
    userId,
    disabled,
    hasLocalPendingChanges,
  ]);

  useEffect(() => () => loopRef.current?.dispose(), []);

  return { initializeState, markSynced };
};

export default useCalendarServerSync;
