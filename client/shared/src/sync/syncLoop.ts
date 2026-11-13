// The OCC sync loop, lifted host-agnostic out of useCalendarServerSync. It owns
// the serialization guard (one sync in flight; a second request queues a
// re-run), the stale/error/transport-failure branches, and transport-level
// retry with backoff. Everything host-specific — where the baseline lives, how
// outcomes are applied to the store — is injected through SyncLoopPorts, and
// the backend call is the injected SyncTransport (web wraps the server action,
// the Java fetch is swapped in at item 1.13).

import {
  handleServerTransaction,
  type SyncInputs,
  type SyncTransport,
} from "./compareCalendarData";
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
  SerializedLocation,
  SerializedTravelTime,
  BootstrapPayload,
} from "../contracts";

// Backoff schedule for transport-level sync failures (request never reached
// the server, or the response was lost). Server-side rejections don't retry.
export const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

// Every piece of state the sync is responsible for keeping coherent. Both the
// live client state and the last server-confirmed baseline take this shape.
export interface SyncSnapshot {
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

export interface SyncLoopPorts {
  transport: SyncTransport;
  // Latest client state to diff.
  getSnapshot: () => SyncSnapshot;
  // Last server-confirmed baseline (the "previous" refs in the web hook).
  getBaseline: () => SyncSnapshot;
  // OCC token the server gates each sync against.
  getDataVersion: () => number;
  // Hard off-switch (snapshot impersonation): skip syncing entirely.
  isDisabled?: () => boolean;
  // Sync accepted: advance the baseline to the snapshot that was sent and the
  // dataVersion to the server's new value, and flash the save indicator.
  onSuccess: (sent: SyncSnapshot, newDataVersion: number) => void;
  // Sync rejected as stale (another writer moved the version forward): adopt
  // the server's fresh snapshot wholesale.
  onStale: (fresh: BootstrapPayload) => void;
  // Server received the diff and rejected it: snap back to the last confirmed
  // baseline rather than diverging further.
  onError: () => void;
  retryDelaysMs?: number[];
}

export interface SyncLoop {
  runSync: () => Promise<void>;
  dispose: () => void;
}

// JSON-equality per group — the exact check the web hook used to gate the
// debounce. A single stringify of the whole snapshot would also work, but the
// per-group form keeps a huge calendar array from being re-serialized when only
// a tiny group changed, and makes a mismatch's origin obvious when debugging.
export function hasPendingChanges(
  current: SyncSnapshot,
  baseline: SyncSnapshot,
): boolean {
  return !(
    JSON.stringify(baseline.planner) === JSON.stringify(current.planner) &&
    JSON.stringify(baseline.calendar) === JSON.stringify(current.calendar) &&
    JSON.stringify(baseline.template) === JSON.stringify(current.template) &&
    JSON.stringify(baseline.categories) ===
      JSON.stringify(current.categories) &&
    JSON.stringify(baseline.categoryEvents) ===
      JSON.stringify(current.categoryEvents) &&
    JSON.stringify(baseline.travelEvents) ===
      JSON.stringify(current.travelEvents) &&
    JSON.stringify(baseline.engineMessages) ===
      JSON.stringify(current.engineMessages) &&
    JSON.stringify(baseline.queues) === JSON.stringify(current.queues) &&
    JSON.stringify(baseline.dependencies) ===
      JSON.stringify(current.dependencies) &&
    JSON.stringify(baseline.locations) === JSON.stringify(current.locations) &&
    JSON.stringify(baseline.travelTimes) === JSON.stringify(current.travelTimes)
  );
}

function buildSyncInputs(
  current: SyncSnapshot,
  previous: SyncSnapshot,
): SyncInputs {
  return {
    planner: { current: current.planner, previous: previous.planner },
    calendar: { current: current.calendar, previous: previous.calendar },
    template: { current: current.template, previous: previous.template },
    categories: { current: current.categories, previous: previous.categories },
    categoryEvents: {
      current: current.categoryEvents,
      previous: previous.categoryEvents,
    },
    travelEvents: {
      current: current.travelEvents,
      previous: previous.travelEvents,
    },
    engineMessages: {
      current: current.engineMessages,
      previous: previous.engineMessages,
    },
    queues: { current: current.queues, previous: previous.queues },
    dependencies: {
      current: current.dependencies,
      previous: previous.dependencies,
    },
    locations: { current: current.locations, previous: previous.locations },
    travelTimes: {
      current: current.travelTimes,
      previous: previous.travelTimes,
    },
  };
}

export function createSyncLoop(ports: SyncLoopPorts): SyncLoop {
  const retryDelays = ports.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const isDisabled = ports.isDisabled ?? (() => false);

  // Serialization guard. The debounce only cancels unfired timers; once a sync
  // is in flight, a second one dispatched in parallel would read the pre-bump
  // dataVersion, get rejected as stale, and wholesale-adopt a server snapshot
  // that lacks the newer edit — silent data loss with no actual concurrency.
  // All syncs funnel through runSync, which loops until quiet.
  let syncInFlight = false;
  let resyncQueued = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const runSync = async (): Promise<void> => {
    if (isDisabled()) return;
    if (syncInFlight) {
      resyncQueued = true;
      return;
    }
    syncInFlight = true;

    try {
      do {
        resyncQueued = false;
        const snapshot = ports.getSnapshot();
        const baseline = ports.getBaseline();
        if (!hasPendingChanges(snapshot, baseline)) break;

        try {
          const response = await handleServerTransaction(
            ports.transport,
            ports.getDataVersion(),
            buildSyncInputs(snapshot, baseline),
          );
          retryAttempt = 0;

          if (response.success) {
            // Advance to the snapshot that was actually sent — edits made
            // during the request stay diffable and trigger the next loop pass.
            ports.onSuccess(snapshot, response.newDataVersion);
          } else if (response.reason === "stale") {
            // Server rejected this sync because another writer moved the
            // dataVersion forward. Discard the in-flight edit and adopt the
            // server's current snapshot wholesale — partial application across
            // a DAG-shaped dataset can't be done safely.
            console.warn("Sync rejected as stale; adopting fresh server state");
            ports.onStale(response.freshState);
          } else {
            // The server received the diff and rejected it — replaying the
            // same diff would fail the same way, so snap back to the last
            // confirmed state rather than diverging further.
            console.warn("Server sync response not successful:", response);
            ports.onError();
          }
        } catch (error) {
          // Transport-level failure: the request may never have reached the
          // server. Rolling back would destroy real edits over a network blip
          // — keep local state and retry with backoff instead. If retries run
          // out, edits stay pending and the next state change re-triggers.
          const attempt = retryAttempt;
          if (attempt < retryDelays.length) {
            retryAttempt = attempt + 1;
            console.warn(
              `Sync transport error; retrying (${attempt + 1}/${retryDelays.length})`,
              error,
            );
            retryTimer = setTimeout(() => void runSync(), retryDelays[attempt]);
          } else {
            retryAttempt = 0;
            console.error(
              "Sync failed after retries; local edits stay pending",
              error,
            );
          }
          return;
        }
      } while (resyncQueued);
    } finally {
      syncInFlight = false;
    }
  };

  const dispose = () => {
    if (retryTimer) clearTimeout(retryTimer);
  };

  return { runSync, dispose };
}
