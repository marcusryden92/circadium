/**
 * Location Map Builder
 *
 * Builds location map for location-aware slot building
 */

import { Planner, EventTemplate, Category } from "@/types/prisma";
import { buildLocationMap as buildLocationMapImpl } from "../LocationMapper";

export function buildLocationMap(
  planners: Planner[],
  templates: EventTemplate[],
  categories: Category[],
): Map<string, string | null> {
  const categoryLocationMap = new Map<string, string | null>(
    categories.map((c) => [c.id, c.locationId ?? null]),
  );
  const plannerMap = new Map(planners.map((p) => [p.id, p]));
  return buildLocationMapImpl(
    planners,
    templates,
    categoryLocationMap,
    plannerMap,
  );
}
