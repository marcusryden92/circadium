import {
  EventType,
  type Category,
  type CategoryEvent,
} from "../../contracts";
import type { CategoryCalendarEvent } from "./calendarEvent";

// Joins each persisted CategoryEvent with its Category at render time for
// color, name and strict mode. Those fields stay on Category so renaming or
// recoloring doesn't require bulk-updating every materialized occurrence row.
export function categoryEventsToCalendarEvents(
  categoryEvents: CategoryEvent[],
  categories: Pick<Category, "id" | "name" | "color" | "isStrict">[],
): CategoryCalendarEvent[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return categoryEvents.map((event) => {
    const category = categoryById.get(event.categoryId);
    const categoryName = category?.name ?? "Category";
    return {
      kind: EventType.category,
      id: event.id,
      title: `${categoryName} Time Slot`,
      start: new Date(event.start),
      end: new Date(event.end),
      editable: false,
      categoryId: event.categoryId,
      categoryName,
      categoryColor: category?.color ?? null,
      isStrict: category?.isStrict ?? false,
      trespassingStart: event.trespassingStart,
      trespassingEnd: event.trespassingEnd,
    };
  });
}
