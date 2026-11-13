import { EventTemplate } from "@/types/prisma";
import { PerTemplateMask } from "../../models/TemplateModels";
import { parseRecurrenceExceptions } from "@/utils/planRecurrence";

export function getPerTemplateMasks(
  templates: EventTemplate[],
): PerTemplateMask[] {
  const masks: PerTemplateMask[] = [];

  for (const template of templates) {
    if (
      template.startDay === null ||
      template.startDay === undefined ||
      !template.startTime ||
      template.duration === undefined
    ) {
      continue;
    }

    const [h, m] = template.startTime.split(":").map((s) => parseInt(s, 10));
    const startMinutes = h * 60 + m;
    const endMinutes = startMinutes + template.duration;

    const t = template as unknown as Record<string, unknown>;

    const recurrenceExceptions = parseRecurrenceExceptions(
      template.recurrenceExceptions,
    );

    masks.push({
      templateId: template.id,
      title: template.title,
      color: template.color as string,
      locationId: template.locationId ?? null,
      dayOfWeek: template.startDay,
      startMinutes,
      endMinutes,
      recurrenceExceptions: recurrenceExceptions.length
        ? recurrenceExceptions
        : undefined,
      startDateISO: (() => {
        if (typeof t.startDateISO === "string") return t.startDateISO;
        if (typeof t.startDate === "string") return t.startDate;
        if (typeof t.anchorDate === "string") return t.anchorDate;
        return undefined;
      })(),
      intervalDays: (() => {
        if (typeof t.intervalDays === "number") return t.intervalDays;
        if (typeof t.repeatEveryDays === "number") return t.repeatEveryDays;
        if (typeof t.repeatInterval === "number") return t.repeatInterval;
        return undefined;
      })(),
    });
  }

  return masks;
}
