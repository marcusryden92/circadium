import type * as RefreshModule from "@/lib/session/refresh";

const NOW = new Date("2026-11-21T10:00:00Z").getTime();
const MINUTE = 60_000;
const SHARED_KEY = "circadium:session";

let refresh: typeof RefreshModule;
let fetchMock: jest.Mock;
let stop: (() => void) | undefined;

function refreshed(expiresAt: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      accessTokenExpiresAt: new Date(expiresAt).toISOString(),
      refreshTokenExpiresAt: new Date(expiresAt + 30 * 24 * 60 * MINUTE).toISOString(),
    }),
  };
}

function status(code: number) {
  return { ok: code >= 200 && code < 300, status: code, json: async () => ({}) };
}

// Serializes callbacks per lock name, like the browser's Web Locks API.
function installLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    request: (name: string, callback: () => Promise<unknown>) => {
      const run = (tails.get(name) ?? Promise.resolve()).then(() => callback());
      tails.set(name, run.catch(() => undefined));
      return run;
    },
  };
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
}

function removeLocks() {
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
}

function shared() {
  const raw = localStorage.getItem(SHARED_KEY);
  return raw ? JSON.parse(raw) : null;
}

function storageEvent(newValue: unknown) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: SHARED_KEY,
      newValue: newValue === null ? null : JSON.stringify(newValue),
    }),
  );
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  localStorage.clear();
  installLocks();
  setVisibility("visible");
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  await jest.isolateModulesAsync(async () => {
    refresh = await import("@/lib/session/refresh");
  });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  jest.useRealTimers();
});

describe("the refresh keeper", () => {
  it("refreshes two minutes before the access token expires, then again before the next expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(refreshed(NOW + 28 * MINUTE))
      .mockResolvedValueOnce(refreshed(NOW + 41 * MINUTE));
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    await jest.advanceTimersByTimeAsync(13 * MINUTE - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(shared()).toEqual({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 28 * MINUTE,
    });

    await jest.advanceTimersByTimeAsync(13 * MINUTE - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ends the session when Java rejects the refresh cookie", async () => {
    fetchMock.mockResolvedValueOnce(status(401));
    const ended = jest.fn();
    refresh.onSessionEnded(ended);
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    await jest.advanceTimersByTimeAsync(13 * MINUTE);

    expect(ended).toHaveBeenCalledWith("signed-out");
    expect(shared()).toBeNull();
    await jest.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the session and retries with backoff while Java is unreachable", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(refreshed(NOW + 30 * MINUTE));
    const ended = jest.fn();
    refresh.onSessionEnded(ended);
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    await jest.advanceTimersByTimeAsync(13 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(30_000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(ended).not.toHaveBeenCalled();
    expect(shared()?.accessTokenExpiresAt).toBe(NOW + 30 * MINUTE);
  });

  it("adopts a refresh another tab made while this one waited, without spending the token again", async () => {
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });
    // Written by another tab; no storage event reaches the writer's own window,
    // so this exercises the re-check inside the lock.
    localStorage.setItem(
      SHARED_KEY,
      JSON.stringify({ userId: "user-1", accessTokenExpiresAt: NOW + 28 * MINUTE }),
    );

    await jest.advanceTimersByTimeAsync(13 * MINUTE);

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(refresh.ensureFreshSession()).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("spends the refresh token once when two tabs refresh at the same moment", async () => {
    let otherTab!: typeof RefreshModule;
    await jest.isolateModulesAsync(async () => {
      otherTab = await import("@/lib/session/refresh");
    });
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(refreshed(NOW + 28 * MINUTE)), 300),
        ),
    );
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });
    const stopOther = otherTab.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    try {
      await jest.advanceTimersByTimeAsync(13 * MINUTE + 1000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      await expect(otherTab.ensureFreshSession()).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      stopOther();
    }
  });

  it("sends one request for concurrent refreshes in the same tab", async () => {
    fetchMock.mockResolvedValue(refreshed(NOW + 15 * MINUTE));

    const outcomes = await Promise.all([
      refresh.refreshSession(),
      refresh.refreshSession(),
      refresh.ensureFreshSession(),
    ]);

    expect(outcomes).toEqual(["refreshed", "refreshed", true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes even when another tab vouches for the token, if forced", async () => {
    fetchMock.mockResolvedValue(refreshed(NOW + 30 * MINUTE));
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    await expect(refresh.refreshSession({ force: true })).resolves.toBe("refreshed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("works without Web Locks", async () => {
    removeLocks();
    fetchMock.mockResolvedValue(refreshed(NOW + 15 * MINUTE));

    await expect(refresh.refreshSession()).resolves.toBe("refreshed");
  });

  it("starts from the newer expiry another tab already published", async () => {
    localStorage.setItem(
      SHARED_KEY,
      JSON.stringify({ userId: "user-1", accessTokenExpiresAt: NOW + 25 * MINUTE }),
    );
    fetchMock.mockResolvedValue(refreshed(NOW + 40 * MINUTE));
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    await jest.advanceTimersByTimeAsync(23 * MINUTE - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("waking up", () => {
  it("refreshes at once when the tab becomes visible near expiry", async () => {
    fetchMock.mockResolvedValue(refreshed(NOW + 30 * MINUTE));
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });
    setVisibility("hidden");
    // A sleeping laptop: the clock moves on, the timer has not fired.
    jest.setSystemTime(NOW + 14 * MINUTE);

    setVisibility("visible");
    await jest.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the tab becomes visible with a fresh token", async () => {
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    setVisibility("visible");
    await jest.advanceTimersByTimeAsync(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("other tabs", () => {
  beforeEach(() => {
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });
  });

  it("follows a sign-out in another tab", async () => {
    const ended = jest.fn();
    refresh.onSessionEnded(ended);

    storageEvent(null);

    expect(ended).toHaveBeenCalledWith("signed-out");
    await jest.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a different account signing in", () => {
    const ended = jest.fn();
    refresh.onSessionEnded(ended);

    storageEvent({ userId: "user-2", accessTokenExpiresAt: NOW + 15 * MINUTE });

    expect(ended).toHaveBeenCalledWith("user-changed");
  });

  it("reschedules from another tab's refresh instead of refreshing again", async () => {
    fetchMock.mockResolvedValue(refreshed(NOW + 40 * MINUTE));
    storageEvent({ userId: "user-1", accessTokenExpiresAt: NOW + 27 * MINUTE });

    await jest.advanceTimersByTimeAsync(25 * MINUTE - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tells the other tabs when this one signs out", () => {
    refresh.forgetSession();

    expect(shared()).toBeNull();
  });
});

describe("replacing the session", () => {
  function newSessionAfter(delayMs: number, expiresAt: number) {
    return () =>
      new Promise<{ accessTokenExpiresAt: string }>((resolve) =>
        setTimeout(
          () => resolve({ accessTokenExpiresAt: new Date(expiresAt).toISOString() }),
          delayMs,
        ),
      );
  }

  it("publishes the new expiry and schedules the next refresh from it", async () => {
    fetchMock.mockResolvedValue(refreshed(NOW + 60 * MINUTE));
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    const replaced = refresh.replaceSession(newSessionAfter(0, NOW + 40 * MINUTE));
    await jest.advanceTimersByTimeAsync(0);
    await replaced;

    expect(shared()).toEqual({ userId: "user-1", accessTokenExpiresAt: NOW + 40 * MINUTE });
    await jest.advanceTimersByTimeAsync(38 * MINUTE - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("holds back refreshes in every tab until the new cookies are in", async () => {
    let otherTab!: typeof RefreshModule;
    await jest.isolateModulesAsync(async () => {
      otherTab = await import("@/lib/session/refresh");
    });
    fetchMock.mockResolvedValue(status(401));
    // Both tabs are due for a refresh, which would present the refresh token
    // the change is about to revoke.
    stop = refresh.startSessionKeeper({ userId: "user-1", accessTokenExpiresAt: NOW + MINUTE });
    const stopOther = otherTab.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + MINUTE,
    });

    try {
      const replaced = refresh.replaceSession(newSessionAfter(300, NOW + 40 * MINUTE));
      await jest.advanceTimersByTimeAsync(1000);
      await replaced;

      expect(fetchMock).not.toHaveBeenCalled();
      expect(shared()).toEqual({ userId: "user-1", accessTokenExpiresAt: NOW + 40 * MINUTE });
      await expect(otherTab.ensureFreshSession()).resolves.toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      stopOther();
    }
  });

  it("changes nothing when the request fails", async () => {
    stop = refresh.startSessionKeeper({
      userId: "user-1",
      accessTokenExpiresAt: NOW + 15 * MINUTE,
    });

    await expect(
      refresh.replaceSession(() => Promise.reject(new Error("Incorrect password."))),
    ).rejects.toThrow("Incorrect password.");

    expect(shared()).toEqual({ userId: "user-1", accessTokenExpiresAt: NOW + 15 * MINUTE });
  });
});

describe("hasRememberedSession", () => {
  it("is false in a browser that never held a session", () => {
    expect(refresh.hasRememberedSession()).toBe(false);
  });

  it("is true once a tab has run the keeper, even after that tab closed", () => {
    refresh.startSessionKeeper({ userId: "user-1", accessTokenExpiresAt: NOW + 15 * MINUTE })();

    expect(refresh.hasRememberedSession()).toBe(true);
  });

  it("is false after a sign-out or a refused refresh", () => {
    refresh.startSessionKeeper({ userId: "user-1", accessTokenExpiresAt: NOW + 15 * MINUTE });
    refresh.forgetSession();

    expect(refresh.hasRememberedSession()).toBe(false);
  });

  it("ignores a value it cannot read", () => {
    localStorage.setItem(SHARED_KEY, "{not json");

    expect(refresh.hasRememberedSession()).toBe(false);
  });
});
