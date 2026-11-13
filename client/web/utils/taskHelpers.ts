import { Planner } from "@/types/prisma";
import { SimpleEvent } from "@/types/prisma";
import { getMinuteDifference } from "./calendar-generation/utils/dateTimeService";
import { floorMinutes } from "./calendarUtils";
import { EventImpl } from "@fullcalendar/core/internal";
import { assert } from "./assert/assert";
import { plannerIsCompleted } from "./plannerCompletion";

export function getPlannerAndCalendarForCompletedTask(
  planner: Planner[],
  calendar: SimpleEvent[] = [],
  event: EventImpl
):
  | {
      manuallyUpdatedTaskArray: Planner[];
      manuallyUpdatedCalendar: SimpleEvent[];
    }
  | undefined {
  const start = event.start;
  const end = event.end;

  assert(start, "start missing from getPlannerAndCalendarForCompletedTask");
  assert(end, "end missing from getPlannerAndCalendarForCompletedTask");

  const currentTime = new Date();
  const eventStartDate = new Date(event.start);

  const manuallyUpdatedCalendar: SimpleEvent[] | undefined = calendar?.filter(
    (e) => !(e.id === event.id)
  );

  const manuallyUpdatedTaskArray = planner.map((task) => {
    if (task.id === event.id) {
      // If completed is defined, set to null
      if (taskIsCompleted(task)) {
        return { ...task, completedStartTime: null, completedEndTime: null };
      }

      // If inside the event, set end-time to right now
      else if (currentlyInEvent(event)) {
        const minuteDifference = getMinuteDifference(
          eventStartDate,
          currentTime
        );

        // If the event started less than 5 minutes ago,
        // push the start time back to make the event at least 5 minutes long.
        const startTime =
          minuteDifference < 20
            ? new Date(currentTime.getTime() - 20 * 60 * 1000)
            : eventStartDate;

        const endTime = currentTime;

        return {
          ...task,
          completedStartTime: startTime.toISOString(),
          completedEndTime: endTime.toISOString(),
        };
      } else if (floorMinutes(currentTime) < floorMinutes(start)) {
        const duration =
          task.duration || getMinuteDifference(new Date(start), new Date(end));

        const startTime = new Date(
          currentTime.getTime() - duration * 60 * 1000
        );

        const endTime = currentTime;

        return {
          ...task,
          completedStartTime: startTime.toISOString(),
          completedEndTime: endTime.toISOString(),
        };
      }

      // Else, set end-time to event endtime
      return {
        ...task,
        completedStartTime: start.toISOString(),
        completedEndTime: end.toISOString(),
      };
    }

    return task;
  });

  return { manuallyUpdatedTaskArray, manuallyUpdatedCalendar };
}

export function currentlyInEvent(event: SimpleEvent | EventImpl) {
  assert(event.start, "event.start missing from currentlyInEvent");
  assert(event.end, "event.end missing from currentlyInEvent");

  const currentTime = new Date().getTime(); // Get current time in milliseconds

  const eventStartTime = new Date(event.start).getTime();
  const eventEndTime = new Date(event.end).getTime();

  if (currentTime >= eventStartTime && currentTime <= eventEndTime) {
    return true; // Return the end time as a Date object
  }

  return false;
}

export function taskIsCompleted(task: Planner) {
  return plannerIsCompleted(task);
}
