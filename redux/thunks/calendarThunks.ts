import {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import { runEngineCalculation } from "@/utils/calendar-generation/engineWorkerClient";
import { WeekDayIntegers } from "@/types/calendarTypes";
import { AppDispatch } from "../store";
import { RootState } from "../store";
import {
  setCategories,
  setPlannerAndTemplate,
  setQueues,
  setDependencies,
} from "../slices/calendarSourceSlice";
import { applyEngineRun } from "../slices/engineOutputSlice";
import {
  travelTimeArrayToMap,
  deriveTravelTimeMatrix,
} from "../slices/schedulingSettingsSlice";
import {
  pruneQueueMembers,
  pruneDependencies,
  prunePlannerDetours,
} from "@/utils/precedence/prunePrecedenceInputs";
import { deriveExternalBusyEvents } from "@/utils/external-calendar/deriveExternalBusyEvents";
import { deriveOccurrenceCompletions } from "@/utils/deriveOccurrenceCompletions";

type CalendarPayload = {
  planner?: Planner[] | ((prev: Planner[]) => Planner[]);
  calendar?: SimpleEvent[] | ((prev: SimpleEvent[]) => SimpleEvent[]);
  template?: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]);
  categories?: Category[] | ((prev: Category[]) => Category[]);
  queues?: Queue[] | ((prev: Queue[]) => Queue[]);
  dependencies?:
    | PlannerDependency[]
    | ((prev: PlannerDependency[]) => PlannerDependency[]);
  /**
   * "inline" runs the engine synchronously on the main thread so the source
   * update and the engine output commit before the next paint — no
   * intermediate frame. Used by calendar drag/resize, where FullCalendar has
   * already moved the tile internally and an async regen would briefly render
   * it overlapping stale placements. Everything else defaults to the worker.
   */
  engineMode?: "inline" | "worker";
};

// Helper function that processes optional update parameters
const processInput = <T>(
  update: T | ((prev: T) => T) | undefined,
  currentValue: T
): T => {
  if (update === undefined) return currentValue;
  return typeof update === "function"
    ? (update as (prev: T) => T)(currentValue)
    : update;
};

export const updateAllCalendarStates =
  (updates: CalendarPayload) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState();
    const userId: string | undefined = state.user?.user?.id;
    const weekStartDay: WeekDayIntegers =
      state.schedulingSettings.weekStartDay;

    const currentPlanner: Planner[] = state.calendarSource.planner;
    const calendar: SimpleEvent[] = state.engineOutput.calendar;
    const template: EventTemplate[] = state.calendarSource.template;
    const categories: Category[] = state.calendarSource.categories;
    const queues: Queue[] = state.calendarSource.queues;
    const dependencies: PlannerDependency[] =
      state.calendarSource.dependencies;
    const previousEngineMessages = state.engineOutput.engineMessages;
    const bufferTimeMinutes: number =
      state.schedulingSettings.bufferTimeMinutes;
    const enableTravelEvents: boolean =
      state.schedulingSettings.enableTravelEvents;
    // Derived fresh from the source-of-truth rows so newly added locations,
    // refreshed travel times, override edits, and transport-mode switches take
    // effect on the next regen without a page reload.
    const travelTimeMatrix = deriveTravelTimeMatrix(
      state.schedulingSettings.allTravelTimes,
      state.schedulingSettings.defaultTransportMode,
    );

    const newPlanner = prunePlannerDetours(
      updates.planner
        ? processInput(updates.planner, currentPlanner)
        : currentPlanner,
    );
    const newCalendarInput = updates.calendar
      ? processInput(updates.calendar, calendar)
      : calendar;
    const newTemplate = updates.template
      ? processInput(updates.template, template)
      : template;
    const newCategories = updates.categories
      ? processInput(updates.categories, categories)
      : categories;

    // Central pruning: members/edges whose planner was deleted, retyped,
    // nested, or untriaged are dropped here regardless of where the planner
    // edit originated. Identity-preserving on no-op, so an untouched pass
    // dispatches nothing and the sync diff stays empty.
    const newQueues = pruneQueueMembers(
      updates.queues ? processInput(updates.queues, queues) : queues,
      newPlanner,
    );
    const newDependencies = pruneDependencies(
      updates.dependencies
        ? processInput(updates.dependencies, dependencies)
        : dependencies,
      newPlanner,
    );

    // Convert serialized array to Map for calendar generation
    const travelTimeMap = travelTimeArrayToMap(travelTimeMatrix);

    // Imported external events that should block scheduling, resolved from
    // each source's mode + per-event exceptions. Derived fresh per run so a
    // refresh or exception toggle takes effect on the next regen.
    const externalBusyEvents = deriveExternalBusyEvents(
      state.externalCalendar.sources,
      state.externalCalendar.events,
    );

    // Logged occurrence completions, derived fresh so a just-completed
    // occurrence is skipped (and rendered frozen) on the next regen. Outside
    // the OCC sync.
    const occurrenceCompletions = deriveOccurrenceCompletions(
      state.occurrenceCompletions.rows,
    );

    // Source state lands immediately (optimistic UI); engine output follows
    // when the worker replies. These dispatches must stay BEFORE the await so
    // functional updates from rapid consecutive calls chain off fresh state.
    if (updates.categories) {
      dispatch(setCategories(newCategories));
    }
    if (updates.queues || newQueues !== queues) {
      dispatch(setQueues(newQueues));
    }
    if (updates.dependencies || newDependencies !== dependencies) {
      dispatch(setDependencies(newDependencies));
    }
    dispatch(
      setPlannerAndTemplate({ planner: newPlanner, template: newTemplate }),
    );

    // Only the engine run needs userId (it stamps generated events). The
    // source dispatches above must never be gated on it: userId hydrates a
    // beat after page load, and dropping the whole update here silently
    // swallowed edits made in that window — the dragged tile stayed put
    // visually while nothing was saved. The diff sync authenticates
    // server-side via the session, so the planner change still persists;
    // the next regen from any trigger re-derives the calendar.
    if (!userId) {
      console.warn("No userId in state yet; source updated, engine run skipped");
      return;
    }

    let result: Awaited<ReturnType<typeof runEngineCalculation>>;
    try {
      result = await runEngineCalculation(
        {
          userId,
          weekStartDay,
          template: newTemplate,
          planner: newPlanner,
          prevCalendar: newCalendarInput,
          options: {
            bufferTimeMinutes,
            travelTimeMatrix: travelTimeMap ?? undefined,
            injectTravelEvents: enableTravelEvents,
            categories: newCategories,
            queues: newQueues,
            dependencies: newDependencies,
            externalBusyEvents,
            occurrenceCompletions,
            previousEngineMessages,
          },
        },
        updates.engineMode ?? "worker",
      );
    } catch (error) {
      // Inline mode runs synchronously inside the dispatch call stack — an
      // uncaught throw would unwind into FullCalendar's drop emitter mid-
      // interaction. Source state is already committed above and the diff
      // sync persists it; only the calendar output stays stale.
      console.error("Engine run failed; source edit kept", error);
      return;
    }

    // Null means a newer regen superseded this one mid-flight; its result
    // will land instead.
    if (!result) return;

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
  };
