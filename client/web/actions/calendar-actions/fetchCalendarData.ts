"use server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  SimpleEvent,
  EventTemplate,
  Planner,
  Category,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  PlannerDependency,
} from "@/types/prisma";
import { weekdayToInt } from "@/utils/calendarUtils";
import type { WeekDayIntegers } from "@/types/calendarTypes";

// Fetches the raw data from the database for the authenticated user.
export async function fetchCalendarData() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    // Fetch the user's dataVersion alongside the rest of the bootstrap data.
    // The client seeds its OCC token from this so the first sync after page
    // load carries an accurate version.
    const userRow = await db.user.findUnique({
      where: { id: userId },
      select: { dataVersion: true },
    });

    // Fetch all planner items for the user
    const planner: Planner[] = await db.planner.findMany({
      where: {
        userId: userId,
      },
    });

    // Fetch all calendar events for the user
    const calendarEvents: SimpleEvent[] = await db.simpleEvent.findMany({
      where: {
        userId: userId,
      },
      include: { extendedProps: true },
    });

    const templatesRaw = await db.eventTemplate.findMany({
      where: {
        userId: userId,
      },
    });
    // Narrow startDay: DB enum string -> WeekDayIntegers for app code.
    const templatesItems: EventTemplate[] = templatesRaw.map((t) => ({
      ...t,
      startDay: weekdayToInt(t.startDay),
    }));

    const categoriesRaw = await db.category.findMany({
      where: {
        userId: userId,
      },
      include: { timeSlots: true, location: true },
    });

    const categoryEvents: CategoryEvent[] = await db.categoryEvent.findMany({
      where: { userId },
    });

    const travelEvents: TravelEvent[] = await db.travelEvent.findMany({
      where: { userId },
    });

    const engineMessages: EngineMessage[] = await db.engineMessage.findMany({
      where: { userId },
    });

    const queues: Queue[] = await db.queue.findMany({
      where: { userId },
      include: { members: true },
    });

    const dependencies: PlannerDependency[] =
      await db.plannerDependency.findMany({
        where: { userId },
      });

    // Narrow timeSlots.day at the DB boundary and serialize location Dates
    // to avoid Redux non-serializable warnings.
    const categories: Category[] = categoriesRaw.map((cat) => ({
      ...cat,
      timeSlots: cat.timeSlots.map((ts) => ({
        ...ts,
        day: ts.day as WeekDayIntegers,
      })),
      location: cat.location
        ? {
            ...cat.location,
            createdAt: cat.location.createdAt.toISOString(),
            updatedAt: cat.location.updatedAt.toISOString(),
          }
        : null,
    }));

    return {
      success: true as const,
      data: {
        planner: planner,
        calendar: calendarEvents,
        template: templatesItems,
        categories: categories,
        categoryEvents: categoryEvents,
        travelEvents: travelEvents,
        engineMessages: engineMessages,
        queues: queues,
        dependencies: dependencies,
        dataVersion: userRow?.dataVersion ?? 0,
      },
    };
  } catch (error) {
    // Log the real error server-side; never return raw error objects across
    // the action boundary (leaks internals + non-serializable warnings).
    console.error("Failed to fetch calendar data:", error);
    return {
      success: false as const,
      error: "Failed to fetch calendar data",
    };
  }
}
