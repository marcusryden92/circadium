package app.circadium.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The profile settings against the retired {@code actions/settings.ts} + {@code actions/onboarding.ts}:
 * the name whitelist, the BYOK/OFF-only AI mode, the lineup-validated AI model, the onboarding stamp —
 * and no {@code dataVersion} movement.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ProfileIntegrationTest {

    private static final String USER = "profile-user";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\", \"dataVersion\") "
                + "VALUES (?, 'Old Name', ?, 3)", USER, USER + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", USER);
    }

    @Test
    void theNamePatchTrimsAndLeavesAbsentAlone() throws Exception {
        mockMvc.perform(patch("/account/profile").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  New Name  \"}"))
                .andExpect(status().isNoContent());
        assertThat(column("name")).isEqualTo("New Name");

        mockMvc.perform(patch("/account/profile").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent());
        assertThat(column("name")).isEqualTo("New Name");
        assertThat(dataVersion()).isEqualTo(3);
    }

    @Test
    void theAiModeAcceptsOnlyByokAndOff() throws Exception {
        mockMvc.perform(put("/account/ai-mode").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"BYOK\"}"))
                .andExpect(status().isNoContent());
        assertThat(column("ai_mode")).isEqualTo("BYOK");

        mockMvc.perform(put("/account/ai-mode").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"OFF\"}"))
                .andExpect(status().isNoContent());
        assertThat(column("ai_mode")).isEqualTo("OFF");

        // MANAGED is reserved for a future app-key paid mode and not settable until that ships.
        mockMvc.perform(put("/account/ai-mode").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"MANAGED\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid mode."));
        assertThat(column("ai_mode")).isEqualTo("OFF");
    }

    @Test
    void theAiModelValidatesAgainstTheLineup() throws Exception {
        mockMvc.perform(put("/account/ai-model").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"model\":\"claude-sonnet-5\"}"))
                .andExpect(status().isNoContent());
        assertThat(column("ai_model")).isEqualTo("claude-sonnet-5");

        mockMvc.perform(put("/account/ai-model").with(asUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"model\":\"gpt-5\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid model."));
        assertThat(column("ai_model")).isEqualTo("claude-sonnet-5");
    }

    @Test
    void onboardingCompletionStampsTheUser() throws Exception {
        assertThat(column("onboarded_at")).isNull();
        mockMvc.perform(post("/account/onboarding-complete").with(asUser()))
                .andExpect(status().isNoContent());
        assertThat(column("onboarded_at")).isNotNull();
        assertThat(dataVersion()).isEqualTo(3);
    }

    @Test
    void everyEndpointRequiresAnAccessToken() throws Exception {
        mockMvc.perform(patch("/account/profile").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"X\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/account/onboarding-complete")).andExpect(status().isUnauthorized());
    }

    /** Cast to text so enum columns compare as their labels. */
    private Object column(String column) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT \"" + column + "\"::text AS value FROM \"users\" WHERE \"id\" = ?", USER);
        return row.get("value");
    }

    private int dataVersion() {
        return jdbcTemplate.queryForObject("SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?",
                Integer.class, USER);
    }

    private RequestPostProcessor asUser() {
        return jwt().jwt(token -> token.subject(USER));
    }
}
