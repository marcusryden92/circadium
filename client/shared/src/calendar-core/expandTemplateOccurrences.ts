import { addDays, addMinutes, addWeeks } from "date-fns";
import type { EventTemplate } from "../contracts";
import {
  occurrenceKey,
  parseRecurrenceExceptions,
  type PlanOccurrenceException,
} from "../domain/planRecurrence";
import { startDayAsInt } from "./weekStructure";

// A template recurs weekly on its fixed startDay/startTime for `duration`
// minutes. This is the renderer-agnostic expansion (the FullCalendar surface
// hands the same data to its own RRule engine; mobile has no such engine, so it
// expands here). Occurrences are keyed by the local wall-clock of their rule
// position — the same key the planner's recurrence model uses — so moved and
// deleted exceptions line up across both systems.
export interface TemplateOccurrence {
  key: string;
  templateId: string;
  title: string;
  start: Date;
  end: Date;
  moved: boolean;
}

// Safety net only — the loop is bounded by rangeEnd. Ten years of weekly
// positions comfortably exceeds any range a renderer asks for.
const MAX_TEMPLATE_OCCURRENCES = 520;

export function expandTemplateOccurrences(args: {
  template: EventTemplate;
  rangeStart: Date;
  rangeEnd: Date;
}): TemplateOccurrence[] {
  const { template, rangeStart, rangeEnd } = args;

  const [hours, minutes] = template.startTime.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return [];

  const startDay = startDayAsInt(template);

  // Anchor on the template's weekday at startTime, on or before rangeStart, so
  // weekly steps land on every rule position in the range. date-fns add* steps
  // preserve local wall-clock across DST, which also keeps keys deterministic.
  let anchor = new Date(rangeStart);
  anchor.setHours(hours, minutes, 0, 0);
  const backShift = (anchor.getDay() - startDay + 7) % 7;
  anchor = addDays(anchor, -backShift);

  const exceptions: PlanOccurrenceException[] = parseRecurrenceExceptions(
    template.recurrenceExceptions,
  );
  const exceptionByKey = new Map(exceptions.map((e) => [e.key, e]));

  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  const occurrences: TemplateOccurrence[] = [];
  for (let n = 0; n < MAX_TEMPLATE_OCCURRENCES; n++) {
    const ruleStart = addWeeks(anchor, n);
    const ruleMs = ruleStart.getTime();
    if (ruleMs >= endMs) break;
    if (ruleMs < startMs) continue;

    const key = occurrenceKey(ruleStart);
    const exception = exceptionByKey.get(key);
    if (exception?.type === "deleted") continue;

    const start =
      exception?.type === "moved" ? new Date(exception.newStart) : ruleStart;
    const durationMinutes =
      exception?.type === "moved" && exception.durationMinutes !== undefined
        ? exception.durationMinutes
        : template.duration;

    occurrences.push({
      key,
      templateId: template.id,
      title: template.title,
      start,
      end: addMinutes(start, durationMinutes),
      moved: exception?.type === "moved",
    });
  }

  return occurrences;
}
