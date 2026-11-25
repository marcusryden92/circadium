package app.circadium.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import app.circadium.TestcontainersConfiguration;
import app.circadium.external.maps.FakeRoutesClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The nightly top-up against the retired client-triggered flow's semantics: oldest stale pairs
 * first under the 10-pair cap, a 24-hour per-user allowance consumed only by a run that passed
 * the budget, and a quiet stop when the monthly budget is spent.
 */
@SpringBootTest(properties = "circadium.maps.api-key=test-key")
@Import({TestcontainersConfiguration.class, TravelTopUpJobTest.FrozenClock.class})
class TravelTopUpJobTest {

    private static final Instant FROZEN_NOW = Instant.parse("2026-06-01T03:40:00Z");
    private static final String USER = "top-up-user";

    @Autowired
    TravelTopUpJob job;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    FakeRoutesClient routesClient;

    @TestConfiguration(proxyBeanMethods = false)
    static class FrozenClock {

        @Bean
        @Primary
        Clock frozenClock() {
            return Clock.fixed(FROZEN_NOW, ZoneOffset.UTC);
        }
    }

    @BeforeEach
    void seed() {
        routesClient.reset();
        jdbcTemplate.update("DELETE FROM \"TravelApiBudget\"");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 2)",
                USER, USER + "@example.test");
        insertLocation("loc-a", "place-a");
        insertLocation("loc-b", "place-b");
        // One stale routable pair, one fresh pair: the run must buy exactly the stale one.
        insertTravelTime("tt-stale", "loc-a", "loc-b", FROZEN_NOW.minus(Duration.ofDays(200)));
        insertTravelTime("tt-fresh", "loc-b", "loc-a", FROZEN_NOW.minus(Duration.ofDays(2)));
    }

    @AfterEach
    void cleanUp() {
        // No FK from the preferences table to users (NextAuth-era shape): the allowance stamp
        // must go explicitly or it leaks into the next test.
        jdbcTemplate.update("DELETE FROM \"UserSchedulingPreferences\" WHERE \"userId\" = ?", USER);
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", USER);
        jdbcTemplate.update("DELETE FROM \"TravelApiBudget\"");
    }

    @Test
    void refreshesOnlyStalePairsAndConsumesTheDailyAllowance() {
        job.run();

        assertThat(routesClient.calls).hasSize(1);
        assertThat(routesClient.calls.get(0)).hasSize(1);
        assertThat(jdbcTemplate.queryForObject("SELECT \"googleRushHourMinutes\" FROM \"TravelTimes\""
                + " WHERE \"id\" = 'tt-stale'", Integer.class)).isEqualTo(10);
        assertThat(jdbcTemplate.queryForObject("SELECT \"googleRushHourMinutes\" FROM \"TravelTimes\""
                + " WHERE \"id\" = 'tt-fresh'", Integer.class)).isEqualTo(25);
        assertThat(jdbcTemplate.queryForObject("SELECT \"lastTravelTopUpAt\" FROM"
                + " \"UserSchedulingPreferences\" WHERE \"userId\" = ?", LocalDateTime.class, USER))
                .isEqualTo(LocalDateTime.ofInstant(FROZEN_NOW, ZoneOffset.UTC));

        // Same day again: the allowance refuses before anything is bought.
        jdbcTemplate.update("UPDATE \"TravelTimes\" SET \"updatedAt\" = ? WHERE \"id\" = 'tt-stale'",
                LocalDateTime.ofInstant(FROZEN_NOW.minus(Duration.ofDays(200)), ZoneOffset.UTC));
        job.run();
        assertThat(routesClient.calls).hasSize(1);
    }

    @Test
    void aSpentBudgetIsAQuietStopThatKeepsTheAllowance() {
        jdbcTemplate.update("INSERT INTO \"TravelApiBudget\" (\"id\", \"elementsThisMonth\","
                        + " \"periodStart\", \"updatedAt\") VALUES ('global', 4500, ?, ?)",
                LocalDateTime.of(2026, 6, 1, 0, 0), LocalDateTime.of(2026, 6, 1, 0, 0));

        job.run();

        assertThat(routesClient.calls).isEmpty();
        // The refused run must not burn the user's daily allowance.
        assertThat(jdbcTemplate.queryForList("SELECT \"lastTravelTopUpAt\" FROM"
                + " \"UserSchedulingPreferences\" WHERE \"userId\" = ?", USER)).isEmpty();
    }

    private void insertLocation(String id, String placeId) {
        jdbcTemplate.update("INSERT INTO \"Locations\" (\"id\", \"name\", \"address\", \"placeId\","
                        + " \"lat\", \"lng\", \"userId\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?, 59.0, 18.0, ?, now(), now())",
                id, id, id + " street", placeId, USER);
    }

    private void insertTravelTime(String id, String fromId, String toId, Instant updatedAt) {
        jdbcTemplate.update("INSERT INTO \"TravelTimes\" (\"id\", \"fromLocationId\", \"toLocationId\","
                        + " \"transportMode\", \"googleRushHourMinutes\", \"googleRegularMinutes\","
                        + " \"googleNightMinutes\", \"userId\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, 'DRIVING'::\"TransportMode\", 25, 25, 25, ?, ?, ?)",
                id, fromId, toId, USER,
                LocalDateTime.ofInstant(updatedAt, ZoneOffset.UTC),
                LocalDateTime.ofInstant(updatedAt, ZoneOffset.UTC));
    }
}
