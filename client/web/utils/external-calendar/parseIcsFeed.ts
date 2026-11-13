// Server-only: node-ical is a Node package. Import this module from server
// actions exclusively — never from client components or the engine worker.
import ical, { type VEvent, type ParameterValue } from "node-ical";
import type { ExternalEvent } from "@/types/prisma";

interface ParseIcsArgs {
  icsText: string;
  sourceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
}

function summaryText(summary: ParameterValue | undefined): string {
  if (typeof summary === "string") return summary;
  if (summary && typeof summary.val === "string") return summary.val;
  return "Untitled event";
}

function isCancelled(event: Pick<VEvent, "status">): boolean {
  return event.status === "CANCELLED";
}

interface Occurrence {
  start: Date;
  end: Date;
  allDay: boolean;
  title: string;
}

function singleEventOccurrence(event: VEvent): Occurrence | null {
  const start = event.start;
  if (!(start instanceof Date) || isNaN(start.getTime())) return null;
  const allDay = event.datetype === "date";
  let end = event.end instanceof Date ? new Date(event.end) : null;
  if (!end || isNaN(end.getTime())) {
    // RFC 5545 default: date-only events span one day, timed events are
    // zero-length (dropped by the end > start guard below).
    end = allDay ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : start;
  }
  return { start, end, allDay, title: summaryText(event.summary) };
}

/**
 * Parse an ICS feed into ExternalEvent rows: recurring events expanded into
 * concrete occurrences inside [windowStart, windowEnd] (overrides + EXDATEs
 * applied by node-ical), cancelled events skipped, deterministic ids
 * `${sourceId}|${uid}|${occurrenceStartISO}`.
 */
export function parseIcsFeed({
  icsText,
  sourceId,
  userId,
  windowStart,
  windowEnd,
}: ParseIcsArgs): { events: ExternalEvent[]; calendarName: string | null } {
  const parsed = ical.sync.parseICS(icsText);
  const calendarName = parsed.vcalendar?.["WR-CALNAME"] ?? null;
  const byId = new Map<string, ExternalEvent>();

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    const event: VEvent = component;
    if (isCancelled(event)) continue;

    let occurrences: Occurrence[] = [];
    try {
      if (event.rrule) {
        occurrences = ical
          .expandRecurringEvent(event, { from: windowStart, to: windowEnd })
          .filter((instance) => !isCancelled(instance.event))
          .map((instance) => ({
            start: instance.start,
            end: instance.end,
            allDay: instance.isFullDay,
            title: summaryText(instance.summary),
          }));
      } else {
        const single = singleEventOccurrence(event);
        if (single) occurrences = [single];
      }
    } catch {
      // A malformed rule poisons only its own event, never the whole feed.
      continue;
    }

    for (const occurrence of occurrences) {
      if (occurrence.end.getTime() <= occurrence.start.getTime()) continue;
      if (
        occurrence.start >= windowEnd ||
        occurrence.end <= windowStart
      ) {
        continue;
      }
      const startIso = occurrence.start.toISOString();
      const id = `${sourceId}|${event.uid}|${startIso}`;
      byId.set(id, {
        id,
        sourceId,
        userId,
        uid: event.uid,
        title: occurrence.title,
        start: startIso,
        end: occurrence.end.toISOString(),
        allDay: occurrence.allDay,
      });
    }
  }

  return {
    events: [...byId.values()].sort((a, b) => a.start.localeCompare(b.start)),
    calendarName,
  };
}
