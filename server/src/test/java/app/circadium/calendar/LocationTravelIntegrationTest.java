package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.external.maps.FakePlacesClient;
import app.circadium.external.maps.FakeRoutesClient;
import app.circadium.external.maps.PlacesClient.PlaceDetails;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The location and travel-time endpoints against the retired Prisma actions' semantics: the
 * location cap and duplicate guard, the Places details write, the place-change travel cascade,
 * TTL and negative-cache freshness, the budget reservation and its month reset, the refresh-all
 * gates, custom-override preservation, and no {@code dataVersion} movement anywhere.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, LocationTravelIntegrationTest.FrozenClock.class})
class LocationTravelIntegrationTest {

    private static final Instant FROZEN_NOW = Instant.parse("2026-05-10T08:00:00Z");
    private static final String USER = "location-user";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    FakePlacesClient placesClient;

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
        placesClient.reset();
        routesClient.reset();
        jdbcTemplate.update("DELETE FROM \"TravelApiBudget\"");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 3)",
                USER, USER + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", USER);
        jdbcTemplate.update("DELETE FROM \"TravelApiBudget\"");
    }

    @Test
    void createsALocationFromPlaceDetails() throws Exception {
        placesClient.detailsByPlaceId.put("place-office",
                new PlaceDetails("place-office", "1 Main Street", 59.3293, 18.0686));

        mockMvc.perform(create(USER, "Office", "place-office"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Office"))
                .andExpect(jsonPath("$.address").value("1 Main Street"))
                .andExpect(jsonPath("$.placeId").value("place-office"));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT \"name\", \"address\", \"lat\", \"lng\" FROM \"Locations\" WHERE \"userId\" = ?", USER);
        assertThat(row.get("address")).isEqualTo("1 Main Street");
        assertThat((Double) row.get("lat")).isEqualTo(59.3293);

        mockMvc.perform(create(USER, "Office again", "place-office"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("duplicate_place"));
    }

    @Test
    void theLocationCapIsFive() throws Exception {
        for (int i = 0; i < 5; i++) {
            placesClient.detailsByPlaceId.put("place-" + i,
                    new PlaceDetails("place-" + i, i + " Street", 59.0 + i, 18.0 + i));
            mockMvc.perform(create(USER, "Location " + i, "place-" + i)).andExpect(status().isOk());
        }
        placesClient.detailsByPlaceId.put("place-5", new PlaceDetails("place-5", "5 Street", 64.0, 23.0));
        mockMvc.perform(create(USER, "One too many", "place-5"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("location_limit"));
    }

    @Test
    void aPlaceChangeRefetchesDetailsAndDropsTheCachedMatrix() throws Exception {
        String a = insertLocation(USER, "loc-a", "Home", "place-a", FROZEN_NOW);
        String b = insertLocation(USER, "loc-b", "Office", "place-b", FROZEN_NOW);
        insertTravelTime(USER, "tt-1", a, b, "DRIVING", 20, FROZEN_NOW, null, null);
        insertTravelTime(USER, "tt-2", b, a, "DRIVING", 22, FROZEN_NOW, null, null);

        placesClient.detailsByPlaceId.put("place-c", new PlaceDetails("place-c", "3 New Road", 60.0, 19.0));
        mockMvc.perform(patch("/locations/{id}", a).with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Moved home\",\"placeId\":\"place-c\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.address").value("3 New Road"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"TravelTimes\" WHERE \"userId\" = ?", Integer.class, USER)).isZero();

        mockMvc.perform(patch("/locations/{id}", b).with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed office\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed office"));
        // A rename alone never calls Places.
        assertThat(placesClient.detailsCalls.get()).isEqualTo(1);

        mockMvc.perform(patch("/locations/{id}", "someone-elses").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("location_not_found"));
    }

    @Test
    void fetchMissingBuysOnlyPairsWithoutAFreshRow() throws Exception {
        String a = insertLocation(USER, "loc-a", "Home", "place-a", FROZEN_NOW);
        String b = insertLocation(USER, "loc-b", "Office", "place-b", FROZEN_NOW);
        insertTravelTime(USER, "tt-fresh", a, b, "DRIVING", 25, FROZEN_NOW.minus(Duration.ofDays(10)),
                17, null);

        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetched").value(1))
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.failed").value(0))
                .andExpect(jsonPath("$.travelTimes.length()").value(2));

        Map<String, Object> bought = jdbcTemplate.queryForMap("SELECT \"googleRushHourMinutes\","
                + " \"googleRegularMinutes\", \"googleNightMinutes\" FROM \"TravelTimes\""
                + " WHERE \"fromLocationId\" = ? AND \"toLocationId\" = ?", b, a);
        assertThat(bought.get("googleRushHourMinutes")).isEqualTo(10);
        assertThat(bought.get("googleRegularMinutes")).isEqualTo(11);
        assertThat(bought.get("googleNightMinutes")).isEqualTo(12);
        // The fresh row kept its values and its custom override.
        Map<String, Object> kept = jdbcTemplate.queryForMap("SELECT \"googleRushHourMinutes\","
                + " \"customRushHourMinutes\" FROM \"TravelTimes\" WHERE \"id\" = 'tt-fresh'");
        assertThat(kept.get("googleRushHourMinutes")).isEqualTo(25);
        assertThat(kept.get("customRushHourMinutes")).isEqualTo(17);

        // Every pair fresh now: nothing bought, nothing billed.
        int spentBefore = budgetCount();
        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetched").value(0))
                .andExpect(jsonPath("$.skipped").value(2));
        assertThat(budgetCount()).isEqualTo(spentBefore);
    }

    @Test
    void aStaleRowAndAnUnroutablePairAreReboughtAndNegativeCached() throws Exception {
        String a = insertLocation(USER, "loc-a", "Home", "place-a", FROZEN_NOW);
        String b = insertLocation(USER, "loc-b", "Office", "place-b", FROZEN_NOW);
        // Stale routable row (past the 180d TTL) with an override that must survive the re-buy.
        insertTravelTime(USER, "tt-stale", a, b, "DRIVING", 25,
                FROZEN_NOW.minus(Duration.ofDays(181)), 17, null);
        routesClient.unroutablePairs.add(b + "->" + a);

        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetched").value(1))
                .andExpect(jsonPath("$.failed").value(1));

        Map<String, Object> rebought = jdbcTemplate.queryForMap("SELECT \"id\","
                + " \"googleRushHourMinutes\", \"customRushHourMinutes\", \"unroutableAt\""
                + " FROM \"TravelTimes\" WHERE \"fromLocationId\" = ? AND \"toLocationId\" = ?", a, b);
        assertThat(rebought.get("id")).isEqualTo("tt-stale");
        assertThat(rebought.get("googleRushHourMinutes")).isEqualTo(10);
        assertThat(rebought.get("customRushHourMinutes")).isEqualTo(17);
        assertThat(rebought.get("unroutableAt")).isNull();

        Map<String, Object> unrouted = jdbcTemplate.queryForMap("SELECT \"googleRushHourMinutes\","
                + " \"unroutableAt\" FROM \"TravelTimes\" WHERE \"fromLocationId\" = ?"
                + " AND \"toLocationId\" = ?", b, a);
        assertThat(unrouted.get("googleRushHourMinutes")).isEqualTo(0);
        assertThat(unrouted.get("unroutableAt")).isNotNull();

        // Inside the 30-day retry window the no-route verdict is trusted, not re-bought.
        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetched").value(0))
                .andExpect(jsonPath("$.skipped").value(2));
    }

    @Test
    void theMonthlyBudgetRefusesAndResetsOnTheFirst() throws Exception {
        insertLocation(USER, "loc-a", "Home", "place-a", FROZEN_NOW);
        insertLocation(USER, "loc-b", "Office", "place-b", FROZEN_NOW);
        jdbcTemplate.update("INSERT INTO \"TravelApiBudget\" (\"id\", \"elementsThisMonth\","
                        + " \"periodStart\", \"updatedAt\") VALUES ('global', 4495, ?, ?)",
                LocalDateTime.of(2026, 5, 1, 0, 0), LocalDateTime.of(2026, 5, 1, 0, 0));

        // 2 pairs x 3 conditions = 6 elements; 4495 + 6 > 4500.
        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("travel_budget"));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"TravelTimes\" WHERE \"userId\" = ?", Integer.class, USER)).isZero();

        // A counter from LAST month resets instead.
        jdbcTemplate.update("UPDATE \"TravelApiBudget\" SET \"periodStart\" = ?",
                LocalDateTime.of(2026, 4, 1, 0, 0));
        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fetched").value(2));
        assertThat(budgetCount()).isEqualTo(6);
    }

    @Test
    void refreshAllSitsBehindTheHourGatesAndStampsItsRun() throws Exception {
        String a = insertLocation(USER, "loc-a", "Home", "place-a", FROZEN_NOW);
        String b = insertLocation(USER, "loc-b", "Office", "place-b", FROZEN_NOW);
        insertTravelTime(USER, "tt-1", a, b, "DRIVING", 25, FROZEN_NOW.minus(Duration.ofMinutes(30)),
                null, null);

        // The mode's rows are under an hour old.
        mockMvc.perform(travel(USER, "/travel-times/refresh-all", "DRIVING"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("refresh_gate"));

        jdbcTemplate.update("UPDATE \"TravelTimes\" SET \"updatedAt\" = ? WHERE \"id\" = 'tt-1'",
                LocalDateTime.ofInstant(FROZEN_NOW.minus(Duration.ofHours(2)), ZoneOffset.UTC));
        mockMvc.perform(travel(USER, "/travel-times/refresh-all", "DRIVING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(2))
                .andExpect(jsonPath("$.travelTimes.length()").value(2));
        assertThat(jdbcTemplate.queryForObject("SELECT \"lastTravelRefreshAt\" FROM"
                + " \"UserSchedulingPreferences\" WHERE \"userId\" = ?", LocalDateTime.class, USER))
                .isNotNull();

        // The action cooldown now refuses a second run inside the hour.
        jdbcTemplate.update("UPDATE \"TravelTimes\" SET \"updatedAt\" = ?",
                LocalDateTime.ofInstant(FROZEN_NOW.minus(Duration.ofHours(2)), ZoneOffset.UTC));
        mockMvc.perform(travel(USER, "/travel-times/refresh-all", "DRIVING"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("refresh_gate"));
    }

    @Test
    void searchIsThrottledPerUser() throws Exception {
        for (int i = 0; i < 30; i++) {
            mockMvc.perform(search(USER, "query " + i)).andExpect(status().isOk());
        }
        mockMvc.perform(search(USER, "one more"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("search_throttled"));
    }

    @Test
    void nothingHereMovesDataVersion() throws Exception {
        placesClient.detailsByPlaceId.put("place-a", new PlaceDetails("place-a", "1 Street", 59.0, 18.0));
        placesClient.detailsByPlaceId.put("place-b", new PlaceDetails("place-b", "2 Street", 59.1, 18.1));
        mockMvc.perform(create(USER, "Home", "place-a")).andExpect(status().isOk());
        mockMvc.perform(create(USER, "Office", "place-b")).andExpect(status().isOk());
        mockMvc.perform(travel(USER, "/travel-times/fetch-missing", "DRIVING")).andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, USER)).isEqualTo(3);
    }

    @Test
    void everyEndpointRequiresAnAccessToken() throws Exception {
        mockMvc.perform(post("/locations/search").contentType(MediaType.APPLICATION_JSON)
                .content("{\"query\":\"x\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/locations").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\",\"placeId\":\"p\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/locations/{id}", "x").contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/travel-times/fetch-missing").contentType(MediaType.APPLICATION_JSON)
                .content("{\"transportMode\":\"DRIVING\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/travel-times/refresh-all").contentType(MediaType.APPLICATION_JSON)
                .content("{\"transportMode\":\"DRIVING\"}")).andExpect(status().isUnauthorized());
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private MockHttpServletRequestBuilder create(String userId, String name, String placeId) {
        return post("/locations").with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\",\"placeId\":\"" + placeId + "\"}");
    }

    private MockHttpServletRequestBuilder search(String userId, String query) {
        return post("/locations/search").with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"query\":\"" + query + "\"}");
    }

    private MockHttpServletRequestBuilder travel(String userId, String path, String mode) {
        return post(path).with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"transportMode\":\"" + mode + "\"}");
    }

    private String insertLocation(String userId, String id, String name, String placeId, Instant at) {
        jdbcTemplate.update("INSERT INTO \"Locations\" (\"id\", \"name\", \"address\", \"placeId\","
                        + " \"lat\", \"lng\", \"userId\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?, 59.0, 18.0, ?, ?, ?)",
                id, name, name + " street", placeId, userId,
                LocalDateTime.ofInstant(at, ZoneOffset.UTC), LocalDateTime.ofInstant(at, ZoneOffset.UTC));
        return id;
    }

    private void insertTravelTime(String userId, String id, String fromId, String toId, String mode,
            int minutes, Instant updatedAt, Integer customRush, Instant unroutableAt) {
        jdbcTemplate.update("INSERT INTO \"TravelTimes\" (\"id\", \"fromLocationId\", \"toLocationId\","
                        + " \"transportMode\", \"googleRushHourMinutes\", \"googleRegularMinutes\","
                        + " \"googleNightMinutes\", \"customRushHourMinutes\", \"unroutableAt\","
                        + " \"userId\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?::\"TransportMode\", ?, ?, ?, ?, ?, ?, ?, ?)",
                id, fromId, toId, mode, minutes, minutes, minutes, customRush,
                unroutableAt == null ? null : LocalDateTime.ofInstant(unroutableAt, ZoneOffset.UTC),
                userId, LocalDateTime.ofInstant(updatedAt, ZoneOffset.UTC),
                LocalDateTime.ofInstant(updatedAt, ZoneOffset.UTC));
    }

    private int budgetCount() {
        Integer count = jdbcTemplate.query("SELECT \"elementsThisMonth\" FROM \"TravelApiBudget\""
                        + " WHERE \"id\" = 'global'",
                rs -> rs.next() ? rs.getInt(1) : 0);
        return count == null ? 0 : count;
    }
}
