import {
  createRealtimeClient,
  type RealtimeConnection,
  type RealtimeHandlers,
} from "../../sync/realtimeClient";

const dv = (value: number) => JSON.stringify({ type: "dataVersion", value });

// A fake transport the test drives: it captures the handlers the client wires,
// counts connects, records sends, and lets the test emit open/message/close.
function makeFakeTransport() {
  let handlers: RealtimeHandlers | null = null;
  let connectCount = 0;
  let closed = false;
  const sent: string[] = [];

  const connect = (h: RealtimeHandlers): RealtimeConnection => {
    connectCount += 1;
    closed = false;
    handlers = h;
    return {
      send: (data) => sent.push(data),
      close: () => {
        closed = true;
      },
    };
  };

  return {
    connect,
    sent,
    get connectCount() {
      return connectCount;
    },
    isClosed: () => closed,
    open: () => handlers?.onOpen(),
    message: (data: string) => handlers?.onMessage(data),
    serverClose: () => handlers?.onClose(),
  };
}

describe("createRealtimeClient", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("asks the host to catch up when the server advertises a newer version", () => {
    const t = makeFakeTransport();
    const onBehind = jest.fn();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 3,
      onBehind,
      behindDebounceMs: 100,
    });
    client.start();
    t.open();

    t.message(dv(5));
    expect(onBehind).not.toHaveBeenCalled(); // debounced
    jest.advanceTimersByTime(100);
    expect(onBehind).toHaveBeenCalledTimes(1);

    client.dispose();
  });

  it("ignores a version it already knows (its own commit's echo)", () => {
    const t = makeFakeTransport();
    const onBehind = jest.fn();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 8,
      onBehind,
      behindDebounceMs: 100,
    });
    client.start();
    t.open();

    t.message(dv(8));
    t.message(dv(7));
    jest.advanceTimersByTime(100);
    expect(onBehind).not.toHaveBeenCalled();

    client.dispose();
  });

  it("re-checks at fire time, so a version the HTTP sync caught up to is not refetched", () => {
    const t = makeFakeTransport();
    const onBehind = jest.fn();
    let known = 7;
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => known,
      onBehind,
      behindDebounceMs: 100,
    });
    client.start();
    t.open();

    t.message(dv(8));
    known = 8; // the tab's own sync response advanced it before the debounce fired
    jest.advanceTimersByTime(100);
    expect(onBehind).not.toHaveBeenCalled();

    client.dispose();
  });

  it("reconnects with backoff and catches up from the hello after a drop", () => {
    const t = makeFakeTransport();
    const onBehind = jest.fn();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 4,
      onBehind,
      reconnectDelaysMs: [1000],
      behindDebounceMs: 100,
    });
    client.start();
    t.open();
    expect(t.connectCount).toBe(1);

    t.serverClose();
    expect(t.connectCount).toBe(1); // waits for the backoff delay
    jest.advanceTimersByTime(1000);
    expect(t.connectCount).toBe(2);

    // The hello after reconnect carries a version this tab missed while offline.
    t.open();
    t.message(dv(9));
    jest.advanceTimersByTime(100);
    expect(onBehind).toHaveBeenCalledTimes(1);

    client.dispose();
  });

  it("does nothing more after dispose: no reconnect, no catch-up", () => {
    const t = makeFakeTransport();
    const onBehind = jest.fn();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 1,
      onBehind,
      reconnectDelaysMs: [1000],
    });
    client.start();
    t.open();
    t.serverClose();
    client.dispose();

    jest.advanceTimersByTime(100_000);
    expect(t.connectCount).toBe(1);
    expect(onBehind).not.toHaveBeenCalled();
  });

  it("sends heartbeats to keep the connection warm", () => {
    const t = makeFakeTransport();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 1,
      onBehind: jest.fn(),
      heartbeatMs: 1000,
    });
    client.start();
    t.open();

    jest.advanceTimersByTime(1000);
    expect(t.sent).toContain('{"type":"ping"}');

    client.dispose();
  });

  it("reconnects when a ping goes unanswered (a half-open socket)", () => {
    const t = makeFakeTransport();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 1,
      onBehind: jest.fn(),
      heartbeatMs: 1000,
      reconnectDelaysMs: [500],
    });
    client.start();
    t.open();
    expect(t.connectCount).toBe(1);

    jest.advanceTimersByTime(1000); // ping goes out, now awaiting a response
    expect(t.sent).toContain('{"type":"ping"}');
    jest.advanceTimersByTime(1000); // still nothing back: the socket is dead
    expect(t.isClosed()).toBe(true);
    jest.advanceTimersByTime(500); // backoff, then reconnect
    expect(t.connectCount).toBe(2);

    client.dispose();
  });

  it("keeps the connection when a pong answers the ping", () => {
    const t = makeFakeTransport();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 1,
      onBehind: jest.fn(),
      heartbeatMs: 1000,
      reconnectDelaysMs: [500],
    });
    client.start();
    t.open();

    jest.advanceTimersByTime(1000); // ping out
    t.message('{"type":"pong"}'); // answered: the socket is alive
    jest.advanceTimersByTime(1000); // next ping, not a reconnect
    jest.advanceTimersByTime(500);
    expect(t.isClosed()).toBe(false);
    expect(t.connectCount).toBe(1);

    client.dispose();
  });

  it("stays quiet while disabled", () => {
    const t = makeFakeTransport();
    const onBehind = jest.fn();
    const client = createRealtimeClient({
      connect: t.connect,
      getDataVersion: () => 1,
      onBehind,
      isDisabled: () => true,
      behindDebounceMs: 100,
    });
    client.start();
    t.open();

    t.message(dv(9));
    jest.advanceTimersByTime(100);
    expect(onBehind).not.toHaveBeenCalled();

    client.dispose();
  });
});
