/**
 * Build Task Event
 *
 * Resolves category wrapper ID and builds the SimpleEvent for a scheduled task.
 */

import { Planner, SimpleEvent, EventType } from "@/types/prisma";
import { SchedulingContext } from "../../models/SchedulingModels";
import { v4 as uuidv4 } from "uuid";
import { calendarColors } from "@/data/calendarColors";
import { stabilizeEvent } from "../EventAssembler/stabilizeEvent";

export function buildTaskEvent(
  task: Planner,
  taskStartDate: Date,
  taskEndDate: Date,
  context: SchedulingContext,
): SimpleEvent {
  const now = new Date();

  // Check if this task is within a category time slot and get the wrapper ID
  let categoryWrapperId: string | null = null;

  const effectiveCategoryId =
    context.plannerCategoryMap?.get(task.id) ?? task.categoryId;

  if (effectiveCategoryId && context.categories) {
    const constraint = context.categories.get(effectiveCategoryId);

    if (constraint && constraint.timeSlots.length > 0) {
      // Task is in a category with time constraints
      // Generate wrapper ID based on category, day, and time slot
      const dayOfWeek = taskStartDate.getDay();
      const timeSlots = constraint.timeSlots;

      for (const slot of timeSlots) {
        if (slot.day === dayOfWeek) {
          const startTime = `${String(taskStartDate.getHours()).padStart(2, "0")}:${String(
            taskStartDate.getMinutes(),
          ).padStart(2, "0")}`;

          if (startTime >= slot.startTime && startTime < slot.endTime) {
            // This task falls within this category slot
            categoryWrapperId = `${constraint.id}-${dayOfWeek}-${slot.startTime}-${slot.endTime}`;
            break;
          }
        }
      }
    }
  }

  // Create the main task event (travel events are created at the end from travel slots)
  // Build extendedProps with only schema fields, then add runtime fields
  const baseExtendedProps = {
    id: uuidv4(),
    eventId: task.id,
    plannerType: task.plannerType,
    eventType: EventType.planner,
    completedEndTime: null,
    completedStartTime: null,
    parentId: task.parentId || null,
  };

  const event: SimpleEvent = {
    userId: context.userId,
    id: task.id,
    title: task.title,
    start: taskStartDate.toISOString(),
    end: taskEndDate.toISOString(),
    extendedProps: categoryWrapperId
      ? { ...baseExtendedProps, categoryWrapperId }
      : baseExtendedProps,
    backgroundColor: (task.color as string) || calendarColors[0],
    borderColor: "transparent",
    duration: null,
    rrule: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return stabilizeEvent(event, context.previousCalendarById?.get(task.id));
}
