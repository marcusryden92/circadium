import type { EventInput } from "@fullcalendar/core/index.js";
import { Category, CategoryEvent, EventType } from "@/types/prisma";
import { vars } from "@/lib/theme";

// Converts persisted CategoryEvent rows into FullCalendar EventInput. Joins
// each event with its parent Category at render time to get color, name, and
// strict-mode — fields stay on Category so renaming/recoloring doesn't
// require bulk-updating every materialized occurrence row.
export function categoryEventsToEventInput(
  categoryEvents: CategoryEvent[],
  categories: Category[],
): EventInput[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return categoryEvents.map((event) => {
    const category = categoryById.get(event.categoryId);
    const categoryName = category?.name ?? "Category";
    const categoryColor = category?.color ?? null;
    const isStrict = category?.isStrict ?? false;

    return {
      id: event.id,
      title: `${categoryName} Time Slot`,
      start: event.start,
      end: event.end,
      backgroundColor: categoryColor ?? vars.accent.primary,
      borderColor: categoryColor ?? vars.accent.primary,
      display: "background",
      editable: false,
      extendedProps: {
        eventType: EventType.category,
        eventId: "",
        plannerType: null,
        completedStartTime: null,
        completedEndTime: null,
        parentId: null,
        categoryId: event.categoryId,
        categoryName,
        categoryColor,
        isStrict,
        wrapperId: event.id,
        trespassingStart: event.trespassingStart,
        trespassingEnd: event.trespassingEnd,
      },
    } satisfies EventInput;
  });
}
