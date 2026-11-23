// A reconnecting client for the calendar's realtime channel, lifted
// host-agnostic like the sync loop. The server pushes {type:"dataVersion",
// value:N} to every live session of a user: a hello on each (re)connect
// carrying the account's current version, and one after every committed sync.
// This client compares each against the version the sync loop knows, and when
// the server is ahead it asks the host to catch up (fetch the bootstrap and
// adopt it wholesale — the same path a stale sync takes). Everything
// host-specific — how a socket is opened, where the known version lives, how a
// catch-up is applied — is injected, so web and native share this module.

export interface RealtimeConnection {
  send: (data: string) => void;
  close: () => void;
}

export interface RealtimeHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
}

export interface RealtimeClientPorts {
  // Open a socket and wire the handlers to it, returning a handle to send on
  // and close. Keeping the WebSocket itself out of shared sidesteps the
  // browser-vs-native type split (and its event-handler variance).
  connect: (handlers: RealtimeHandlers) => RealtimeConnection;
  // The version the sync loop currently believes is server truth.
  getDataVersion: () => number;
  // The server is ahead: catch up (the host fetches the bootstrap and adopts).
  onBehind: () => void;
  // Hard off-switch (snapshot impersonation), mirrored from the sync loop.
  isDisabled?: () => boolean;
  reconnectDelaysMs?: number[];
  behindDebounceMs?: number;
  heartbeatMs?: number;
}

export interface RealtimeClient {
  start: () => void;
  dispose: () => void;
}

export const DEFAULT_REALTIME_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 15_000];
const DEFAULT_BEHIND_DEBOUNCE_MS = 250;
const DEFAULT_HEARTBEAT_MS = 25_000;
const HEARTBEAT = '{"type":"ping"}';

function parseDataVersion(data: string): number | null {
  try {
    const parsed = JSON.parse(data) as { type?: unknown; value?: unknown };
    if (parsed?.type === "dataVersion" && typeof parsed.value === "number") {
      return parsed.value;
    }
  } catch {
    // Ignore anything that is not our message.
  }
  return null;
}

export function createRealtimeClient(ports: RealtimeClientPorts): RealtimeClient {
  const reconnectDelays =
    ports.reconnectDelaysMs ?? DEFAULT_REALTIME_RECONNECT_DELAYS_MS;
  const behindDebounceMs = ports.behindDebounceMs ?? DEFAULT_BEHIND_DEBOUNCE_MS;
  const heartbeatMs = ports.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const isDisabled = ports.isDisabled ?? (() => false);

  let disposed = false;
  let connection: RealtimeConnection | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let behindTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // A ping went out and no frame has come back since. If it is still true at
  // the next tick, the socket is half-open (the server answers every ping with
  // a pong, and any message resets this), so we force a reconnect instead of
  // sitting silently deaf to dataVersion broadcasts.
  let awaitingResponse = false;
  // Highest version the server has advertised; checked against the sync loop's
  // known version once a burst of messages settles.
  let highestSeenVersion = -1;

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    awaitingResponse = false;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (awaitingResponse) {
        // Last ping drew no response within a full interval: the pipe is dead.
        forceReconnect();
        return;
      }
      awaitingResponse = true;
      try {
        connection?.send(HEARTBEAT);
      } catch {
        forceReconnect();
      }
    }, heartbeatMs);
  }

  // Tear the socket down and reconnect without waiting on an onClose a half-open
  // connection may never deliver. Idempotent via the connection null-out: a
  // later real onClose then no-ops.
  function forceReconnect() {
    if (!connection) return;
    stopHeartbeat();
    try {
      connection.close();
    } catch {
      // Already gone.
    }
    connection = null;
    scheduleReconnect();
  }

  function checkBehind() {
    behindTimer = null;
    if (disposed || isDisabled()) return;
    // Re-read the known version at fire time: the HTTP sync may have advanced
    // it meanwhile — including this tab's own commit, whose echo we ignore.
    if (highestSeenVersion > ports.getDataVersion()) {
      ports.onBehind();
    }
  }

  function scheduleBehindCheck() {
    if (behindTimer) clearTimeout(behindTimer);
    behindTimer = setTimeout(checkBehind, behindDebounceMs);
  }

  function scheduleReconnect() {
    if (disposed) return;
    const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(open, delay);
  }

  function open() {
    reconnectTimer = null;
    if (disposed) return;
    connection = ports.connect({
      onOpen: () => {
        reconnectAttempt = 0;
        startHeartbeat();
      },
      onMessage: (data) => {
        // Any inbound frame (a pong or a dataVersion push) proves the socket is
        // alive for this interval.
        awaitingResponse = false;
        const version = parseDataVersion(data);
        if (version === null) return;
        if (version > highestSeenVersion) highestSeenVersion = version;
        scheduleBehindCheck();
      },
      onClose: () => {
        if (!connection) return;
        stopHeartbeat();
        connection = null;
        scheduleReconnect();
      },
    });
  }

  return {
    start: () => {
      if (disposed || connection || reconnectTimer) return;
      open();
    },
    dispose: () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (behindTimer) clearTimeout(behindTimer);
      stopHeartbeat();
      connection?.close();
      connection = null;
    },
  };
}
