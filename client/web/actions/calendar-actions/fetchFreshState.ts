// NOT a server action on purpose: this module is only called server-side with
// an already-authenticated userId (syncCalendarData's stale path). Exposing it
// with "use server" would make it a public endpoint that reads arbitrary
// users' data by id.
import { db } from "@/lib/db";
import { weekdayToInt } from "@/utils/calendarUtils";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type {
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
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";

// Snapshot of every piece of state the sync hook is responsible for keeping
// coherent — returned to the client when a sync is rejected as stale so the
// client can replace Redux + refs wholesale and resume from the new baseline.
// Mirrors the shape that initializeState + the locations/travelTimes bootstrap
// dispatch into Redux.
export type FreshState = {
  dataVersion: number;
  planner: Planner[];
  calendar: SimpleEvent[];
  template: EventTemplate[];
  categories: Category[];
  categoryEvents: CategoryEvent[];
  travelEvents: TravelEvent[];
  engineMessages: EngineMessage[];
  queues: Queue[];
  dependencies: PlannerDependency[];
  locations: SerializedLocation[];
  travelTimes: SerializedTravelTime[];
};

export async function fetchFreshState(userId: string): Promise<FreshState> {
  const [
    user,
    planner,
    calendarEvents,
    templatesRaw,
    categoriesRaw,
    categoryEvents,
    travelEvents,
    engineMessages,
    queues,
    dependencies,
    locations,
    travelTimes,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { dataVersion: true },
    }),
    db.planner.findMany({ where: { userId } }),
    db.simpleEvent.findMany({
      where: { userId },
      include: { extendedProps: true },
    }),
    db.eventTemplate.findMany({ where: { userId } }),
    db.category.findMany({
      where: { userId },
      include: { timeSlots: true, location: true },
    }),
    db.categoryEvent.findMany({ where: { userId } }),
    db.travelEvent.findMany({ where: { userId } }),
    db.engineMessage.findMany({ where: { userId } }),
    db.queue.findMany({ where: { userId }, include: { members: true } }),
    db.plannerDependency.findMany({ where: { userId } }),
    db.location.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, address: true, placeId: true },
    }),
    db.travelTime.findMany({ where: { userId } }),
  ]);

  const template: EventTemplate[] = templatesRaw.map((t) => ({
    ...t,
    startDay: weekdayToInt(t.startDay),
  }));

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

  const allTravelTimes: SerializedTravelTime[] = travelTimes.map((tt) => ({
    id: tt.id,
    fromLocationId: tt.fromLocationId,
    toLocationId: tt.toLocationId,
    transportMode: tt.transportMode,
    googleRushHourMinutes: tt.googleRushHourMinutes,
    googleRegularMinutes: tt.googleRegularMinutes,
    googleNightMinutes: tt.googleNightMinutes,
    customRushHourMinutes: tt.customRushHourMinutes,
    customRegularMinutes: tt.customRegularMinutes,
    customNightMinutes: tt.customNightMinutes,
    unroutable: tt.unroutableAt !== null,
  }));

  return {
    dataVersion: user?.dataVersion ?? 0,
    planner,
    calendar: calendarEvents,
    template,
    categories,
    categoryEvents,
    travelEvents,
    engineMessages,
    queues,
    dependencies,
    locations,
    travelTimes: allTravelTimes,
  };
}
