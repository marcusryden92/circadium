// Freshness policy for cached Google travel times. Pure so the server actions
// stay thin wiring and the decisions are unit-testable.

export const TRAVEL_TIME_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const UNROUTABLE_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_ALL_COOLDOWN_MS = 60 * 60 * 1000;
// Cap on the silent background top-up: bounds what a returning user's page
// load may spend, no matter how stale the cache is. Remaining stale pairs top
// up incrementally across sessions.
export const STALE_TOP_UP_MAX_PAIRS = 10;
export const TOP_UP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Persisted per-user daily allowance for the silent top-up — sessions are
// free to create (refresh, second tab, phone), so the per-session cap alone
// would not bound spend.
export function topUpAllowed(now: number, lastTopUpAt: Date | null): boolean {
  return !lastTopUpAt || now - lastTopUpAt.getTime() >= TOP_UP_COOLDOWN_MS;
}

// Hard monthly ceiling on billed matrix elements, with headroom under the
// 5,000-element Compute Route Matrix Pro free tier. Account-global, because
// Google's free caps pool across the billing account, not per user.
export const TRAVEL_ELEMENT_MONTHLY_CAP = 4500;

// Ceiling on saved locations. Upstream of every travel-cost cap: N locations is
// up to N*(N-1) directional pairs, so this bounds worst-case matrix spend.
export const MAX_LOCATIONS = 5;

// Billed elements for a set of pairs: time-varying modes fetch all three
// conditions, walk/cycle fetch one and reuse it.
export function elementsForPairs(pairCount: number, timeVarying: boolean): number {
  return pairCount * (timeVarying ? 3 : 1);
}

export function monthStartUtc(now: number): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type BudgetReservation =
  | { allowed: true; nextCount: number; periodStart: Date }
  | { allowed: false; reason: string };

// Reserve `planned` elements against the monthly counter. The count resets on
// the calendar-month boundary (Google's caps reset on the 1st). Reservation
// happens BEFORE the Google call — a failed call may overcount, never under.
export function reserveElements(args: {
  now: number;
  planned: number;
  count: number;
  periodStart: Date | null;
  cap?: number;
}): BudgetReservation {
  const period = monthStartUtc(args.now);
  const sameMonth =
    args.periodStart !== null &&
    args.periodStart.getTime() === period.getTime();
  const current = sameMonth ? args.count : 0;
  const cap = args.cap ?? TRAVEL_ELEMENT_MONTHLY_CAP;
  if (current + args.planned > cap) {
    return {
      allowed: false,
      reason:
        "The monthly travel-time budget is used up — new travel times will be available after the 1st. Existing values keep working.",
    };
  }
  return { allowed: true, nextCount: current + args.planned, periodStart: period };
}

export interface TravelTimeFreshness {
  updatedAt: Date;
  unroutableAt: Date | null;
}

// True when a cached row should be bought again: routable rows age out after
// the TTL (traffic patterns and timetables drift), unroutable rows after a
// longer retry window (a pair with no route rarely gains one).
export function needsRefetch(row: TravelTimeFreshness, now: number): boolean {
  if (row.unroutableAt) {
    return now - row.unroutableAt.getTime() >= UNROUTABLE_RETRY_MS;
  }
  return now - row.updatedAt.getTime() >= TRAVEL_TIME_TTL_MS;
}

export type RefreshAllVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

// Two separate concerns, deliberately not one timestamp: `lastRefreshAt` is a
// mode-independent rate limit on the action itself (a full recompute is the
// most expensive call in the app), and `oldestUpdatedAt` is a staleness check
// on the target mode's data — keyed on the OLDEST row, so one freshly fetched
// pair can't mask a cache full of stale ones.
export function refreshAllGate(args: {
  now: number;
  lastRefreshAt: Date | null;
  oldestUpdatedAt: Date | null;
}): RefreshAllVerdict {
  if (
    args.lastRefreshAt &&
    args.now - args.lastRefreshAt.getTime() < REFRESH_ALL_COOLDOWN_MS
  ) {
    return {
      allowed: false,
      reason:
        "Travel times were refreshed less than an hour ago — try again later.",
    };
  }
  if (
    args.oldestUpdatedAt &&
    args.now - args.oldestUpdatedAt.getTime() < REFRESH_ALL_COOLDOWN_MS
  ) {
    return {
      allowed: false,
      reason:
        "All travel times for this mode are under an hour old — use Fetch missing on the Locations page for new pairs.",
    };
  }
  return { allowed: true };
}
