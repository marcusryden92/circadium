package app.circadium.calendar;

import app.circadium.persistence.enums.TransportMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Set;

/**
 * Freshness policy for cached Google travel times, the port of
 * {@code utils/locations/travelRefreshPolicy.ts} — pure so the services stay thin wiring and the
 * decisions are unit-testable. The reason strings are the exact wording the web shows.
 */
public final class TravelRefreshPolicy {

    public static final Duration TRAVEL_TIME_TTL = Duration.ofDays(180);
    public static final Duration UNROUTABLE_RETRY = Duration.ofDays(30);
    public static final Duration REFRESH_ALL_COOLDOWN = Duration.ofHours(1);
    /** Cap on one silent top-up run per user: the rest tops up incrementally across days. */
    public static final int STALE_TOP_UP_MAX_PAIRS = 10;
    public static final Duration TOP_UP_COOLDOWN = Duration.ofHours(24);
    /**
     * Hard monthly ceiling on billed matrix elements, with headroom under the 5,000-element
     * Compute Route Matrix Pro free tier. Account-global, because Google's free caps pool across
     * the billing account, not per user.
     */
    public static final int TRAVEL_ELEMENT_MONTHLY_CAP = 4500;
    /** Ceiling on saved locations; upstream of every travel cost cap (N locations = N*(N-1) pairs). */
    public static final int MAX_LOCATIONS = 5;

    /** Walking/cycling times don't vary with traffic, so one fetch covers all three conditions. */
    private static final Set<TransportMode> TIME_VARYING_MODES =
            Set.of(TransportMode.DRIVING, TransportMode.TRANSIT);

    private TravelRefreshPolicy() {
    }

    public static boolean isTimeVarying(TransportMode mode) {
        return TIME_VARYING_MODES.contains(mode);
    }

    public static boolean topUpAllowed(Instant now, Instant lastTopUpAt) {
        return lastTopUpAt == null || !now.isBefore(lastTopUpAt.plus(TOP_UP_COOLDOWN));
    }

    public static int elementsForPairs(int pairCount, boolean timeVarying) {
        return pairCount * (timeVarying ? 3 : 1);
    }

    public static Instant monthStartUtc(Instant now) {
        LocalDate day = LocalDate.ofInstant(now, ZoneOffset.UTC);
        return day.withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    /** {@code reason} is null exactly when the reservation is allowed. */
    public record BudgetReservation(boolean allowed, int nextCount, Instant periodStart, String reason) {
    }

    /**
     * Reserve {@code planned} elements against the monthly counter. The count resets on the
     * calendar-month boundary (Google's caps reset on the 1st). Reservation happens BEFORE the
     * Google call — a failed call may overcount, never under.
     */
    public static BudgetReservation reserveElements(Instant now, int planned, int count,
            Instant periodStart, int cap) {
        Instant period = monthStartUtc(now);
        int current = period.equals(periodStart) ? count : 0;
        if (current + planned > cap) {
            return new BudgetReservation(false, 0, period,
                    "The monthly travel-time budget is used up — new travel times will be available "
                            + "after the 1st. Existing values keep working.");
        }
        return new BudgetReservation(true, current + planned, period, null);
    }

    /**
     * True when a cached row should be bought again: routable rows age out after the TTL (traffic
     * patterns and timetables drift), unroutable rows after a longer retry window (a pair with no
     * route rarely gains one).
     */
    public static boolean needsRefetch(Instant updatedAt, Instant unroutableAt, Instant now) {
        if (unroutableAt != null) {
            return !now.isBefore(unroutableAt.plus(UNROUTABLE_RETRY));
        }
        return !now.isBefore(updatedAt.plus(TRAVEL_TIME_TTL));
    }

    /** {@code reason} is null exactly when the refresh may run. */
    public record RefreshAllVerdict(boolean allowed, String reason) {
    }

    /**
     * Two separate concerns, deliberately not one timestamp: {@code lastRefreshAt} is a
     * mode-independent rate limit on the action itself, and {@code oldestUpdatedAt} is a staleness
     * check on the target mode's data — keyed on the OLDEST row, so one freshly fetched pair can't
     * mask a cache full of stale ones.
     */
    public static RefreshAllVerdict refreshAllGate(Instant now, Instant lastRefreshAt,
            Instant oldestUpdatedAt) {
        if (lastRefreshAt != null && now.isBefore(lastRefreshAt.plus(REFRESH_ALL_COOLDOWN))) {
            return new RefreshAllVerdict(false,
                    "Travel times were refreshed less than an hour ago — try again later.");
        }
        if (oldestUpdatedAt != null && now.isBefore(oldestUpdatedAt.plus(REFRESH_ALL_COOLDOWN))) {
            return new RefreshAllVerdict(false,
                    "All travel times for this mode are under an hour old — use Fetch missing on "
                            + "the Locations page for new pairs.");
        }
        return new RefreshAllVerdict(true, null);
    }
}
