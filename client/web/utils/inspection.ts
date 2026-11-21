import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  Category,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  PlannerDependency,
  ExternalCalendarSource,
  ExternalEvent,
  OccurrenceCompletion,
  HabitBucket,
  Habit,
  HabitItem,
} from "@/types/prisma";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import type { WeekDayIntegers } from "@/types/calendarTypes";
import type { WeekDayType, TransportMode } from "@/generated/client";
import { weekdayToInt, normalizeWeekStartDay } from "@/utils/calendarUtils";

// Snapshot impersonation (admin debugging). The target lives in
// sessionStorage — per tab, cleared on exit — and is read ONCE per provider
// mount, before the normal bootstrap effects run. While a target is set the
// app hydrates Redux from the stored FeedbackReport snapshot instead of the
// admin's own account, and the OCC diff sync is hard-disabled so nothing on
// screen can ever be written back to the admin's rows.

const STORAGE_KEY = "circadium.inspect";

export interface InspectionTarget {
  reportId: string;
  label: string;
}

export function readInspectionTarget(): InspectionTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InspectionTarget>;
    if (typeof parsed.reportId !== "string" || parsed.reportId.length === 0) {
      return null;
    }
    return {
      reportId: parsed.reportId,
      label: typeof parsed.label === "string" ? parsed.label : "snapshot",
    };
  } catch {
    return null;
  }
}

export function startInspection(target: InspectionTarget): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
  window.location.assign("/dashboard");
}

export function exitInspection(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

export interface InspectionData {
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
  preferences: {
    bufferTimeMinutes: number;
    weekStartDay: WeekDayIntegers;
    defaultTransportMode: TransportMode;
  } | null;
  externalSources: ExternalCalendarSource[];
  externalEvents: ExternalEvent[];
  occurrenceCompletions: OccurrenceCompletion[];
  habits: { buckets: HabitBucket[]; habits: Habit[]; items: HabitItem[] };
}

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

// Maps a circadium.data-export.v1 blob into the exact shapes the Redux slices
// hydrate from. Lenient by design: a missing collection renders empty rather
// than failing the whole inspection.
export function snapshotToInspectionData(
  blob: Record<string, unknown>,
): InspectionData {
  const templates = asArray<Record<string, unknown>>(
    blob.weeklyTemplates,
  ).map((row) => ({
    ...row,
    startDay:
      typeof row.startDay === "string"
        ? weekdayToInt(row.startDay as WeekDayType)
        : row.startDay,
  })) as unknown as EventTemplate[];

  const locations = asArray<Record<string, unknown>>(blob.locations).map(
    (row) => ({
      id: asString(row.id),
      name: asString(row.name),
      address: asString(row.address),
      placeId: asString(row.placeId),
    }),
  );

  const travelTimes = asArray<Record<string, unknown>>(blob.travelTimes).map(
    (row) =>
      ({
        id: row.id,
        fromLocationId: row.fromLocationId,
        toLocationId: row.toLocationId,
        transportMode: row.transportMode,
        googleRushHourMinutes: row.googleRushHourMinutes,
        googleRegularMinutes: row.googleRegularMinutes,
        googleNightMinutes: row.googleNightMinutes,
        customRushHourMinutes: row.customRushHourMinutes ?? null,
        customRegularMinutes: row.customRegularMinutes ?? null,
        customNightMinutes: row.customNightMinutes ?? null,
        unroutable: row.unroutableAt != null,
      }) as SerializedTravelTime,
  );

  const rawPreferences =
    blob.schedulingPreferences && typeof blob.schedulingPreferences === "object"
      ? (blob.schedulingPreferences as Record<string, unknown>)
      : null;
  const preferences = rawPreferences
    ? {
        bufferTimeMinutes:
          typeof rawPreferences.bufferTimeMinutes === "number"
            ? rawPreferences.bufferTimeMinutes
            : 10,
        weekStartDay: normalizeWeekStartDay(
          typeof rawPreferences.weekStartDay === "number"
            ? rawPreferences.weekStartDay
            : 1,
        ),
        defaultTransportMode: (typeof rawPreferences.defaultTransportMode ===
        "string"
          ? rawPreferences.defaultTransportMode
          : "DRIVING") as TransportMode,
      }
    : null;

  return {
    planner: asArray<Planner>(blob.planners),
    calendar: asArray<SimpleEvent>(blob.calendarEvents),
    template: templates,
    categories: asArray<Category>(blob.categories),
    categoryEvents: asArray<CategoryEvent>(blob.categoryEvents),
    travelEvents: asArray<TravelEvent>(blob.travelEvents),
    engineMessages: asArray<EngineMessage>(blob.engineMessages),
    queues: asArray<Queue>(blob.queues),
    dependencies: asArray<PlannerDependency>(blob.dependencies),
    locations,
    travelTimes,
    preferences,
    externalSources: asArray<ExternalCalendarSource>(
      blob.externalCalendarSources,
    ),
    externalEvents: asArray<ExternalEvent>(blob.externalCalendarEvents),
    occurrenceCompletions: asArray<OccurrenceCompletion>(
      blob.occurrenceCompletions,
    ),
    habits: {
      buckets: asArray<HabitBucket>(blob.habitBuckets),
      habits: asArray<Habit>(blob.habits),
      items: asArray<HabitItem>(blob.habitItems),
    },
  };
}
