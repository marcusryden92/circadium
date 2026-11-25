package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import java.time.Clock;
import java.time.Instant;
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

/**
 * The occurrence-completion log endpoints against the retired Prisma action's exact semantics: upsert on
 * (plannerId, occurrenceKey) that keeps id and createdAt on the update branch, caller-scoped reads and
 * writes, a no-op delete for a missing row, and no {@code dataVersion} movement anywhere.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, OccurrenceCompletionIntegrationTest.FrozenClock.class})
class OccurrenceCompletionIntegrationTest {

    private static final Instant FROZEN_NOW = Instant.parse("2026-04-01T09:30:00Z");
    private static final String FROZEN_ISO = "2026-04-01T09:30:00.000Z";
    private static final String USER = "completion-user";
    private static final String OTHER = "completion-other";
    private static final String PLANNER = "completion-planner";
    private static final String OTHER_PLANNER = "completion-other-planner";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

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
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 4), (?, ?, 2)",
                USER, USER + "@example.test", OTHER, OTHER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"Planners\" (\"id\", \"title\", \"plannerType\", \"isTriaged\","
                        + " \"duration\", \"sortOrder\", \"priority\", \"userId\", \"useParentLocation\","
                        + " \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, 'Mine', 'task', true, 30, 0, 1, ?, false, now(), now()),"
                        + " (?, 'Theirs', 'task', true, 30, 0, 1, ?, false, now(), now())",
                PLANNER, USER, OTHER_PLANNER, OTHER);
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" IN (?, ?)", USER, OTHER);
    }

    @Test
    void logsReadsAndUnlogsACompletion() throws Exception {
        mockMvc.perform(get("/calendar/occurrence-completions").with(asUser(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        mockMvc.perform(log(USER, PLANNER, "2026-W14", "2026-04-01T08:00:00.000Z", "2026-04-01T08:30:00.000Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannerId").value(PLANNER))
                .andExpect(jsonPath("$.userId").value(USER))
                .andExpect(jsonPath("$.occurrenceKey").value("2026-W14"))
                .andExpect(jsonPath("$.start").value("2026-04-01T08:00:00.000Z"))
                .andExpect(jsonPath("$.end").value("2026-04-01T08:30:00.000Z"))
                .andExpect(jsonPath("$.createdAt").value(FROZEN_ISO))
                .andExpect(jsonPath("$.id").isNotEmpty());

        mockMvc.perform(get("/calendar/occurrence-completions").with(asUser(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].occurrenceKey").value("2026-W14"))
                .andExpect(jsonPath("$[0].createdAt").value(FROZEN_ISO));

        mockMvc.perform(delete("/calendar/occurrence-completions")
                        .param("plannerId", PLANNER).param("occurrenceKey", "2026-W14").with(asUser(USER)))
                .andExpect(status().isNoContent());
        assertThat(completionCount(USER)).isZero();
    }

    @Test
    void reloggingTheSameOccurrenceMovesOnlyItsWindow() throws Exception {
        mockMvc.perform(log(USER, PLANNER, "2026-04-01", "2026-04-01T08:00:00.000Z", "2026-04-01T08:30:00.000Z"))
                .andExpect(status().isOk());
        Map<String, Object> created = row(PLANNER, "2026-04-01");

        mockMvc.perform(log(USER, PLANNER, "2026-04-01", "2026-04-01T10:00:00.000Z", "2026-04-01T10:45:00.000Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(created.get("id").toString()))
                .andExpect(jsonPath("$.createdAt").value(FROZEN_ISO));

        Map<String, Object> updated = row(PLANNER, "2026-04-01");
        assertThat(updated.get("id")).isEqualTo(created.get("id"));
        assertThat(updated.get("createdAt")).isEqualTo(created.get("createdAt"));
        assertThat(updated.get("start")).isEqualTo("2026-04-01T10:00:00.000Z");
        assertThat(updated.get("end")).isEqualTo("2026-04-01T10:45:00.000Z");
        assertThat(completionCount(USER)).isEqualTo(1);
    }

    @Test
    void anotherUsersPlannerIsNotFoundAndNothingIsWritten() throws Exception {
        mockMvc.perform(log(USER, OTHER_PLANNER, "2026-04-01", "a", "b"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("item_not_found"));
        mockMvc.perform(log(USER, "no-such-planner", "2026-04-01", "a", "b"))
                .andExpect(status().isNotFound());
        assertThat(completionCount(USER)).isZero();
        assertThat(completionCount(OTHER)).isZero();
    }

    @Test
    void readsAndDeletesAreScopedToTheCaller() throws Exception {
        mockMvc.perform(log(OTHER, OTHER_PLANNER, "2026-04-01", "a", "b")).andExpect(status().isOk());

        mockMvc.perform(get("/calendar/occurrence-completions").with(asUser(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        // Deleting someone else's row, or one that never existed, is the TS deleteMany no-op.
        mockMvc.perform(delete("/calendar/occurrence-completions")
                        .param("plannerId", OTHER_PLANNER).param("occurrenceKey", "2026-04-01").with(asUser(USER)))
                .andExpect(status().isNoContent());
        assertThat(completionCount(OTHER)).isEqualTo(1);
    }

    @Test
    void theLogNeverMovesDataVersion() throws Exception {
        mockMvc.perform(log(USER, PLANNER, "2026-04-01", "a", "b")).andExpect(status().isOk());
        mockMvc.perform(log(USER, PLANNER, "2026-04-01", "c", "d")).andExpect(status().isOk());
        mockMvc.perform(delete("/calendar/occurrence-completions")
                        .param("plannerId", PLANNER).param("occurrenceKey", "2026-04-01").with(asUser(USER)))
                .andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, USER)).isEqualTo(4);
    }

    @Test
    void aMissingFieldIsRejected() throws Exception {
        mockMvc.perform(put("/calendar/occurrence-completions").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"plannerId\":\"" + PLANNER + "\",\"occurrenceKey\":\"k\",\"start\":\"a\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void everyEndpointRequiresAnAccessToken() throws Exception {
        mockMvc.perform(get("/calendar/occurrence-completions")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/calendar/occurrence-completions").contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/calendar/occurrence-completions")
                .param("plannerId", "p").param("occurrenceKey", "k")).andExpect(status().isUnauthorized());
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder log(String userId,
            String plannerId, String occurrenceKey, String start, String end) {
        return put("/calendar/occurrence-completions").with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plannerId\":\"" + plannerId + "\",\"occurrenceKey\":\"" + occurrenceKey
                        + "\",\"start\":\"" + start + "\",\"end\":\"" + end + "\"}");
    }

    private int completionCount(String userId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"HabitCompletions\" WHERE \"userId\" = ?", Integer.class, userId);
    }

    private Map<String, Object> row(String plannerId, String occurrenceKey) {
        return jdbcTemplate.queryForMap("SELECT \"id\", \"start\", \"end\", \"createdAt\"::text AS \"createdAt\""
                + " FROM \"HabitCompletions\" WHERE \"plannerId\" = ? AND \"occurrenceKey\" = ?",
                plannerId, occurrenceKey);
    }
}
