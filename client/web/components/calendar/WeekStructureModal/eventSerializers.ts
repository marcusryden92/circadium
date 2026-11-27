import { EventType, type Category, type EventTemplate } from "@/types/prisma";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import { shiftDate, setTimeOnDate } from "@/utils/calendarUtils";
import {
  startDayAsInt,
  windowRangeToDates,
} from "@circadium/shared/calendar-core/weekStructure";
import type {
  CategoryCalendarEvent,
  TemplateCalendarEvent,
} from "@circadium/shared/calendar-core/model";
import { TEMPLATE_PALETTE, UNASSIGNED_COLOR } from "./constants";
import type { WorkingWindow } from "./timeWindow";

export { startDayAsInt, windowRangeToDates };

// A reference-week block as the shared calendar core sees it: a template is
// a TemplateCalendarEvent and a window a CategoryCalendarEvent (the same kinds
// the main calendar draws them as), so layout, hit-testing and the drag
// machine run unchanged. The extras carry what the grid's tiles and the
// modal's edits need. There are no real occurrences in the reference week,
// so occurrenceKey is empty.
export type WeekGridEvent = (TemplateCalendarEvent | CategoryCalendarEvent) & {
  gridKind: "template" | "window";
  // The template or window id (the event id is prefixed per kind).
  sourceId: string;
  color: string;
  active: boolean;
  assigned: boolean;
  focused: boolean;
};

export function templateToEvent(
  tpl: EventTemplate,
  weekStart: Date,
  weekStartDay: WeekDayIntegers,
  active: boolean,
): WeekGridEvent {
  const offset = (startDayAsInt(tpl) - weekStartDay + 7) % 7;
  const baseDate = shiftDate(weekStart, offset);
  const start = setTimeOnDate(baseDate, tpl.startTime);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + tpl.duration);
  const color = tpl.color || TEMPLATE_PALETTE[0];
  return {
    kind: EventType.template,
    id: `tpl:${tpl.id}`,
    title: tpl.title,
    start,
    end,
    editable: active,
    templateId: tpl.id,
    occurrenceKey: "",
    moved: false,
    gridKind: "template",
    sourceId: tpl.id,
    color,
    active,
    assigned: true,
    focused: true,
  };
}

export function windowToEvent(
  win: WorkingWindow,
  weekStart: Date,
  weekStartDay: WeekDayIntegers,
  categoryById: Map<string, Category>,
  active: boolean,
  focused: boolean,
): WeekGridEvent {
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
    kind: EventType.category,
    id: `win:${win.id}`,
    title,
    start,
    end,
    editable: active,
    categoryId: win.categoryId ?? "",
    categoryName: title,
    categoryColor: category?.color ?? null,
    isStrict: category?.isStrict ?? false,
    trespassingStart: false,
    trespassingEnd: false,
    gridKind: "window",
    sourceId: win.id,
    color,
    active,
    assigned: !!win.categoryId,
    focused,
  };
}
