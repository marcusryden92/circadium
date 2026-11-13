import FullCalendar from "@fullcalendar/react";
import { DateSelectArg } from "@fullcalendar/core/index.js";
import { EventTemplate } from "@/types/prisma";
import { WeekDayIntegers } from "@/types/calendarTypes";
import { calendarColors } from "@/data/calendarColors";
import { historyMessages } from "../historyMessages";

import { getTimeFromDate } from "../templateBuilderUtils";

import { v4 as uuidv4 } from "uuid";
import { EventImpl } from "@fullcalendar/core/internal";

const dayOfWeek = (d: Date): WeekDayIntegers => d.getDay() as WeekDayIntegers;

type UpdateTemplateArrayFn = (
  template: EventTemplate[] | ((prev: EventTemplate[]) => EventTemplate[]),
  label: string,
  options?: { engineMode?: "inline" | "worker"; label?: string },
) => void;

export const handleTemplateSelect = (
  userId: string | undefined,
  calendarRef: React.RefObject<FullCalendar>,
  updateTemplateArray: UpdateTemplateArrayFn,
  selectInfo: DateSelectArg,
) => {
  const { start, end } = selectInfo;
  const title = prompt("Enter event title:", "New Event");

  const startDay = dayOfWeek(start);
  const startTime = getTimeFromDate(start);

  if (userId && title && calendarRef.current) {
    const now = new Date();

    // Calculate duration in minutes
    const durationMinutes = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60)
    );

    // Create new EventTemplate object
    const newEvent: EventTemplate = {
      userId: userId,
      title,
      id: uuidv4(),
      startDay, // Assuming startDate is a Date object
      startTime, // Assuming startDate is a Date object
      duration: durationMinutes, // Add duration in minutes
      color: calendarColors[0],
      locationId: null,
      recurrenceExceptions: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    updateTemplateArray(
      (prevEvents) => [...prevEvents, newEvent],
      historyMessages.template.create(title),
    );
  }
};

export const handleTemplateEventCopy = (
  updateTemplateArray: UpdateTemplateArrayFn,
  event: EventImpl,
  userId: string,
) => {
  const now = new Date();

  if (!event.start || !event.end)
    throw new Error(
      "Missing event.start or event.end in handleTemplateEventCopy"
    );

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  // Calculate duration in minutes
  const duration = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60)
  );

  // Create new EventTemplate object, copying locationId from original event
  const newEvent: EventTemplate = {
    userId: userId,
    title: event.title,
    id: uuidv4(),
    startDay: dayOfWeek(startDate),
    startTime: getTimeFromDate(startDate),
    duration,
    color: event.backgroundColor,
    locationId: (event.extendedProps?.locationId as string | null) ?? null,
    recurrenceExceptions: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  updateTemplateArray(
    (prevEvents) => [...prevEvents, newEvent],
    historyMessages.template.duplicate(event.title),
  );
};

export const handleTemplateEventDelete = (
  updateTemplateArray: UpdateTemplateArrayFn,
  eventId: string,
  title?: string | null,
) => {
  updateTemplateArray(
    (prevEvents) => prevEvents.filter((ev) => ev.id !== eventId),
    historyMessages.template.delete(title),
  );
};

export const handleTemplateEventEdit = (
  updateTemplateArray: UpdateTemplateArrayFn,
  eventTitle: string,
  eventId: string,
) => {
  updateTemplateArray(
    (prevEvents) =>
      prevEvents.map((ev) =>
        ev.id === eventId ? { ...ev, title: eventTitle } : ev
      ),
    historyMessages.template.rename(eventTitle),
  );
};
