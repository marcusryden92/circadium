import {
  generateCalendar,
  GenerateCalendarOptions,
} from "./calendarGeneration";
import type {
  EventTemplate,
  Planner,
  SimpleEvent,
  WeekDayIntegers,
} from "../contracts";

export type EngineWorkerRequest = {
  userId: string;
  weekStartDay: WeekDayIntegers;
  template: EventTemplate[];
  planner: Planner[];
  prevCalendar: SimpleEvent[];
  options: GenerateCalendarOptions;
};

export type EngineRunResult = ReturnType<typeof generateCalendar>;

// How a host spawns its platform worker. Worker construction is bundler- and
// platform-specific (web uses `new Worker(new URL(...))`), so it is injected
// rather than hard-coded here. The default produces no worker, which makes
// runEngineCalculation fall back to a synchronous main-thread run — correct
// until a host wires up its worker via configureEngineClient.
type SpawnWorker = () => Worker | null;
let spawnWorker: SpawnWorker = () => null;

export function configureEngineClient(factory: SpawnWorker): void {
  spawnWorker = factory;
}

let worker: Worker | null = null;
let resolveInFlight: ((result: EngineRunResult | null) => void) | null = null;

function runInline(request: EngineWorkerRequest): EngineRunResult {
  const { userId, weekStartDay, template, planner, prevCalendar, options } =
    request;
  return generateCalendar(
    userId,
    weekStartDay,
    template,
    planner,
    prevCalendar,
    options,
  );
}

/**
 * Run the scheduling engine. Default mode is off-main-thread via the worker;
 * "inline" runs synchronously so the result commits before the next paint
 * (used by calendar drag/resize for atomic updates). Latest-wins: a new
 * request supersedes any in-flight run — the busy worker is terminated
 * mid-compute (its result would be stale anyway) and the superseded caller
 * resolves null, which callers treat as "drop this run silently". Falls back
 * to a synchronous main-thread run when workers are unavailable or broken.
 */
export function runEngineCalculation(
  request: EngineWorkerRequest,
  mode: "inline" | "worker" = "worker",
): Promise<EngineRunResult | null> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(runInline(request));
  }

  if (resolveInFlight) {
    worker?.terminate();
    worker = null;
    resolveInFlight(null);
    resolveInFlight = null;
  }

  if (mode === "inline") {
    return Promise.resolve(runInline(request));
  }

  if (!worker) worker = spawnWorker();
  if (!worker) return Promise.resolve(runInline(request));

  const activeWorker = worker;
  return new Promise((resolve) => {
    resolveInFlight = resolve;

    activeWorker.onmessage = (event: MessageEvent<EngineRunResult>) => {
      if (resolveInFlight === resolve) resolveInFlight = null;
      resolve(event.data);
    };
    activeWorker.onerror = () => {
      if (resolveInFlight === resolve) resolveInFlight = null;
      activeWorker.terminate();
      if (worker === activeWorker) worker = null;
      resolve(runInline(request));
    };

    try {
      activeWorker.postMessage(request);
    } catch {
      // Non-cloneable request (shouldn't happen — inputs are plain data).
      if (resolveInFlight === resolve) resolveInFlight = null;
      activeWorker.terminate();
      if (worker === activeWorker) worker = null;
      resolve(runInline(request));
    }
  });
}
