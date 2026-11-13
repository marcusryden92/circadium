import { EventTemplate, SimpleEvent, EventType } from "@/types/prisma";
import { WeekDayIntegers } from "@/types/calendarTypes";
import { RRule, Weekday } from "rrule";
import { v4 as uuidv4 } from "uuid";
import { calendarColors } from "@/data/calendarColors";
import { dateTimeService } from "../../utils/dateTimeService";

function getRRuleDayFromIndex(day: number): Weekday {
  const rruleWeekdays = [
    RRule.SU,
    RRule.MO,
    RRule.TU,
    RRule.WE,
    RRule.TH,
    RRule.FR,
    RRule.SA,
  ];
  return rruleWeekdays[day];
}

function createRecurringTemplateEvent(
  userId: string,
  template: EventTemplate,
  weekStartDate: Date,
  weekStartDay: WeekDayIntegers,
): SimpleEvent | null {
  if (
    template.startDay === null ||
    template.startDay === undefined ||
    !template.startTime ||
    template.duration === undefined
  ) {
    console.error("Template details incomplete:", template);
    return null;
  }

  const dayOffset = (template.startDay - weekStartDay + 7) % 7;
  const eventDate = dateTimeService.shiftDays(weekStartDate, dayOffset);

  const startDate = dateTimeService.setTimeOnDate(
    eventDate,
    template.startTime,
  );
  const endMinutes =
    startDate.getHours() * 60 + startDate.getMinutes() + template.duration;
  const endDayOffset = Math.floor(endMinutes / 1440);
  const endTimeMinutes = endMinutes % 1440;
  const endDate = new Date(eventDate);
  endDate.setDate(endDate.getDate() + endDayOffset);
  endDate.setHours(
    Math.floor(endTimeMinutes / 60),
    endTimeMinutes % 60,
    0,
    0,
  );

  const rruleDay = getRRuleDayFromIndex(startDate.getDay());

  const pad = (n: number) => String(n).padStart(2, "0");
  const startISO = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}T${pad(startDate.getHours())}:${pad(startDate.getMinutes())}:${pad(startDate.getSeconds())}`;

  const rule = {
    freq: "weekly",
    interval: 1,
    byweekday: [rruleDay],
    dtstart: startISO,
  };

  const now = new Date();

  return {
    userId,
    id: template.id,
    title: template.title,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    rrule: JSON.stringify(rule),
    duration: template.duration * 60 * 1000,
    extendedProps: {
      id: uuidv4(),
      eventId: template.id,
      plannerType: null,
      eventType: EventType.template,
      completedStartTime: null,
      completedEndTime: null,
      parentId: null,
    },
    backgroundColor: (template.color as string) || calendarColors[0],
    borderColor: "transparent",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function expandTemplates(
  userId: string,
  templates: EventTemplate[],
  startDate: Date,
  weekStartDay: WeekDayIntegers,
): { events: SimpleEvent[]; failureCount: number } {
  const events: SimpleEvent[] = [];
  let failureCount = 0;

  for (const template of templates) {
    const event = createRecurringTemplateEvent(
      userId,
      template,
      startDate,
      weekStartDay,
    );
    if (event) {
      events.push(event);
    } else {
      failureCount++;
    }
  }

  return { events, failureCount };
}
