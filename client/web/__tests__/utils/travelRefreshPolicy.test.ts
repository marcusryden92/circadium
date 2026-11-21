import {
  needsRefetch,
  refreshAllGate,
  topUpAllowed,
  reserveElements,
  elementsForPairs,
  monthStartUtc,
  TRAVEL_TIME_TTL_MS,
  UNROUTABLE_RETRY_MS,
  REFRESH_ALL_COOLDOWN_MS,
  TOP_UP_COOLDOWN_MS,
  TRAVEL_ELEMENT_MONTHLY_CAP,
} from "@/utils/locations/travelRefreshPolicy";

const NOW = new Date("2026-07-20T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const at = (msAgo: number) => new Date(NOW - msAgo);

describe("needsRefetch", () => {
  it("keeps a fresh routable row", () => {
    expect(needsRefetch({ updatedAt: at(DAY), unroutableAt: null }, NOW)).toBe(
      false,
    );
  });

  it("keeps a routable row just inside the TTL", () => {
    expect(
      needsRefetch(
        { updatedAt: at(TRAVEL_TIME_TTL_MS - HOUR), unroutableAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("ages a routable row out past the TTL", () => {
    expect(
      needsRefetch(
        { updatedAt: at(TRAVEL_TIME_TTL_MS + HOUR), unroutableAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("holds an unroutable row inside the retry window", () => {
    expect(
      needsRefetch(
        { updatedAt: at(DAY), unroutableAt: at(UNROUTABLE_RETRY_MS - DAY) },
        NOW,
      ),
    ).toBe(false);
  });

  it("retries an unroutable row past the retry window", () => {
    expect(
      needsRefetch(
        { updatedAt: at(DAY), unroutableAt: at(UNROUTABLE_RETRY_MS + DAY) },
        NOW,
      ),
    ).toBe(true);
  });

  it("judges an unroutable row by its unroutable stamp, not updatedAt", () => {
    // A recent failed retry restamps unroutableAt; a stale updatedAt beyond
    // the TTL must not age the row back into the missing set early.
    expect(
      needsRefetch(
        { updatedAt: at(TRAVEL_TIME_TTL_MS + DAY), unroutableAt: at(DAY) },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("refreshAllGate", () => {
  it("allows a first refresh with no history", () => {
    expect(
      refreshAllGate({ now: NOW, lastRefreshAt: null, oldestUpdatedAt: null }),
    ).toEqual({ allowed: true });
  });

  it("rejects a second refresh within the cooldown, regardless of mode data", () => {
    const verdict = refreshAllGate({
      now: NOW,
      lastRefreshAt: at(10 * 60 * 1000),
      oldestUpdatedAt: at(200 * DAY),
    });
    expect(verdict.allowed).toBe(false);
  });

  it("allows again once the action cooldown has passed", () => {
    expect(
      refreshAllGate({
        now: NOW,
        lastRefreshAt: at(REFRESH_ALL_COOLDOWN_MS + 1),
        oldestUpdatedAt: at(200 * DAY),
      }),
    ).toEqual({ allowed: true });
  });

  it("does not let one fresh row mask stale ones (oldest, not newest)", () => {
    // January-cache scenario: user adds a location, fetch-missing writes fresh
    // rows, the six-month-old rest must still be refreshable.
    expect(
      refreshAllGate({
        now: NOW,
        lastRefreshAt: null,
        oldestUpdatedAt: at(180 * DAY),
      }),
    ).toEqual({ allowed: true });
  });

  it("rejects when even the oldest row is fresh", () => {
    const verdict = refreshAllGate({
      now: NOW,
      lastRefreshAt: null,
      oldestUpdatedAt: at(10 * 60 * 1000),
    });
    expect(verdict.allowed).toBe(false);
  });
});

describe("topUpAllowed", () => {
  it("allows the first top-up", () => {
    expect(topUpAllowed(NOW, null)).toBe(true);
  });

  it("rejects a second top-up within the daily window", () => {
    expect(topUpAllowed(NOW, at(HOUR))).toBe(false);
  });

  it("allows again after the daily window", () => {
    expect(topUpAllowed(NOW, at(TOP_UP_COOLDOWN_MS + 1))).toBe(true);
  });
});

describe("elementsForPairs", () => {
  it("bills three conditions for time-varying modes", () => {
    expect(elementsForPairs(90, true)).toBe(270);
  });

  it("bills one fetched condition for walk/cycle", () => {
    expect(elementsForPairs(90, false)).toBe(90);
  });
});

describe("reserveElements", () => {
  const period = monthStartUtc(NOW);

  it("allows a first reservation with no row", () => {
    const r = reserveElements({ now: NOW, planned: 300, count: 0, periodStart: null });
    expect(r).toEqual({ allowed: true, nextCount: 300, periodStart: period });
  });

  it("accumulates within the same month", () => {
    const r = reserveElements({
      now: NOW,
      planned: 300,
      count: 1000,
      periodStart: period,
    });
    expect(r.allowed && r.nextCount).toBe(1300);
  });

  it("allows exactly up to the cap and refuses past it", () => {
    const atCap = reserveElements({
      now: NOW,
      planned: 300,
      count: TRAVEL_ELEMENT_MONTHLY_CAP - 300,
      periodStart: period,
    });
    expect(atCap.allowed).toBe(true);
    const overCap = reserveElements({
      now: NOW,
      planned: 300,
      count: TRAVEL_ELEMENT_MONTHLY_CAP - 299,
      periodStart: period,
    });
    expect(overCap.allowed).toBe(false);
  });

  it("resets the count when the month rolls over", () => {
    const lastMonth = new Date(Date.UTC(2026, 5, 1));
    const r = reserveElements({
      now: NOW,
      planned: 300,
      count: TRAVEL_ELEMENT_MONTHLY_CAP,
      periodStart: lastMonth,
    });
    expect(r).toEqual({ allowed: true, nextCount: 300, periodStart: period });
  });
});
