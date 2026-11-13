import type { EventInput } from "@fullcalendar/core";
import type { Category, EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { shiftDate, setTimeOnDate } from "@/utils/calendarUtils";
import { TEMPLATE_PALETTE, UNASSIGNED_COLOR } from "./constants";
import type { WorkingWindow } from "./timeWindow";

// EventTemplate.startDay arrives as either a WeekDayType string ("monday",...)
// from Prisma or as a WeekDayIntegers from local handlers — normalize here.
const WEEKDAY_STRING_TO_INT: Record<string, WeekDayIntegers> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function startDayAsInt(tpl: EventTemplate): WeekDayIntegers {
  const raw = tpl.startDay as unknown;
  if (typeof raw === "number") return raw as WeekDayIntegers;
  if (typeof raw === "string" && raw in WEEKDAY_STRING_TO_INT) {
    return WEEKDAY_STRING_TO_INT[raw];
  }
  return 1;
}

export function templateToEvent(
  tpl: EventTemplate,
  weekStart: Date,
  weekStartDay: WeekDayIntegers,
  active: boolean,
): EventInput {
  const offset = (startDayAsInt(tpl) - weekStartDay + 7) % 7;
  const baseDate = shiftDate(weekStart, offset);
  const start = setTimeOnDate(baseDate, tpl.startTime);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + tpl.duration);
  return {
    id: `tpl:${tpl.id}`,
    title: tpl.title,
    start,
    end,
    backgroundColor: tpl.color || TEMPLATE_PALETTE[0],
    borderColor: "transparent",
    editable: active,
    extendedProps: {
      kind: "template",
      templateId: tpl.id,
      color: tpl.color || TEMPLATE_PALETTE[0],
      active,
    },
  };
}

export function windowRangeToDates(
  day: WeekDayIntegers,
  startTime: string,
  endTime: string,
  weekStart: Date,
  weekStartDay: WeekDayIntegers,
): [Date, Date] {
  const offset = (day - weekStartDay + 7) % 7;
  const baseDate = shiftDate(weekStart, offset);
  const start = setTimeOnDate(baseDate, startTime);
  let end: Date;
  if (endTime === "23:59") {
    // End-of-day sentinel: the within-day window reaches midnight.
    end = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + 1,
    );
  } else {
    end = setTimeOnDate(baseDate, endTime);
    // Overnight window (endTime <= startTime): the end lands the next day.
    if (end.getTime() <= start.getTime()) {
      end = new Date(end);
      end.setDate(end.getDate() + 1);
    }
  }
  return [start, end];
}

export function windowToEvent(
  win: WorkingWindow,
  weekStart: Date,
  weekStartDay: WeekDayIntegers,
  categoryById: Map<string, Category>,
  active: boolean,
  focused: boolean,
): EventInput {
  const category = win.categoryId ? categoryById.get(win.categoryId) : null;
  const color = category?.color || UNASSIGNED_COLOR;
  const title = category?.name || "Unassigned";
  const [start, end] = windowRangeToDates(
    win.day,
    win.startTime,
    win.endTime,
    weekStart,
    weekStartDay,
  );
  return {
    id: `win:${win.id}`,
    title,
    start,
    end,
    backgroundColor: color,
    borderColor: "transparent",
    editable: active,
    extendedProps: {
      kind: "window",
      windowId: win.id,
      color,
      active,
      assigned: !!win.categoryId,
      focused,
    },
  };
}
