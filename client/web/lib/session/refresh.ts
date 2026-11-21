import { apiUrl } from "@/lib/session/config";

// Browser only. Keeps the HttpOnly access cookie alive while a tab is open.
// Server actions cannot trigger a refresh themselves, so a lapsed cookie would
// make every one of them fail as signed out; instead the tab tracks the expiry
// Java reports and refreshes ahead of it.
//
// All tabs share one cookie jar, and Java treats a refresh token presented
// twice as stolen (the whole session is revoked). So refreshes are serialized
// across tabs with a Web Lock, and the latest expiry is published in
// localStorage: a tab that waited for the lock finds the refresh already done
// and adopts the result instead of spending the new token again.

export type RefreshOutcome = "refreshed" | "signed-out" | "unavailable";
export type SessionEndReason = "signed-out" | "user-changed";

/** Wide enough to absorb the 1-minute timer alignment of background tabs. */
const REFRESH_AHEAD_MS = 2 * 60_000;
const RETRY_MIN_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;
const LOCK_NAME = "circadium:session-refresh";
const SHARED_KEY = "circadium:session";

type SharedState = { userId: string; accessTokenExpiresAt: number };

let userId: string | null = null;
let accessTokenExpiresAt: number | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let retryDelayMs = RETRY_MIN_MS;
let inFlight: Promise<RefreshOutcome> | null = null;
const endListeners = new Set<(reason: SessionEndReason) => void>();

/**
 * Starts refreshing for the signed-in user of this page. Returns the function
 * that stops it.
 */
export function startSessionKeeper(session: {
  userId: string;
  accessTokenExpiresAt: number;
}): () => void {
  stopSessionKeeper();
  userId = session.userId;
  const shared = readShared();
  accessTokenExpiresAt =
    shared?.userId === session.userId
      ? Math.max(shared.accessTokenExpiresAt, session.accessTokenExpiresAt)
      : session.accessTokenExpiresAt;
  writeShared();
  running = true;
  window.addEventListener("storage", onStorage);
  window.addEventListener("online", onWake);
  document.addEventListener("visibilitychange", onWake);
  scheduleAhead();
  return stopSessionKeeper;
}

export function stopSessionKeeper(): void {
  running = false;
  clearTimeout(timer);
  timer = undefined;
  userId = null;
  accessTokenExpiresAt = null;
  retryDelayMs = RETRY_MIN_MS;
  window.removeEventListener("storage", onStorage);
  window.removeEventListener("online", onWake);
  document.removeEventListener("visibilitychange", onWake);
}

/**
 * Called after a sign-out in this tab. Removing the shared state tells every
 * other tab that the session is over.
 */
export function forgetSession(): void {
  stopSessionKeeper();
  try {
    localStorage.removeItem(SHARED_KEY);
  } catch {
    // Storage blocked: other tabs find out on their next refresh instead.
  }
}

/**
 * True when a tab of this browser held a session that was not signed out, so
 * the refresh cookie may still be live. Lets a signed-out page skip a refresh
 * that could only fail.
 */
export function hasRememberedSession(): boolean {
  return readShared() !== null;
}

/** Fires when the session ends in this tab or another one. */
export function onSessionEnded(
  listener: (reason: SessionEndReason) => void,
): () => void {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
}

/**
 * Resolves true when the access cookie is good for at least the refresh
 * margin, refreshing first if it is not.
 */
export async function ensureFreshSession(): Promise<boolean> {
  if (
    accessTokenExpiresAt !== null &&
    accessTokenExpiresAt - Date.now() > REFRESH_AHEAD_MS
  ) {
    return true;
  }
  return (await refreshSession()) === "refreshed";
}

/**
 * Trades the refresh cookie for fresh cookies. `force` skips the check for a
 * refresh another tab already made, for when the API has just rejected the
 * access cookie that check would vouch for.
 */
export function refreshSession(
  options: { force?: boolean } = {},
): Promise<RefreshOutcome> {
  inFlight ??= withRefreshLock(() =>
    refreshUnderLock(options.force ?? false),
  ).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function refreshUnderLock(force: boolean): Promise<RefreshOutcome> {
  if (!force && userId !== null) {
    const shared = readShared();
    if (
      shared?.userId === userId &&
      shared.accessTokenExpiresAt - Date.now() > REFRESH_AHEAD_MS
    ) {
      adopt(shared.accessTokenExpiresAt);
      return "refreshed";
    }
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return "unavailable";
  }

  if (response.status === 401) {
    forgetSession();
    emitEnd("signed-out");
    return "signed-out";
  }
  if (!response.ok) return "unavailable";

  let expiresAt: number;
  try {
    const body = (await response.json()) as { accessTokenExpiresAt?: string };
    expiresAt = Date.parse(body.accessTokenExpiresAt ?? "");
  } catch {
    return "unavailable";
  }
  if (Number.isNaN(expiresAt)) return "unavailable";

  adopt(expiresAt);
  writeShared();
  return "refreshed";
}

async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  // Web Locks need a secure context; without them only this tab is covered.
  if (typeof navigator === "undefined" || !navigator.locks) return work();
  return navigator.locks.request(LOCK_NAME, work);
}

function adopt(expiresAt: number): void {
  accessTokenExpiresAt = expiresAt;
  retryDelayMs = RETRY_MIN_MS;
  if (running) scheduleAhead();
}

function scheduleAhead(): void {
  if (accessTokenExpiresAt === null) return;
  scheduleIn(accessTokenExpiresAt - REFRESH_AHEAD_MS - Date.now());
}

function scheduleIn(delayMs: number): void {
  clearTimeout(timer);
  timer = setTimeout(onTimer, Math.max(0, delayMs));
}

async function onTimer(): Promise<void> {
  const outcome = await refreshSession();
  if (running && outcome === "unavailable") {
    // Java unreachable or throttling: the access cookie may still be valid, so
    // the session stays and the refresh is retried with backoff.
    scheduleIn(retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS);
  }
}

function onWake(): void {
  if (document.visibilityState === "visible") void ensureFreshSession();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== SHARED_KEY) return;
  const shared = parseShared(event.newValue);
  if (!shared) {
    stopSessionKeeper();
    emitEnd("signed-out");
  } else if (shared.userId !== userId) {
    // Another tab signed in as someone else; the cookies are now theirs, and
    // this tab's in-memory state belongs to the previous account.
    stopSessionKeeper();
    emitEnd("user-changed");
  } else if (shared.accessTokenExpiresAt > (accessTokenExpiresAt ?? 0)) {
    adopt(shared.accessTokenExpiresAt);
  }
}

function emitEnd(reason: SessionEndReason): void {
  for (const listener of [...endListeners]) listener(reason);
}

function readShared(): SharedState | null {
  try {
    return parseShared(localStorage.getItem(SHARED_KEY));
  } catch {
    return null;
  }
}

function writeShared(): void {
  if (userId === null || accessTokenExpiresAt === null) return;
  const state: SharedState = { userId, accessTokenExpiresAt };
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: tabs refresh independently, still serialized by the lock.
  }
}

function parseShared(raw: string | null): SharedState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SharedState>;
    if (
      typeof value.userId === "string" &&
      typeof value.accessTokenExpiresAt === "number"
    ) {
      return {
        userId: value.userId,
        accessTokenExpiresAt: value.accessTokenExpiresAt,
      };
    }
  } catch {
    // Unparseable: treated like no shared state.
  }
  return null;
}
