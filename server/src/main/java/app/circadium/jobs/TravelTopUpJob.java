package app.circadium.jobs;

import app.circadium.calendar.TravelTimeService;
import app.circadium.calendar.TravelTimeService.TopUpOutcome;
import app.circadium.external.maps.MapsNotConfiguredException;
import app.circadium.external.maps.MapsProperties;
import app.circadium.persistence.enums.TransportMode;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The nightly travel-time top-up: what the retired client-triggered flow did once per app load now
 * runs server-side, so a cache keeps freshening whether or not its user visits. Per user with at
 * least two locations: the 24h {@code lastTravelTopUpAt} allowance, the oldest stale pairs capped
 * at {@code STALE_TOP_UP_MAX_PAIRS}, and a quiet stop when the monthly budget is spent — the same
 * silent semantics the client path had. Clients see fresh rows on their next bootstrap.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TravelTopUpJob {

    private final TravelTimeService travelTimeService;
    private final MapsProperties mapsProperties;
    private final JdbcTemplate jdbcTemplate;

    @Scheduled(cron = "0 40 3 * * *", zone = "UTC")
    @SchedulerLock(name = "travel-top-up", lockAtLeastFor = "PT5M", lockAtMostFor = "PT30M")
    public void run() {
        if (!mapsProperties.configured()) {
            return;
        }
        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT l.\"userId\" AS id, p.\"defaultTransportMode\"::text AS mode"
                        + " FROM \"Locations\" l"
                        + " LEFT JOIN \"UserSchedulingPreferences\" p ON p.\"userId\" = l.\"userId\""
                        + " GROUP BY l.\"userId\", p.\"defaultTransportMode\""
                        + " HAVING count(*) >= 2 ORDER BY l.\"userId\"");

        int refreshed = 0;
        int failed = 0;
        for (Map<String, Object> user : users) {
            String userId = (String) user.get("id");
            TransportMode mode = user.get("mode") == null
                    ? TransportMode.DRIVING
                    : TransportMode.valueOf((String) user.get("mode"));
            try {
                TopUpOutcome outcome = travelTimeService.topUp(userId, mode);
                refreshed += outcome.refreshed();
                failed += outcome.failed();
            } catch (MapsNotConfiguredException e) {
                return;
            } catch (RuntimeException e) {
                // One account's failure must not starve the rest; the pair stays stale and the
                // next night retries it.
                log.warn("Travel top-up failed for a user ({})", e.getMessage());
            }
        }
        if (refreshed > 0 || failed > 0) {
            log.info("Travel top-up refreshed {} pair(s), negative-cached {}", refreshed, failed);
        }
    }
}
