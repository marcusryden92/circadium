"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import {
  hydrateSource,
  markCalendarLoaded,
} from "@/redux/slices/calendarSourceSlice";
import { hydrateEngineOutput } from "@/redux/slices/engineOutputSlice";
import {
  setSchedulingSettings,
  setDefaultTransportMode,
  setLocations,
  setAllTravelTimes,
} from "@/redux/slices/schedulingSettingsSlice";
import { hydrateExternalCalendar } from "@/redux/slices/externalCalendarSlice";
import { hydrateOccurrenceCompletions } from "@/redux/slices/occurrenceCompletionsSlice";
import { hydrateHabits } from "@/redux/slices/habitsSlice";
import { getFeedbackReportSnapshot } from "@/actions/adminFeedback";
import {
  exitInspection,
  snapshotToInspectionData,
  type InspectionTarget,
} from "@/utils/inspection";

// Snapshot-impersonation hydration: replaces the whole normal bootstrap
// (useFetchCalendarData + the UserProvider scheduling load + the external /
// completion / habit boots, all of which CalendarProvider skips while a
// target is set). Fires once per mount; a failed load exits inspection so
// the admin lands back in their own account instead of a blank app.
export function useInspectionData(target: InspectionTarget | null) {
  const dispatch = useDispatch<AppDispatch>();
  const fired = useRef(false);

  useEffect(() => {
    if (!target || fired.current) return;
    fired.current = true;

    void (async () => {
      try {
        const blob = await getFeedbackReportSnapshot(target.reportId);
        if (!blob) throw new Error("Snapshot missing");
        const data = snapshotToInspectionData(blob);

        if (data.preferences) {
          dispatch(
            setSchedulingSettings({
              bufferTimeMinutes: data.preferences.bufferTimeMinutes,
              weekStartDay: data.preferences.weekStartDay,
            }),
          );
          dispatch(
            setDefaultTransportMode(data.preferences.defaultTransportMode),
          );
        }
        dispatch(setLocations(data.locations));
        dispatch(setAllTravelTimes(data.travelTimes));
        dispatch(
          hydrateSource({
            planner: data.planner,
            template: data.template,
            categories: data.categories,
            queues: data.queues,
            dependencies: data.dependencies,
          }),
        );
        dispatch(
          hydrateEngineOutput({
            calendar: data.calendar,
            categoryEvents: data.categoryEvents,
            travelEvents: data.travelEvents,
            engineMessages: data.engineMessages,
          }),
        );
        dispatch(
          hydrateExternalCalendar({
            sources: data.externalSources,
            events: data.externalEvents,
          }),
        );
        dispatch(hydrateOccurrenceCompletions(data.occurrenceCompletions));
        dispatch(hydrateHabits(data.habits));
        dispatch(markCalendarLoaded());
      } catch (error) {
        console.error("Failed to load inspection snapshot:", error);
        exitInspection();
      }
    })();
  }, [target, dispatch]);
}
