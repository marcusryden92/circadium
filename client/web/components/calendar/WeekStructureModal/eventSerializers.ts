import type { EventInput } from "@fullcalendar/core";
import type { Category, EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { shiftDate, setTimeOnDate } from "@/utils/calendarUtils";
import {
  startDayAsInt,
  windowRangeToDates,
} from "@circadium/shared/calendar-core/weekStructure";
import { TEMPLATE_PALETTE, UNASSIGNED_COLOR } from "./constants";
import type { WorkingWindow } from "./timeWindow";

export { startDayAsInt, windowRangeToDates };

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
