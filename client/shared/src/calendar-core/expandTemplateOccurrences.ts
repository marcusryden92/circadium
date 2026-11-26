import { addDays, addMinutes, addWeeks } from "date-fns";
import type { EventTemplate } from "../contracts";
import {
  occurrenceKey,
  parseRecurrenceExceptions,
  type PlanOccurrenceException,
} from "../domain/planRecurrence";
import { startDayAsInt } from "./weekStructure";

// A template recurs weekly on its fixed startDay/startTime for `duration`
// minutes. Every renderer expands templates through this one function, so the
// tiles any surface draws are the same occurrences. Occurrences are keyed by
// the local wall-clock of their rule position — the same key the planner's
// recurrence model uses — so moved and deleted exceptions line up with the
// engine's view of the week.
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

// Half-open overlap with [rangeStart, rangeEnd). A zero-length span counts
// when it starts inside the range, so a degenerate occurrence is not lost.
function overlapsRange(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const startMs = start.getTime();
  if (!(startMs < rangeEnd.getTime())) return false;
  return end.getTime() > rangeStart.getTime() || startMs >= rangeStart.getTime();
}

// Returns every occurrence whose span overlaps [rangeStart, rangeEnd), sorted
// by start. An overnight occurrence that began before rangeStart is included,
// and a moved occurrence is included wherever its new span lands, regardless of
// where its rule position falls.
export function expandTemplateOccurrences(args: {
  template: EventTemplate;
  rangeStart: Date;
  rangeEnd: Date;
}): TemplateOccurrence[] {
  const { template, rangeStart, rangeEnd } = args;

  const [hours, minutes] = template.startTime.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return [];

  const startDay = startDayAsInt(template);

  const exceptions: PlanOccurrenceException[] = parseRecurrenceExceptions(
    template.recurrenceExceptions,
  );
  // Any exception takes its key out of the series: deleted ones vanish, moved
  // ones are emitted from the exception list below.
  const exceptionKeys = new Set(exceptions.map((e) => e.key));

  const occurrences: TemplateOccurrence[] = [];

  // Anchor far enough back that an occurrence still running at rangeStart is
  // reached: the template's weekday at startTime, on or before
  // rangeStart - duration. date-fns add* steps preserve local wall-clock across
  // DST, which also keeps keys deterministic.
  let anchor = addMinutes(rangeStart, -template.duration);
  anchor.setHours(hours, minutes, 0, 0);
  const backShift = (anchor.getDay() - startDay + 7) % 7;
  anchor = addDays(anchor, -backShift);

  for (let n = 0; n < MAX_TEMPLATE_OCCURRENCES; n++) {
    const ruleStart = addWeeks(anchor, n);
    if (ruleStart.getTime() >= rangeEnd.getTime()) break;
    const ruleEnd = addMinutes(ruleStart, template.duration);
    if (!overlapsRange(ruleStart, ruleEnd, rangeStart, rangeEnd)) continue;

    const key = occurrenceKey(ruleStart);
    if (exceptionKeys.has(key)) continue;

    occurrences.push({
      key,
      templateId: template.id,
      title: template.title,
      start: ruleStart,
      end: ruleEnd,
      moved: false,
    });
  }

  for (const exception of exceptions) {
    if (exception.type !== "moved") continue;
    const start = new Date(exception.newStart);
    const end = addMinutes(
      start,
      exception.durationMinutes ?? template.duration,
    );
    if (!overlapsRange(start, end, rangeStart, rangeEnd)) continue;
    occurrences.push({
      key: exception.key,
      templateId: template.id,
      title: template.title,
      start,
      end,
      moved: true,
    });
  }

  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
  return occurrences;
}
