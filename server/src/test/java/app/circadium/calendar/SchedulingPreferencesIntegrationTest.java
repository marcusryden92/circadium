package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import org.springframework.test.json.JsonCompareMode;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The preferences PATCH against the two retired Prisma upserts: only provided fields change, a create
 * takes the column defaults for the rest (buffer 10, DRIVING, week start 1; the missing-row read
 * fallback of 5 is the bootstrap's business), the TS weekday range check holds, and nothing moves
 * {@code dataVersion}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SchedulingPreferencesIntegrationTest {

    private static final String USER = "preferences-user";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 6)",
                USER, USER + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        // No FK from this table to users (NextAuth-era shape), so the user delete never cascades here.
        jdbcTemplate.update("DELETE FROM \"UserSchedulingPreferences\" WHERE \"userId\" = ?", USER);
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", USER);
    }

    @Test
    void aBufferOnlyCreateTakesTheColumnDefaultsForTheRest() throws Exception {
        mockMvc.perform(update(USER, "{\"bufferTimeMinutes\":25}"))
                .andExpect(status().isOk())
                .andExpect(content().json(
                        "{\"bufferTimeMinutes\":25,\"defaultTransportMode\":\"DRIVING\",\"weekStartDay\":1}", JsonCompareMode.STRICT));

        Map<String, Object> row = row();
        assertThat(row.get("bufferTimeMinutes")).isEqualTo(25);
        assertThat(row.get("weekStartDay")).isEqualTo(1);
        assertThat(row.get("defaultTransportMode")).isEqualTo("DRIVING");
    }

    @Test
    void aWeekStartOnlyCreateMaterializesTheColumnDefaultBuffer() throws Exception {
        mockMvc.perform(update(USER, "{\"weekStartDay\":0}"))
                .andExpect(status().isOk())
                .andExpect(content().json(
                        "{\"bufferTimeMinutes\":10,\"defaultTransportMode\":\"DRIVING\",\"weekStartDay\":0}", JsonCompareMode.STRICT));
    }

    @Test
    void anUpdatePatchesOnlyTheProvidedFields() throws Exception {
        mockMvc.perform(update(USER, "{\"bufferTimeMinutes\":25}")).andExpect(status().isOk());
        Map<String, Object> created = row();

        mockMvc.perform(update(USER, "{\"weekStartDay\":6}"))
                .andExpect(status().isOk())
                .andExpect(content().json(
                        "{\"bufferTimeMinutes\":25,\"defaultTransportMode\":\"DRIVING\",\"weekStartDay\":6}", JsonCompareMode.STRICT));

        Map<String, Object> updated = row();
        assertThat(updated.get("id")).isEqualTo(created.get("id"));
        assertThat(updated.get("createdAt")).isEqualTo(created.get("createdAt"));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"UserSchedulingPreferences\" WHERE \"userId\" = ?", Integer.class, USER))
                .isEqualTo(1);
    }

    @Test
    void bothFieldsPatchTogether() throws Exception {
        mockMvc.perform(update(USER, "{\"bufferTimeMinutes\":0,\"weekStartDay\":6}"))
                .andExpect(status().isOk())
                .andExpect(content().json(
                        "{\"bufferTimeMinutes\":0,\"defaultTransportMode\":\"DRIVING\",\"weekStartDay\":6}", JsonCompareMode.STRICT));
    }

    @Test
    void anEmptyOrOutOfRangePatchIsRejected() throws Exception {
        mockMvc.perform(update(USER, "{}")).andExpect(status().isBadRequest());
        mockMvc.perform(update(USER, "{\"weekStartDay\":7}")).andExpect(status().isBadRequest());
        mockMvc.perform(update(USER, "{\"weekStartDay\":-1}")).andExpect(status().isBadRequest());
        mockMvc.perform(update(USER, "{\"bufferTimeMinutes\":-5}")).andExpect(status().isBadRequest());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"UserSchedulingPreferences\" WHERE \"userId\" = ?", Integer.class, USER))
                .isZero();
    }

    @Test
    void preferencesNeverMoveDataVersion() throws Exception {
        mockMvc.perform(update(USER, "{\"bufferTimeMinutes\":25}")).andExpect(status().isOk());
        mockMvc.perform(update(USER, "{\"weekStartDay\":0}")).andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, USER)).isEqualTo(6);
    }

    @Test
    void requiresAnAccessToken() throws Exception {
        mockMvc.perform(patch("/scheduling/preferences").contentType(MediaType.APPLICATION_JSON)
                .content("{\"bufferTimeMinutes\":25}")).andExpect(status().isUnauthorized());
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private MockHttpServletRequestBuilder update(String userId, String body) {
        return patch("/scheduling/preferences").with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap("SELECT \"id\", \"bufferTimeMinutes\", \"defaultTransportMode\"::text AS"
                + " \"defaultTransportMode\", \"weekStartDay\", \"createdAt\"::text AS \"createdAt\""
                + " FROM \"UserSchedulingPreferences\" WHERE \"userId\" = ?", USER);
    }
}
