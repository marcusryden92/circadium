"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";

import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { RootState } from "@/redux/store";

import {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  CategoryEvent,
  TravelEvent,
  Queue,
  PlannerDependency,
  EngineMessage,
} from "@/types/prisma";
import { WeekDayIntegers } from "@/types/calendarTypes";
import { useFetchCalendarData } from "@/hooks/useFetchCalendarData";
import type { UserSettings } from "@/types/userTypes";

import useCalendarStateActions, {
  type CalendarUpdateOptions,
} from "@/hooks/useCalendarStateActions";
import {
  undoCalendarState,
  redoCalendarState,
} from "@/redux/thunks/calendarThunks";
import useManuallyRefreshCalendar from "@/hooks/useManuallyRefreshCalendar";
import useCalendarServerSync from "@/hooks/useCalendarServerSync";
import {
  setAllTravelTimes,
  type SerializedLocation,
  type SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import * as locationActions from "@/actions/locations";
import { serializeTravelTime } from "@/utils/locations";
import {
  buildInheritedLocationMap,
  InheritedLocationInfo,
} from "@/utils/goalPageHandlers";
import {
  buildQueueCategoryByRootId,
  buildQueueByPlannerId,
} from "@/utils/queue-handlers/queueLookups";
import {
  hydrateExternalCalendar,
  applyExternalRefresh,
  upsertExternalSource,
} from "@/redux/slices/externalCalendarSlice";
import {
  fetchExternalCalendarData,
  refreshExternalCalendarSource,
} from "@/actions/externalCalendars";
import { hydrateOccurrenceCompletions } from "@/redux/slices/occurrenceCompletionsSlice";
import { getOccurrenceCompletions } from "@/actions/occurrenceCompletions";
import { hydrateHabits } from "@/redux/slices/habitsSlice";
import { getHabitData } from "@/actions/habits";
import type {
  ExternalCalendarSource,
  ExternalEvent,
} from "@/types/prisma";

type CalendarContextType = {
  userId: string;
  userSettings: UserSettings;
  // True once the initial server snapshot has hydrated Redux. Consumers that
  // commit against prev-state (onboarding) must wait for this — an update
  // dispatched before hydration is wholesale-replaced when the fetch lands.
  isLoaded: boolean;
  weekStartDay: WeekDayIntegers;
  planner: Planner[];
  calendar: SimpleEvent[];
  template: EventTemplate[];
  categories: Category[];
  calendarEvents: SimpleEvent[];
  categoryEvents: CategoryEvent[];
  travelEvents: TravelEvent[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  locations: SerializedLocation[];
  engineMessages: EngineMessage[];
  externalSources: ExternalCalendarSource[];
  externalEvents: ExternalEvent[];
  updatePlannerArray: (
    planner: Planner[] | ((prev: Planner[]) => Planner[]),
    label: string,
    options?: CalendarUpdateOptions,
  ) => void;
  updateTemplateArray: (
    template: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
    label: string,
    options?: CalendarUpdateOptions,
  ) => void;
  updateQueueArray: (
    queues: Queue[] | ((prev: Queue[]) => Queue[]),
    label: string,
    options?: CalendarUpdateOptions,
  ) => void;
  updateDependencyArray: (
    dependencies:
      | PlannerDependency[]
      | ((prev: PlannerDependency[]) => PlannerDependency[]),
    label: string,
    options?: CalendarUpdateOptions,
  ) => void;
  updateAll: (
    planner?: Planner[] | ((prev: Planner[]) => Planner[]),
    calendar?: SimpleEvent[] | ((prev: SimpleEvent[]) => SimpleEvent[]),
    template?: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
    categories?: Category[] | ((prev: Category[]) => Category[]),
    queues?: Queue[] | ((prev: Queue[]) => Queue[]),
    dependencies?:
      | PlannerDependency[]
      | ((prev: PlannerDependency[]) => PlannerDependency[]),
    options?: CalendarUpdateOptions,
  ) => void;
  manuallyRefreshCalendar: () => void;
  // Undo/redo over the source arrays (planner/template/categories/queues/
  // dependencies). In-memory per session; restores run through the normal
  // update path, so the regen + diff sync persist them.
  undoCalendar: () => void;
  redoCalendar: () => void;
  canUndo: boolean;
  canRedo: boolean;
  inheritedLocationMap: Map<string, InheritedLocationInfo>;
  // Shared queue-lookup seam: every surface rendering queue membership or
  // effective category reads these, never a page-local build, so all views
  // agree with the engine's applyQueueCategoryInheritance.
  queueCategoryByRootId: Map<string, string>;
  queueByPlannerId: Map<string, Queue>;
  // Direct server actions that bypass the diff sync (Location create needs
  // Google Places, travel-time refresh needs Google distances) must call this
  // after dispatching their result to Redux, or the next sync pass treats the
  // new rows as missing-on-server and re-sends them as creates.
  markSynced: (
    kind: "categories" | "locations" | "travelTimes",
    current: Category[] | SerializedLocation[] | SerializedTravelTime[],
  ) => void;
};

const CalendarContext = createContext<CalendarContextType | null>(null);

// Static render config — module-level so the context value memo isn't
// invalidated by a fresh object literal every render.
const USER_SETTINGS: UserSettings = {
  styles: {
    events: {
      borderRadius: "0",
      completedColor: "#0ebf7e",
      errorColor: "#ef4444",
    },
    template: { event: { borderLeft: "4px solid black" } },
    calendar: { event: { borderLeft: "4px solid #ADD8E6" } },
    travel: { event: { borderLeft: "5px solid #70757F" } },
  },
};

export default function CalendarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.user.user);

  // Field-level subscriptions instead of whole-slice: a write to a field the
  // provider doesn't read (e.g. plannerScores after an engine run) no longer
  // re-renders the provider tree.
  const planner = useSelector(
    (state: RootState) => state.calendarSource.planner,
  );
  const template = useSelector(
    (state: RootState) => state.calendarSource.template,
  );
  const categories = useSelector(
    (state: RootState) => state.calendarSource.categories,
  );
  const queues = useSelector((state: RootState) => state.calendarSource.queues);
  const dependencies = useSelector(
    (state: RootState) => state.calendarSource.dependencies,
  );
  const isCalendarLoaded = useSelector(
    (state: RootState) => state.calendarSource.isLoaded,
  );
  // Lengths, not the stacks — the provider re-renders only when availability
  // flips or the stack depth changes, never on the snapshot contents.
  const canUndo = useSelector(
    (state: RootState) => state.calendarSource.past.length > 0,
  );
  const canRedo = useSelector(
    (state: RootState) => state.calendarSource.future.length > 0,
  );
  const calendar = useSelector(
    (state: RootState) => state.engineOutput.calendar,
  );
  const calendarEvents = useSelector(
    (state: RootState) => state.engineOutput.calendar,
  );

  const categoryEvents = useSelector(
    (state: RootState) => state.engineOutput.categoryEvents,
  );
  const travelEvents = useSelector(
    (state: RootState) => state.engineOutput.travelEvents,
  );
  const engineMessages = useSelector(
    (state: RootState) => state.engineOutput.engineMessages,
  );

  const userId = user?.id;

  const weekStartDay: WeekDayIntegers = useSelector(
    (state: RootState) => state.schedulingSettings.weekStartDay,
  );

  const {
    updatePlannerArray,
    updateTemplateArray,
    updateQueueArray,
    updateDependencyArray,
    updateAll,
  } = useCalendarStateActions(dispatch);

  const manuallyRefreshCalendar = useManuallyRefreshCalendar(
    userId,
    { planner, calendar, template, categories },
    weekStartDay,
    dispatch,
  );

  const bufferTimeMinutes = useSelector(
    (state: RootState) => state.schedulingSettings.bufferTimeMinutes,
  );
  const locations = useSelector(
    (state: RootState) => state.schedulingSettings.locations,
  );
  const travelTimes = useSelector(
    (state: RootState) => state.schedulingSettings.allTravelTimes,
  );
  const defaultTransportMode = useSelector(
    (state: RootState) => state.schedulingSettings.defaultTransportMode,
  );
  const enableTravelEvents = useSelector(
    (state: RootState) => state.schedulingSettings.enableTravelEvents,
  );
  const isInitialMount = useRef(true);
  // Ref (not a dep) so the settings-regen effect skips hydration-time firings —
  // regenerating against a not-yet-loaded planner paints an empty calendar.
  const isCalendarLoadedRef = useRef(isCalendarLoaded);
  isCalendarLoadedRef.current = isCalendarLoaded;

  const undoCalendar = useCallback(() => {
    void dispatch(undoCalendarState());
  }, [dispatch]);
  const redoCalendar = useCallback(() => {
    void dispatch(redoCalendarState());
  }, [dispatch]);

  // Mirrored into refs so the keydown listener reads fresh availability
  // without re-registering per stack change.
  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;

  // mod+Z / mod+shift+Z (+ ctrl+Y) — the SearchContext/AssistantContext
  // window-listener pattern. Skipped inside editable targets so native text
  // undo wins; preventDefault only when a step is actually available. The
  // onboarding overlay stops propagation of these in capture phase while
  // visible, so mid-onboarding undo can't fire.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        target &&
        (target.closest("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      if (!isCalendarLoadedRef.current) return;
      if (isUndo && canUndoRef.current) {
        e.preventDefault();
        void dispatch(undoCalendarState());
      } else if (isRedo && canRedoRef.current) {
        e.preventDefault();
        void dispatch(redoCalendarState());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  // Regenerate on engine-input settings that don't flow through the source
  // arrays (buffer, week start, travel rows, transport mode, travel toggle).
  // Safe as an effect because the thunk reads these but never writes them;
  // watching categories/template instead would double-fire against source edits.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!userId || !isCalendarLoadedRef.current) return;
    updateAll();
  }, [
    bufferTimeMinutes,
    weekStartDay,
    travelTimes,
    defaultTransportMode,
    enableTravelEvents,
    updateAll,
    userId,
  ]);

  // Empty-state autoregen, fired exactly once per cold load. Snapshots
  // isCalendarLoaded at mount: if redux retained the loaded state from a
  // prior navigation (we're remounting, not cold-loading), this branch is
  // permanently inert — preventing a perpetual re-fire when categories
  // exist but no engine output materializes (e.g. categories with no time
  // windows defined).
  const isInitialColdLoadRef = useRef(!isCalendarLoaded);
  const autoregenFired = useRef(false);
  useEffect(() => {
    if (!isInitialColdLoadRef.current) return;
    if (!isCalendarLoaded || autoregenFired.current || !userId) return;
    const hasNoChrome =
      categoryEvents.length === 0 && travelEvents.length === 0;
    // Tighter than `categories.length > 0` — a category without time windows
    // produces nothing, so firing autoregen wouldn't change hasNoChrome and
    // the next render would re-evaluate as still-empty.
    const hasSomethingToMaterialize =
      categories.some((c) => c.timeSlots.length > 0) ||
      planner.some((p) => p.locationId);
    if (hasNoChrome && hasSomethingToMaterialize) {
      autoregenFired.current = true;
      updateAll();
    }
  }, [
    isCalendarLoaded,
    userId,
    updateAll,
    categoryEvents.length,
    travelEvents.length,
    categories,
    planner,
  ]);

  // Only the sync-relevant arrays — ephemeral fields (plannerScores,
  // lastEngineRunAt, isLoaded) live outside this object, so they can't
  // invalidate it and wake the sync effect.
  const syncState = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );
  const { initializeState, markSynced } = useCalendarServerSync(
    userId,
    syncState,
  );

  useFetchCalendarData(userId, initializeState);

  // Capped background refresh of TTL-aged travel times, once per app load.
  // Silent and best-effort: the action bounds what a single session may spend
  // (STALE_TOP_UP_MAX_PAIRS), so a long-dormant cache tops up incrementally
  // across sessions rather than in one large unconfirmed refetch.
  const staleTopUpFired = useRef(false);
  useEffect(() => {
    if (!isCalendarLoaded || !userId || staleTopUpFired.current) return;
    staleTopUpFired.current = true;
    void (async () => {
      try {
        const result =
          await locationActions.topUpStaleTravelTimes(defaultTransportMode);
        if (result.refreshed === 0 && result.failed === 0) return;
        const fresh = await locationActions.fetchTravelTimes();
        const serialized = fresh.map(serializeTravelTime);
        dispatch(setAllTravelTimes(serialized));
        markSynced("travelTimes", serialized);
      } catch {
        // Stale values keep working until the next session's attempt.
      }
    })();
  }, [isCalendarLoaded, userId, defaultTransportMode, dispatch, markSynced]);

  const externalSources = useSelector(
    (state: RootState) => state.externalCalendar.sources,
  );
  const externalEvents = useSelector(
    (state: RootState) => state.externalCalendar.events,
  );

  // External-calendar bootstrap, once per app load (login redirect and hard
  // refresh both land here): hydrate the slice from the DB, refresh every
  // enabled source, then regen once so busy blocks from imported events shape
  // this session's placements. Best-effort like the travel top-up — a dead
  // feed keeps its lastError and stale rows.
  const externalBootstrapFired = useRef(false);
  useEffect(() => {
    if (!isCalendarLoaded || !userId || externalBootstrapFired.current) return;
    externalBootstrapFired.current = true;
    void (async () => {
      try {
        const result = await fetchExternalCalendarData();
        if (!result.success) return;
        dispatch(
          hydrateExternalCalendar({
            sources: result.sources,
            events: result.events,
          }),
        );
        for (const source of result.sources) {
          if (!source.enabled) continue;
          const refreshed = await refreshExternalCalendarSource(source.id);
          if (refreshed.success) {
            dispatch(
              applyExternalRefresh({
                source: refreshed.source,
                events: refreshed.events,
              }),
            );
          } else if (refreshed.source) {
            dispatch(upsertExternalSource(refreshed.source));
          }
        }
        if (result.sources.length > 0) updateAll();
      } catch {
        // The calendar works without external feeds until the next load.
      }
    })();
  }, [isCalendarLoaded, userId, dispatch, updateAll]);

  // Occurrence-completion + habit-tracker bootstrap, once per app load:
  // hydrate the completion log from the DB, then regen once so completed
  // occurrences render frozen (and are skipped for rescheduling) this
  // session. Habit trackers ride the same boot but never trigger a regen —
  // the engine does not read them. Out-of-band, like the external-calendar
  // boot.
  const occurrenceBootstrapFired = useRef(false);
  useEffect(() => {
    if (!isCalendarLoaded || !userId || occurrenceBootstrapFired.current) {
      return;
    }
    occurrenceBootstrapFired.current = true;
    void (async () => {
      try {
        const rows = await getOccurrenceCompletions();
        dispatch(hydrateOccurrenceCompletions(rows));
        if (rows.length > 0) updateAll();
      } catch {
        // Completions degrade gracefully; they load on the next visit.
      }
    })();
    void (async () => {
      try {
        dispatch(hydrateHabits(await getHabitData()));
      } catch {
        // The habits page shows its loading state until the next visit.
      }
    })();
  }, [isCalendarLoaded, userId, dispatch, updateAll]);

  const queueCategoryByRootId = useMemo(
    () => buildQueueCategoryByRootId(queues),
    [queues],
  );
  const queueByPlannerId = useMemo(
    () => buildQueueByPlannerId(queues),
    [queues],
  );
  const inheritedLocationMap = useMemo(
    () =>
      buildInheritedLocationMap(
        planner,
        categories,
        locations,
        queueCategoryByRootId,
      ),
    [planner, categories, locations, queueCategoryByRootId],
  );

  // Memoized so a provider re-render (any calendar-slice write) only reaches
  // consumers when something they can read actually changed — every event
  // tile and popover subscribes to this context.
  const value = useMemo<CalendarContextType | null>(
    () =>
      userId
        ? {
            userId,
            userSettings: USER_SETTINGS,
            isLoaded: isCalendarLoaded,
            weekStartDay,
            planner,
            calendar,
            calendarEvents,
            template,
            categories,
            categoryEvents,
            travelEvents,
            queues,
            dependencies,
            locations,
            engineMessages,
            externalSources,
            externalEvents,
            updatePlannerArray,
            updateTemplateArray,
            updateQueueArray,
            updateDependencyArray,
            updateAll,
            manuallyRefreshCalendar,
            undoCalendar,
            redoCalendar,
            canUndo,
            canRedo,
            inheritedLocationMap,
            queueCategoryByRootId,
            queueByPlannerId,
            markSynced,
          }
        : null,
    [
      userId,
      isCalendarLoaded,
      weekStartDay,
      planner,
      calendar,
      template,
      categories,
      categoryEvents,
      travelEvents,
      queues,
      dependencies,
      locations,
      engineMessages,
      externalSources,
      externalEvents,
      updatePlannerArray,
      updateTemplateArray,
      updateQueueArray,
      updateDependencyArray,
      updateAll,
      manuallyRefreshCalendar,
      undoCalendar,
      redoCalendar,
      canUndo,
      canRedo,
      inheritedLocationMap,
      queueCategoryByRootId,
      queueByPlannerId,
      markSynced,
    ],
  );

  if (!value) return null;

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarProvider() {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error(
      "useCalendarProvider must be used within a CalendarProvider",
    );
  }
  return context;
}
