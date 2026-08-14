import { SimpleEvent, EventType } from "@/types/prisma";
import { RuntimeEventExtendedProps } from "@/types/ui";
import {
  detectTrespassingEvents,
  IntervalWithId,
  TrespassingInfo,
} from "../../utils/intervalUtils";
import { plannerIdFromEventId } from "../../../planRecurrence";

// A concrete template occurrence acting as an unmarkable obstacle: template
// tiles render from EventTemplate config (no flags to carry), so the planner
// side of a conflict gets the border and the pair still emits a console row.
export interface TemplateObstacle {
  templateId: string;
  start: Date;
  end: Date;
  locationId: string | null;
}

// One detected different-location overlap, planner ids resolved from
// composite event ids so recurring occurrences fold per source row.
export interface LocationOverlap {
  firstKind: "planner" | "template";
  firstId: string;
  secondKind: "planner" | "template";
  secondId: string;
  firstLocationId: string | null;
  secondLocationId: string | null;
  overlapStart: string;
}

export function markTrespassingEvents(
  events: SimpleEvent[],
  plannerLocationMap: Map<string, string | null>,
  templateObstacles: TemplateObstacle[] = [],
): LocationOverlap[] {
  const plannerIdByEventId = new Map<string, string>();
  const intervals: IntervalWithId[] = events
    .filter(
      (e) =>
        e.extendedProps?.eventType !== EventType.travel &&
        e.extendedProps?.eventType !== EventType.category,
    )
    .map((e) => {
      const plannerId = plannerIdFromEventId(
        (e.extendedProps as { eventId?: string })?.eventId || e.id,
      );
      plannerIdByEventId.set(e.id, plannerId);
      const locationId = plannerLocationMap.get(plannerId) ?? null;

      return {
        start: new Date(e.start),
        end: new Date(e.end),
        startLocationId: locationId,
        endLocationId: locationId,
        eventId: e.id,
      };
    });

  const { borders, pairs } = detectTrespassingEvents(intervals);

  const overlaps: LocationOverlap[] = pairs
    .filter((p) => p.a.eventId && p.b.eventId)
    .map((p) => ({
      firstKind: "planner" as const,
      firstId: plannerIdByEventId.get(p.a.eventId!) ?? p.a.eventId!,
      secondKind: "planner" as const,
      secondId: plannerIdByEventId.get(p.b.eventId!) ?? p.b.eventId!,
      firstLocationId: p.a.startLocationId ?? null,
      secondLocationId: p.b.startLocationId ?? null,
      overlapStart: p.overlapStart.toISOString(),
    }));

  const flagFor = (eventId: string): TrespassingInfo => {
    let info = borders.get(eventId);
    if (!info) {
      info = { eventId, trespassingStart: false, trespassingEnd: false };
      borders.set(eventId, info);
    }
    return info;
  };

  for (const interval of intervals) {
    if (!interval.eventId || !interval.startLocationId) continue;
    const start = interval.start.getTime();
    const end = interval.end.getTime();
    for (const obstacle of templateObstacles) {
      if (!obstacle.locationId) continue;
      if (obstacle.locationId === interval.startLocationId) continue;
      const obsStart = obstacle.start.getTime();
      const obsEnd = obstacle.end.getTime();
      if (start >= obsEnd || end <= obsStart) continue;

      // Mark whichever of the planner event's edges lie inside the template
      // occurrence; a template nested fully inside the event marks neither
      // edge but still reports the pair.
      const info = flagFor(interval.eventId);
      if (start >= obsStart) info.trespassingStart = true;
      if (end <= obsEnd) info.trespassingEnd = true;

      overlaps.push({
        firstKind: "planner",
        firstId: plannerIdByEventId.get(interval.eventId) ?? interval.eventId,
        secondKind: "template",
        secondId: obstacle.templateId,
        firstLocationId: interval.startLocationId,
        secondLocationId: obstacle.locationId,
        overlapStart: new Date(Math.max(start, obsStart)).toISOString(),
      });
    }
  }

  // Stamp explicit flags on every event: a resolved overlap clears its stale
  // persisted flags, and fresh builds gain explicit booleans so the sync diff
  // never compares a flagless object against a DB row that carries them.
  // Events whose explicit flags already match keep their identity.
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.extendedProps) continue;

    const info = borders.get(event.id);
    const desiredStart = info?.trespassingStart ?? false;
    const desiredEnd = info?.trespassingEnd ?? false;
    const ext = event.extendedProps as RuntimeEventExtendedProps;
    if (
      ext.trespassingStart === desiredStart &&
      ext.trespassingEnd === desiredEnd
    ) {
      continue;
    }

    events[i] = {
      ...event,
      extendedProps: {
        ...ext,
        trespassingStart: desiredStart,
        trespassingEnd: desiredEnd,
      },
    };
  }

  return overlaps;
}
