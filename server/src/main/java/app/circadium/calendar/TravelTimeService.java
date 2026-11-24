package app.circadium.calendar;

import app.circadium.auth.AccountFlowException;
import app.circadium.calendar.CalendarContracts.SerializedTravelTime;
import app.circadium.calendar.TravelRefreshPolicy.RefreshAllVerdict;
import app.circadium.external.maps.RoutesClient;
import app.circadium.external.maps.RoutesClient.TravelPair;
import app.circadium.external.maps.RoutesClient.TravelPoint;
import app.circadium.external.maps.RoutesClient.TravelTimeBatchResult;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.Location;
import app.circadium.persistence.entity.TravelTime;
import app.circadium.persistence.entity.UserSchedulingPreferences;
import app.circadium.persistence.enums.TransportMode;
import app.circadium.persistence.repository.LocationRepository;
import app.circadium.persistence.repository.TravelTimeRepository;
import app.circadium.persistence.repository.UserSchedulingPreferencesRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The travel-time fetch flows, ported from {@code actions/locations.ts}: fetch-missing buys only
 * pairs with no fresh row, refresh-all re-buys the whole grid behind two gates, and the top-up
 * (now the nightly job's work) silently refreshes the oldest stale pairs under a per-user daily
 * allowance. Every spend reserves against the account-global budget first; writes preserve custom
 * overrides and negative-cache unroutable pairs. Nothing here moves {@code users.dataVersion}.
 */
@Service
@RequiredArgsConstructor
public class TravelTimeService {

    private final JdbcTemplate jdbcTemplate;
    private final LocationRepository locationRepository;
    private final TravelTimeRepository travelTimeRepository;
    private final UserSchedulingPreferencesRepository preferencesRepository;
    private final TravelApiBudgetService budgetService;
    private final RoutesClient routesClient;
    private final Clock clock;

    public record FetchMissingOutcome(int fetched, int skipped, int failed) {
    }

    public record RefreshAllOutcome(int updated, int failed) {
    }

    public record TopUpOutcome(int refreshed, int failed) {
    }

    /** Buys every directed pair that has no fresh row; a budget refusal answers 409. */
    public FetchMissingOutcome fetchMissing(String userId, TransportMode mode) {
        List<Location> locations = locationRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId);
        if (locations.size() < 2) {
            return new FetchMissingOutcome(0, 0, 0);
        }
        Instant now = DbTime.now(clock);

        Set<String> freshPairs = new HashSet<>();
        for (TravelTime row : travelTimeRepository.findByUserIdAndTransportMode(userId, mode)) {
            if (!TravelRefreshPolicy.needsRefetch(row.getUpdatedAt(), row.getUnroutableAt(), now)) {
                freshPairs.add(pairKey(row.getFromLocationId(), row.getToLocationId()));
            }
        }

        List<TravelPair> missing = new ArrayList<>();
        for (Location from : locations) {
            for (Location to : locations) {
                if (from.getId().equals(to.getId())
                        || freshPairs.contains(pairKey(from.getId(), to.getId()))) {
                    continue;
                }
                missing.add(new TravelPair(point(from), point(to)));
            }
        }
        if (missing.isEmpty()) {
            return new FetchMissingOutcome(0, freshPairs.size(), 0);
        }

        String refusal = budgetService.reserve(missing.size(), mode);
        if (refusal != null) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "travel_budget", refusal);
        }
        WriteCounts counts = writeMatrixResults(userId,
                routesClient.computeTravelTimeMatrix(missing, mode), mode, now);
        return new FetchMissingOutcome(counts.written(), freshPairs.size(), counts.failed());
    }

    /** Re-buys the whole grid behind the hour gates; refusals answer 409 with the gate's reason. */
    public RefreshAllOutcome refreshAll(String userId, TransportMode mode) {
        List<Location> locations = locationRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId);
        if (locations.size() < 2) {
            return new RefreshAllOutcome(0, 0);
        }
        Instant now = DbTime.now(clock);

        Instant lastRefreshAt = preferencesRepository.findByUserId(userId)
                .map(UserSchedulingPreferences::getLastTravelRefreshAt).orElse(null);
        Instant oldestUpdatedAt = travelTimeRepository.findByUserIdAndTransportMode(userId, mode).stream()
                .map(TravelTime::getUpdatedAt)
                .min(Comparator.naturalOrder())
                .orElse(null);
        RefreshAllVerdict verdict = TravelRefreshPolicy.refreshAllGate(now, lastRefreshAt, oldestUpdatedAt);
        if (!verdict.allowed()) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "refresh_gate", verdict.reason());
        }

        List<TravelPair> pairs = new ArrayList<>();
        for (Location from : locations) {
            for (Location to : locations) {
                if (!from.getId().equals(to.getId())) {
                    pairs.add(new TravelPair(point(from), point(to)));
                }
            }
        }
        String refusal = budgetService.reserve(pairs.size(), mode);
        if (refusal != null) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "travel_budget", refusal);
        }
        // Stamped only once the run will actually spend, so a refused attempt keeps the hour free.
        stampPreference(userId, "lastTravelRefreshAt", now);

        WriteCounts counts = writeMatrixResults(userId,
                routesClient.computeTravelTimeMatrix(pairs, mode), mode, now);
        return new RefreshAllOutcome(counts.written(), counts.failed());
    }

    /**
     * The silent capped refresh of the oldest stale pairs, driven by the nightly job. Every gate is
     * a quiet no-op — the flow was fire-and-forget when the client triggered it, and a budget
     * refusal must not burn the user's daily allowance.
     */
    public TopUpOutcome topUp(String userId, TransportMode mode) {
        Instant now = DbTime.now(clock);
        Instant lastTopUpAt = preferencesRepository.findByUserId(userId)
                .map(UserSchedulingPreferences::getLastTravelTopUpAt).orElse(null);
        if (!TravelRefreshPolicy.topUpAllowed(now, lastTopUpAt)) {
            return new TopUpOutcome(0, 0);
        }

        List<TravelTime> stale = travelTimeRepository.findByUserIdAndTransportMode(userId, mode).stream()
                .filter(row -> TravelRefreshPolicy.needsRefetch(row.getUpdatedAt(), row.getUnroutableAt(), now))
                .sorted(Comparator.comparing(TravelTime::getUpdatedAt))
                .limit(TravelRefreshPolicy.STALE_TOP_UP_MAX_PAIRS)
                .toList();
        if (stale.isEmpty()) {
            return new TopUpOutcome(0, 0);
        }

        Map<String, Location> locationsById = locationRepository
                .findByUserIdOrderByCreatedAtAscIdAsc(userId).stream()
                .collect(Collectors.toMap(Location::getId, Function.identity()));
        List<TravelPair> pairs = new ArrayList<>();
        for (TravelTime row : stale) {
            Location from = locationsById.get(row.getFromLocationId());
            Location to = locationsById.get(row.getToLocationId());
            if (from != null && to != null) {
                pairs.add(new TravelPair(point(from), point(to)));
            }
        }
        if (pairs.isEmpty()) {
            return new TopUpOutcome(0, 0);
        }

        if (budgetService.reserve(pairs.size(), mode) != null) {
            return new TopUpOutcome(0, 0);
        }
        // Only a run that passed the budget consumes the day's allowance.
        stampPreference(userId, "lastTravelTopUpAt", now);

        WriteCounts counts = writeMatrixResults(userId,
                routesClient.computeTravelTimeMatrix(pairs, mode), mode, now);
        return new TopUpOutcome(counts.written(), counts.failed());
    }

    public List<SerializedTravelTime> serializedRows(String userId) {
        return travelTimeRepository.findByUserIdOrderById(userId).stream()
                .map(CalendarBootstrapService::toWire)
                .toList();
    }

    record WriteCounts(int written, int failed) {
    }

    /**
     * The one write path for matrix results: a fully routed pair upserts the Google baselines and
     * clears the negative cache; any failed condition stamps {@code unroutableAt} instead, keeping
     * whatever baselines the row already had. Custom overrides are never touched.
     */
    private WriteCounts writeMatrixResults(String userId, List<TravelTimeBatchResult> results,
            TransportMode mode, Instant now) {
        int written = 0;
        int failed = 0;
        for (TravelTimeBatchResult result : results) {
            if (result.allConditionsRouted()) {
                jdbcTemplate.update("INSERT INTO \"TravelTimes\" (\"id\", \"fromLocationId\","
                                + " \"toLocationId\", \"transportMode\", \"googleRushHourMinutes\","
                                + " \"googleRegularMinutes\", \"googleNightMinutes\", \"unroutableAt\","
                                + " \"userId\", \"createdAt\", \"updatedAt\")"
                                + " VALUES (?, ?, ?, ?::\"TransportMode\", ?, ?, ?, NULL, ?, ?, ?)"
                                + " ON CONFLICT (\"fromLocationId\", \"toLocationId\", \"transportMode\")"
                                + " DO UPDATE SET \"googleRushHourMinutes\" = EXCLUDED.\"googleRushHourMinutes\","
                                + " \"googleRegularMinutes\" = EXCLUDED.\"googleRegularMinutes\","
                                + " \"googleNightMinutes\" = EXCLUDED.\"googleNightMinutes\","
                                + " \"unroutableAt\" = NULL, \"updatedAt\" = EXCLUDED.\"updatedAt\"",
                        UUID.randomUUID().toString(), result.fromLocationId(), result.toLocationId(),
                        mode.name(), result.rushHour().durationMinutes(), result.regular().durationMinutes(),
                        result.night().durationMinutes(), userId, DbTime.toDb(now), DbTime.toDb(now));
                written++;
            } else {
                jdbcTemplate.update("INSERT INTO \"TravelTimes\" (\"id\", \"fromLocationId\","
                                + " \"toLocationId\", \"transportMode\", \"googleRushHourMinutes\","
                                + " \"googleRegularMinutes\", \"googleNightMinutes\", \"unroutableAt\","
                                + " \"userId\", \"createdAt\", \"updatedAt\")"
                                + " VALUES (?, ?, ?, ?::\"TransportMode\", 0, 0, 0, ?, ?, ?, ?)"
                                + " ON CONFLICT (\"fromLocationId\", \"toLocationId\", \"transportMode\")"
                                + " DO UPDATE SET \"unroutableAt\" = EXCLUDED.\"unroutableAt\","
                                + " \"updatedAt\" = EXCLUDED.\"updatedAt\"",
                        UUID.randomUUID().toString(), result.fromLocationId(), result.toLocationId(),
                        mode.name(), DbTime.toDb(now), userId, DbTime.toDb(now), DbTime.toDb(now));
                failed++;
            }
        }
        return new WriteCounts(written, failed);
    }

    private void stampPreference(String userId, String column, Instant now) {
        jdbcTemplate.update("INSERT INTO \"UserSchedulingPreferences\" (\"id\", \"userId\", \"" + column
                        + "\", \"createdAt\", \"updatedAt\") VALUES (?, ?, ?, ?, ?)"
                        + " ON CONFLICT (\"userId\") DO UPDATE SET \"" + column + "\" = EXCLUDED.\"" + column
                        + "\", \"updatedAt\" = EXCLUDED.\"updatedAt\"",
                UUID.randomUUID().toString(), userId, DbTime.toDb(now), DbTime.toDb(now), DbTime.toDb(now));
    }

    private static TravelPoint point(Location location) {
        return new TravelPoint(location.getId(), location.getLat(), location.getLng());
    }

    private static String pairKey(String fromId, String toId) {
        return fromId + "->" + toId;
    }
}
