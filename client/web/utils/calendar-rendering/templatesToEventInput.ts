import type { EventInput } from "@fullcalendar/core/index.js";
import { EventTemplate, EventType } from "@/types/prisma";
import { calendarColors } from "@/data/calendarColors";
import {
  parseRecurrenceExceptions,
  occurrenceEventId,
} from "@/utils/planRecurrence";

const RRULE_WEEKDAY_BY_INDEX = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const pad = (n: number) => String(n).padStart(2, "0");

// Naive local "yyyy-MM-ddTHH:mm:ss" — the same reference the rrule dtstart
// uses (no timezone suffix), so exdate lines up with generated instances.
function localNaive(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

const TEMPLATE_EXTENDED_PROPS = {
  eventType: EventType.template,
  plannerType: null,
  completedStartTime: null,
  completedEndTime: null,
  parentId: null,
  isTemplateItem: true,
} as const;

// Converts EventTemplate configuration directly into FullCalendar EventInput
// with RRule. No shadow SimpleEvents — the renderer reads EventTemplate as
// the source of truth, so editing a template appears immediately without
// going through the engine. Per-occurrence recurrence exceptions are applied
// client-side: deleted/moved keys are excluded from the recurring series via
// exdate, and each moved occurrence is rendered as its own one-off event at
// the override time (composite id so its key survives a re-move/re-delete).
export function templatesToEventInput(
  templates: EventTemplate[],
): EventInput[] {
  const events: EventInput[] = [];
  for (const template of templates) {
    if (
      template.startDay === null ||
      template.startDay === undefined ||
      !template.startTime ||
      template.duration === undefined
    ) {
      continue;
    }

      const [hours, minutes] = template.startTime.split(":").map(Number);
      const today = new Date();
      // Anchor dtstart on the most recent occurrence of the template's
      // startDay so RRule has a concrete point to expand from. The actual
      // weekly recurrence is what FullCalendar renders — the anchor date
      // just sets the time-of-day.
      const dayOffset = (today.getDay() - template.startDay + 7) % 7;
      const anchor = new Date(today);
      anchor.setDate(anchor.getDate() - dayOffset);
      anchor.setHours(hours, minutes, 0, 0);
      const dtstart = localNaive(anchor);

      const rrule = {
        freq: "weekly",
        interval: 1,
        byweekday: [RRULE_WEEKDAY_BY_INDEX[template.startDay]],
        dtstart,
      };

      const durationMs = template.duration * 60 * 1000;
      const durationHours = Math.floor(durationMs / 3600000);
      const durationMinutes = Math.floor((durationMs % 3600000) / 60000);
      const durationStr = `${pad(durationHours)}:${pad(durationMinutes)}:00`;

      const exceptions = parseRecurrenceExceptions(
        template.recurrenceExceptions,
      );
      // Both deleted and moved keys leave the recurring series (moved ones are
      // re-added below as one-off events at their override start). The key is
      // already the naive local "yyyy-MM-ddTHH:mm" — only seconds are missing.
      const exdate = exceptions.map((e) => `${e.key}:00`);
      const backgroundColor =
        (template.color as string) || calendarColors[0];

    events.push({
      id: template.id,
      title: template.title,
      rrule,
      ...(exdate.length ? { exdate } : {}),
      duration: durationStr,
      backgroundColor,
      borderColor: "transparent",
      editable: true,
      extendedProps: {
        ...TEMPLATE_EXTENDED_PROPS,
        eventId: template.id,
      },
    });

    for (const exception of exceptions) {
      if (exception.type !== "moved") continue;
      const start = new Date(exception.newStart);
      const occurrenceMs =
        exception.durationMinutes !== undefined
          ? exception.durationMinutes * 60 * 1000
          : durationMs;
      const end = new Date(start.getTime() + occurrenceMs);
      events.push({
        id: occurrenceEventId(template.id, exception.key),
        title: template.title,
        start: start.toISOString(),
        end: end.toISOString(),
        backgroundColor,
        borderColor: "transparent",
        editable: true,
        extendedProps: {
          ...TEMPLATE_EXTENDED_PROPS,
          eventId: template.id,
        },
      });
    }
  }
  return events;
}
