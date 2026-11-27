import { EventType, type EventTemplate } from "../../contracts";
import { calendarColors } from "../../domain/calendarColors";
import { occurrenceEventId } from "../../domain/planRecurrence";
import { expandTemplateOccurrences } from "../expandTemplateOccurrences";
import type { CalendarRange, TemplateCalendarEvent } from "./calendarEvent";

// Templates render straight from EventTemplate config (never through the
// engine), so editing a template shows immediately. Every occurrence carries a
// composite `templateId|key` id: unique per tile, and the key survives a
// re-move or re-delete of a customized occurrence.
export function templatesToCalendarEvents(
  templates: EventTemplate[],
  range: CalendarRange,
): TemplateCalendarEvent[] {
  const result: TemplateCalendarEvent[] = [];
  for (const template of templates) {
    if (
      template.startDay === null ||
      template.startDay === undefined ||
      !template.startTime ||
      template.duration === undefined
    ) {
      continue;
    }
    const color = template.color || calendarColors[0];
    const occurrences = expandTemplateOccurrences({
      template,
      rangeStart: range.start,
      rangeEnd: range.end,
    });
    for (const occurrence of occurrences) {
      result.push({
        kind: EventType.template,
        id: occurrenceEventId(template.id, occurrence.key),
        title: template.title,
        start: occurrence.start,
        end: occurrence.end,
        editable: true,
        templateId: template.id,
        occurrenceKey: occurrence.key,
        moved: occurrence.moved,
        color,
      });
    }
  }
  return result;
}
