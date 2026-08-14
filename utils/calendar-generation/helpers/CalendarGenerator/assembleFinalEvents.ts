/**
 * Final Event Assembly
 *
 * Assembles all events into final calendar output
 */

import {
  SimpleEvent,
  Category,
  CategoryEvent,
  TravelEvent,
} from "@/types/prisma";
import { TravelManager } from "../../core/TravelManager";
import {
  LoggingConfig,
  SchedulingContext,
} from "../../models/SchedulingModels";
import { Slot } from "../../models/TimeSlot";
import {
  masksToIntervals,
  type PerTemplateMask,
} from "../../utils/intervalUtils";
import {
  buildCategoryEvents,
  markTrespassingEvents,
  assembleFinalEventList,
  stampCategoryEventBorders,
  type TemplateObstacle,
  type LocationOverlap,
} from "../EventAssembler";

export function assembleFinalEvents(
  userId: string,
  travelManager: TravelManager,
  context: SchedulingContext,
  scheduledCategories: Category[],
  startDate: Date,
  endDate: Date,
  plannerLocationMap: Map<string, string | null>,
  slots: Slot[],
  perTemplateMasks: PerTemplateMask[] = [],
  logging?: LoggingConfig,
): {
  events: SimpleEvent[];
  categoryEvents: CategoryEvent[];
  travelEvents: TravelEvent[];
  locationOverlaps: LocationOverlap[];
} {
  const travelEvents = travelManager.generateTravelEvents(userId);

  if (logging?.travelDebug) {
    // Group travel events by date to spot duplicates. Respects the logging
    // date range so noisy days can be filtered out.
    const travelEventsForLog = travelEvents.filter((te) => {
      const start = new Date(te.start);
      if (logging.dateRangeStart && start < logging.dateRangeStart) return false;
      if (logging.dateRangeEnd && start > logging.dateRangeEnd) return false;
      return true;
    });
    const travelByDate = new Map<string, typeof travelEventsForLog>();
    for (const te of travelEventsForLog) {
      const dateKey = te.start.slice(0, 10);
      if (!travelByDate.has(dateKey)) travelByDate.set(dateKey, []);
      travelByDate.get(dateKey)!.push(te);
    }
    for (const [date, travels] of [...travelByDate.entries()].sort()) {
      console.log(`[travel] ${date}:`);
      for (const t of travels.sort((a, b) => a.start.localeCompare(b.start))) {
        const from = t.fromLocationId ?? "?";
        const to = t.toLocationId ?? "?";
        console.log(
          `  ${t.start.slice(11, 16)}-${t.end.slice(11, 16)} ${from} → ${to}`,
        );
      }
    }
  }

  const events = assembleFinalEventList(context.scheduledEvents);

  // Template occurrences aren't part of the assembled list (they render from
  // EventTemplate config), so item-over-template conflicts re-enter detection
  // as concrete obstacle intervals — the same masksToIntervals expansion the
  // slot fabric uses, so the two can never disagree on which occurrences
  // exist. Anywhere templates never conflict; skip expanding them.
  const templateObstacles: TemplateObstacle[] = perTemplateMasks.flatMap(
    (mask) =>
      mask.locationId
        ? masksToIntervals([mask], startDate, endDate).map((interval) => ({
            templateId: mask.templateId,
            start: interval.start,
            end: interval.end,
            locationId: mask.locationId ?? null,
          }))
        : [],
  );

  const locationOverlaps = markTrespassingEvents(
    events,
    plannerLocationMap,
    templateObstacles,
  );

  const categoryEvents = buildCategoryEvents(
    userId,
    scheduledCategories,
    startDate,
    endDate,
  );

  // Stamp trespass borders on the persisted CategoryEvents. Engine decisions
  // (strict-category trespass + travel slot consumption) land directly on the
  // row so the renderer reads it on cold load without re-running the engine.
  stampCategoryEventBorders(categoryEvents, slots);

  return { events, categoryEvents, travelEvents, locationOverlaps };
}
