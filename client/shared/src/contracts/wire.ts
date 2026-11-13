// Over-the-wire shapes: the bootstrap payload, the OCC sync request/response,
// and the DatabaseChanges diff. These describe the contract between the client
// and whichever backend serves it (Next server actions today, the Java API
// later). The web package conforms them against the live action signatures.

import type { TransportMode } from "./enums";
import type {
  Planner,
  SimpleEvent,
  EventTemplate,
  EventExtendedProps,
  Category,
  CategoryRow,
  CategoryTimeWindow,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  QueueRow,
  QueueMember,
  PlannerDependency,
} from "./models";

// Editable own-row fields only: address/lat/lng/placeId are server-
// authoritative (Google Places) and never flow back from the client.
export interface SerializedLocation {
  id: string;
  name: string;
  address: string;
  placeId: string;
}

// The full travel-time row the Locations UI needs, serialized for Redux.
export interface SerializedTravelTime {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  transportMode: TransportMode;
  googleRushHourMinutes: number;
  googleRegularMinutes: number;
  googleNightMinutes: number;
  customRushHourMinutes: number | null;
  customRegularMinutes: number | null;
  customNightMinutes: number | null;
  unroutable: boolean;
}

export interface ChangeGroup<T> {
  create: T[];
  update: T[];
  destroy: T[];
}

export interface DatabaseChanges {
  planner: ChangeGroup<Planner>;
  calendar: ChangeGroup<Omit<SimpleEvent, "extendedProps">>;
  template: ChangeGroup<EventTemplate>;
  extendedProps: ChangeGroup<EventExtendedProps>;
  category: ChangeGroup<CategoryRow>;
  categoryTimeWindow: ChangeGroup<CategoryTimeWindow>;
  categoryEvent: ChangeGroup<CategoryEvent>;
  travelEvent: ChangeGroup<TravelEvent>;
  engineMessage: ChangeGroup<EngineMessage>;
  queue: ChangeGroup<QueueRow>;
  queueMember: ChangeGroup<QueueMember>;
  dependency: ChangeGroup<PlannerDependency>;
  location: ChangeGroup<SerializedLocation>;
  travelTime: ChangeGroup<SerializedTravelTime>;
}

// Everything the client needs to stand up (and to recover from a stale sync):
// the fetchCalendarData payload plus locations + travelTimes.
export interface BootstrapPayload {
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
}

export interface SyncRequest {
  changes: DatabaseChanges;
  clientKnownDataVersion: number;
}

export type SyncResponse =
  | { success: true; newDataVersion: number }
  | { success: false; reason: "stale"; freshState: BootstrapPayload }
  | { success: false; reason: "error"; error: string };
