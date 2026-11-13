import { createSyncLoop, type SyncSnapshot } from "../../sync/syncLoop";
import type { SyncLoopPorts } from "../../sync/syncLoop";
import type { SyncResponse, BootstrapPayload } from "../../contracts";

const emptySnapshot = (): SyncSnapshot => ({
  planner: [],
  calendar: [],
  template: [],
  categories: [],
  categoryEvents: [],
  travelEvents: [],
  engineMessages: [],
  queues: [],
  dependencies: [],
  locations: [],
  travelTimes: [],
});

const snapshotWith = (plannerId: string): SyncSnapshot => ({
  ...emptySnapshot(),
  planner: [{ id: plannerId }] as unknown as SyncSnapshot["planner"],
});

// A harness with a mutable baseline/snapshot and spyable outcome handlers. The
// baseline starts empty so there is always pending work unless a test says
// otherwise.
function makeHarness(overrides: Partial<SyncLoopPorts> = {}) {
  let snapshot = snapshotWith("p1");
  let baseline = emptySnapshot();
  let dataVersion = 1;

  const onSuccess = jest.fn((sent: SyncSnapshot, v: number) => {
    baseline = sent;
    dataVersion = v;
  });
  const onStale = jest.fn();
  const onError = jest.fn();

  const ports: SyncLoopPorts = {
    transport: jest.fn(async () => ({ success: true, newDataVersion: 2 }) as SyncResponse),
    getSnapshot: () => snapshot,
    getBaseline: () => baseline,
    getDataVersion: () => dataVersion,
    onSuccess,
    onStale,
    onError,
    ...overrides,
  };

  return {
    ports,
    onSuccess,
    onStale,
    onError,
    setSnapshot: (s: SyncSnapshot) => {
      snapshot = s;
    },
    getBaseline: () => baseline,
    getDataVersion: () => dataVersion,
  };
}

describe("createSyncLoop", () => {
  afterEach(() => jest.useRealTimers());

  it("commits the sent snapshot and the new version on success", async () => {
    const h = makeHarness();
    const loop = createSyncLoop(h.ports);
    await loop.runSync();

    expect(h.ports.transport).toHaveBeenCalledTimes(1);
    expect(h.onSuccess).toHaveBeenCalledWith(snapshotWith("p1"), 2);
    expect(h.getBaseline()).toEqual(snapshotWith("p1"));
    expect(h.getDataVersion()).toBe(2);
    expect(h.onStale).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("adopts fresh server state when the sync is rejected as stale", async () => {
    const freshState = { dataVersion: 9 } as unknown as BootstrapPayload;
    const h = makeHarness({
      transport: jest.fn(async () => ({
        success: false,
        reason: "stale",
        freshState,
      }) as SyncResponse),
    });
    const loop = createSyncLoop(h.ports);
    await loop.runSync();

    expect(h.onStale).toHaveBeenCalledWith(freshState);
    expect(h.onSuccess).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("rolls back when the server rejects the diff with an error", async () => {
    const h = makeHarness({
      transport: jest.fn(async () => ({
        success: false,
        reason: "error",
        error: "Sync failed",
      }) as SyncResponse),
    });
    const loop = createSyncLoop(h.ports);
    await loop.runSync();

    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onSuccess).not.toHaveBeenCalled();
    expect(h.onStale).not.toHaveBeenCalled();
  });

  it("short-circuits without calling the transport when there are no changes", async () => {
    const h = makeHarness({ getBaseline: () => snapshotWith("p1") });
    const loop = createSyncLoop(h.ports);
    await loop.runSync();

    expect(h.ports.transport).not.toHaveBeenCalled();
    expect(h.onSuccess).not.toHaveBeenCalled();
  });

  it("skips entirely while disabled", async () => {
    const h = makeHarness({ isDisabled: () => true });
    const loop = createSyncLoop(h.ports);
    await loop.runSync();

    expect(h.ports.transport).not.toHaveBeenCalled();
  });

  it("serializes concurrent runs: a second call queues one resync, no parallel transport", async () => {
    let resolveFirst!: (v: SyncResponse) => void;
    let calls = 0;
    const transport = jest.fn(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise<SyncResponse>((r) => {
          resolveFirst = r;
        });
      }
      return Promise.resolve({
        success: true,
        newDataVersion: 10 + calls,
      } as SyncResponse);
    });
    const h = makeHarness({ transport });
    const loop = createSyncLoop(h.ports);

    const first = loop.runSync();
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);

    // An edit lands mid-flight, then a second trigger arrives.
    h.setSnapshot(snapshotWith("p2"));
    const second = loop.runSync();
    expect(transport).toHaveBeenCalledTimes(1); // still only the in-flight one

    resolveFirst({ success: true, newDataVersion: 2 });
    await Promise.all([first, second]);

    // The queued resync picked up the mid-flight edit.
    expect(transport).toHaveBeenCalledTimes(2);
    expect(h.getBaseline()).toEqual(snapshotWith("p2"));
  });

  it("retries transport-level failures with backoff and keeps local state", async () => {
    jest.useFakeTimers();
    let calls = 0;
    const transport = jest.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("network blip"));
      return Promise.resolve({ success: true, newDataVersion: 5 } as SyncResponse);
    });
    const h = makeHarness({ transport, retryDelaysMs: [1000] });
    const loop = createSyncLoop(h.ports);

    await loop.runSync();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(h.onError).not.toHaveBeenCalled(); // a blip must not roll back
    expect(h.onSuccess).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(h.onSuccess).toHaveBeenCalledWith(snapshotWith("p1"), 5);
  });
});
