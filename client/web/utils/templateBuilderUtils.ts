import { shiftDate } from "@/utils/calendarUtils";
import { setTimeOnDate } from "@/utils/calendarUtils";
import { WeekDayIntegers } from "@/types/calendarTypes";
import { calendarColors } from "@/data/calendarColors";
import { getWeekFirstDate, intToWeekday } from "@/utils/calendarUtils";

import { EventTemplate } from "@/types/prisma";
import { EventInput } from "@fullcalendar/core";

export function getTimeFromDate(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function populateTemplateCalendar(
  userId: string,
  weekStartDay: WeekDayIntegers,
  template: EventTemplate[]
): EventInput[] {
  const eventArray: EventInput[] = [];
  const todaysDate = new Date(2024, 0, 1);

  // Get the first date of the week based on the weekStartDay
  const thisWeeksFirstDate: Date | undefined = getWeekFirstDate(
    weekStartDay,
    todaysDate
  );

  template.forEach((event) => {
    if (
      !event ||
      event.startDay === null ||
      event.startDay === undefined ||
      !event.startTime ||
      event.duration === undefined
    ) {
      console.error("Event details are incomplete.", event);
      return;
    }

    // event.startDay is already a WeekDayIntegers (0=Sunday) matching this loop's
    // indexing — no string lookup needed.
    const startDayOffset = (event.startDay - weekStartDay + 7) % 7;
    let newStartDate: Date = shiftDate(thisWeeksFirstDate, startDayOffset);

    if (event.startTime) {
      newStartDate = setTimeOnDate(newStartDate, event.startTime);
    }

    // Calculate end date based on duration
    const newEndDate = new Date(newStartDate);
    newEndDate.setMinutes(newEndDate.getMinutes() + event.duration);

    const now = new Date();

    eventArray.push({
      userId,
      id: event.id, // Generate a unique ID for the event
      title: event.title,
      start: newStartDate, // Convert Date to ISO string
      end: newEndDate, // Convert Date to ISO string
      backgroundColor: (event.color as string) || calendarColors[0],
      borderColor: "transparent",
      duration: null,
      extendedProps: { isTemplateItem: true, locationId: event.locationId },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  return eventArray;
}

// Functionality to calculate largest gap in the week template:

const daysOfWeek = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Helper function to convert day and time to minutes from the start of the week
function convertToMinutesFromWeekStart(
  day: string | undefined,
  time: string | undefined
): number | null {
  if (!day || !time) {
    // Return null if day or time is undefined
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  const dayIndex = daysOfWeek.indexOf(day.toLowerCase());

  if (dayIndex === -1) {
    // Handle the case where the day is not valid
    return null;
  }

  return dayIndex * 24 * 60 + hours * 60 + minutes;
}

// Function to find the largest gap between events
export function findLargestGap(events: EventTemplate[]): number | undefined {
  if (!events || events.length === 0) return undefined;

  const minutesInWeek = 7 * 24 * 60; // Total minutes in a week

  if (events.length === 1) return minutesInWeek - events[0].duration;

  // Convert each event's start time to minutes from the week start and calculate the end time.
  // event.startDay is WeekDayIntegers — convert to the string form expected by the helper.
  const eventTimes = events
    .map((event) => {
      const dayStr =
        event.startDay === null || event.startDay === undefined
          ? undefined
          : intToWeekday(event.startDay);
      const start = convertToMinutesFromWeekStart(dayStr, event.startTime);
      const end = start !== null ? start + event.duration : null;
      return { start, end };
    })
    .filter((event) => event.start !== null && event.end !== null); // Filter out invalid events

  // Sort events by their start time
  eventTimes.sort((a, b) => a.start! - b.start!);

  // Initialize the largest gap, starting from the gap before the first event
  let largestGap = eventTimes[0].start!; // Gap from 00:00 on Monday to the first event

  // Calculate the gaps between consecutive events
  for (let i = 1; i < eventTimes.length; i++) {
    const gap = eventTimes[i].start! - eventTimes[i - 1].end!;
    if (gap > largestGap) {
      largestGap = gap;
    }
  }

  // Calculate the gap after the last event until the end of the week (24:00 on Sunday)
  const lastEventEnd = eventTimes[eventTimes.length - 1].end!;
  const gapAfterLastEvent = minutesInWeek - lastEventEnd;
  if (gapAfterLastEvent > largestGap) {
    largestGap = gapAfterLastEvent;
  }

  return largestGap;
}
