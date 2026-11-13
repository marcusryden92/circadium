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
import { handleServerTransaction } from "@/utils/server-handlers/compareCalendarData";
import type { FreshState } from "@/actions/calendar-actions/fetchFreshState";

// Backoff schedule for transport-level sync failures (request never reached
// the server, or the response was lost). Server-side rejections don't retry.
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

const useCalendarServerSync = (
  userId: string | undefined,
  calendarState: {
    planner: Planner[];
    calendar: SimpleEvent[];
    template: EventTemplate[];
    categories: Category[];
    categoryEvents: CategoryEvent[];
    travelEvents: TravelEvent[];
    engineMessages: EngineMessage[];
    queues: Queue[];
    dependencies: PlannerDependency[];
    locations: SerializedLocation[];
    travelTimes: SerializedTravelTime[];
  },
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

  // Serialization guard. The 300ms debounce only cancels unfired timers; once
  // a sync is in flight, a second one dispatched in parallel would read the
  // pre-bump dataVersion, get rejected as stale, and wholesale-adopt a server
  // snapshot that lacks the newer edit — silent data loss with no actual
  // concurrency. All syncs funnel through runSync, which loops until quiet.
  const syncInFlightRef = useRef(false);
  const resyncQueuedRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPendingChanges = useCallback(
    (s: typeof calendarState) =>
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

  const runSync = useCallback(async () => {
    if (disabled) return;
    if (syncInFlightRef.current) {
      resyncQueuedRef.current = true;
      return;
    }
    syncInFlightRef.current = true;

    try {
      do {
        resyncQueuedRef.current = false;
        const snapshot = latestStateRef.current;
        if (!hasPendingChanges(snapshot)) break;

        try {
          const response = await handleServerTransaction(
            knownDataVersion.current,
            {
              planner: {
                current: snapshot.planner,
                previous: previousPlanner.current,
              },
              calendar: {
                current: snapshot.calendar,
                previous: previousCalendar.current,
              },
              template: {
                current: snapshot.template,
                previous: previousTemplate.current,
              },
              categories: {
                current: snapshot.categories,
                previous: previousCategories.current,
              },
              categoryEvents: {
                current: snapshot.categoryEvents,
                previous: previousCategoryEvents.current,
              },
              travelEvents: {
                current: snapshot.travelEvents,
                previous: previousTravelEvents.current,
              },
              engineMessages: {
                current: snapshot.engineMessages,
                previous: previousEngineMessages.current,
              },
              queues: {
                current: snapshot.queues,
                previous: previousQueues.current,
              },
              dependencies: {
                current: snapshot.dependencies,
                previous: previousDependencies.current,
              },
              locations: {
                current: snapshot.locations,
                previous: previousLocations.current,
              },
              travelTimes: {
                current: snapshot.travelTimes,
                previous: previousTravelTimes.current,
              },
            },
          );
          retryAttemptRef.current = 0;

          if (response.success) {
            // Advance refs to the snapshot that was actually sent — edits made
            // during the request stay diffable and trigger the next loop pass.
            previousPlanner.current = snapshot.planner;
            previousCalendar.current = snapshot.calendar;
            previousTemplate.current = snapshot.template;
            previousCategories.current = snapshot.categories;
            previousCategoryEvents.current = snapshot.categoryEvents;
            previousTravelEvents.current = snapshot.travelEvents;
            previousEngineMessages.current = snapshot.engineMessages;
            previousQueues.current = snapshot.queues;
            previousDependencies.current = snapshot.dependencies;
            previousLocations.current = snapshot.locations;
            previousTravelTimes.current = snapshot.travelTimes;
            knownDataVersion.current = response.newDataVersion;
            dispatch(markSaved());
          } else if (response.reason === "stale") {
            // Server rejected this sync because another writer moved the
            // dataVersion forward. Discard the in-flight edit and adopt the
            // server's current snapshot wholesale — partial application across
            // a DAG-shaped dataset can't be done safely.
            console.warn("Sync rejected as stale; adopting fresh server state");
            adoptFreshServerState(response.freshState);
          } else {
            // The server received the diff and rejected it — replaying the
            // same diff would fail the same way, so snap back to the last
            // confirmed state rather than diverging further.
            console.warn("Server sync response not successful:", response);
            rollbackToLastConfirmedState();
          }
        } catch (error) {
          // Transport-level failure: the request may never have reached the
          // server. Rolling back would destroy real edits over a network blip
          // — keep local state and retry with backoff instead. If retries run
          // out, edits stay pending and the next state change re-triggers.
          const attempt = retryAttemptRef.current;
          if (attempt < RETRY_DELAYS_MS.length) {
            retryAttemptRef.current = attempt + 1;
            console.warn(
              `Sync transport error; retrying (${attempt + 1}/${RETRY_DELAYS_MS.length})`,
              error,
            );
            retryTimerRef.current = setTimeout(
              () => void runSync(),
              RETRY_DELAYS_MS[attempt],
            );
          } else {
            retryAttemptRef.current = 0;
            console.error(
              "Sync failed after retries; local edits stay pending",
              error,
            );
          }
          return;
        }
      } while (resyncQueuedRef.current);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [
    disabled,
    hasPendingChanges,
    adoptFreshServerState,
    rollbackToLastConfirmedState,
    dispatch,
  ]);

  useEffect(() => {
    if (disabled || !isInitialized || !userId) return;
    if (!hasPendingChanges(latestStateRef.current)) return;

    const timeout = setTimeout(() => void runSync(), 300);

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
    runSync,
    hasPendingChanges,
  ]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  return { initializeState, markSynced };
};

export default useCalendarServerSync;
