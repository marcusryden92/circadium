package app.circadium.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The feedback inspector against the retired {@code actions/adminFeedback.ts}: the security chain's
 * ADMIN+2FA gate (an ordinary user and a password-only admin both bounce), the blob-free list with
 * snapshot presence, the snapshot read, the GDPR clear-snapshot, and the delete.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminFeedbackIntegrationTest {

    private static final String ADMIN = "admin-feedback-admin";
    private static final String REPORTER = "admin-feedback-reporter";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\", \"role\") "
                + "VALUES (?, 'The Admin', ?, 'ADMIN')", ADMIN, ADMIN + "@example.test");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\") "
                + "VALUES (?, 'Reporting User', ?)", REPORTER, REPORTER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"FeedbackReports\" (\"id\", \"message\", \"dataSnapshot\", "
                + "\"userId\", \"createdAt\") VALUES "
                + "('report-with', 'It broke', '{\"meta\":{\"format\":\"circadium.data-export.v1\"},"
                + "\"planners\":[]}'::jsonb, ?, '2026-01-02 03:04:05.678'), "
                + "('report-without', 'Just a note', NULL, ?, '2026-01-03 03:04:05.678')",
                REPORTER, REPORTER);
    }

    @AfterEach
    void cleanUp() {
        for (String user : List.of(ADMIN, REPORTER)) {
            jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", user);
        }
    }

    @Test
    void theGateAdmitsOnlyAnAdminWhoPassedTwoFactor() throws Exception {
        mockMvc.perform(get("/admin/feedback-reports")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/admin/feedback-reports").with(asUser(REPORTER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/admin/feedback-reports").with(asAdminWithoutMfa()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/admin/feedback-reports").with(asAdmin()))
                .andExpect(status().isOk());
    }

    @Test
    void theListCarriesPresenceAndUserDetailsButNeverTheBlob() throws Exception {
        String body = mockMvc.perform(get("/admin/feedback-reports").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // Newest first.
                .andExpect(jsonPath("$[0].id").value("report-without"))
                .andExpect(jsonPath("$[0].hasSnapshot").value(false))
                .andExpect(jsonPath("$[1].id").value("report-with"))
                .andExpect(jsonPath("$[1].hasSnapshot").value(true))
                .andExpect(jsonPath("$[1].message").value("It broke"))
                .andExpect(jsonPath("$[1].userName").value("Reporting User"))
                .andExpect(jsonPath("$[1].userEmail").value(REPORTER + "@example.test"))
                .andExpect(jsonPath("$[1].createdAt").value("2026-01-02T03:04:05.678Z"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("circadium.data-export.v1");
    }

    @Test
    void theSnapshotReadsWholeOrNull() throws Exception {
        mockMvc.perform(get("/admin/feedback-reports/report-with/snapshot").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.meta.format").value("circadium.data-export.v1"));
        mockMvc.perform(get("/admin/feedback-reports/report-without/snapshot").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(content().string("null"));
        mockMvc.perform(get("/admin/feedback-reports/ghost/snapshot").with(asAdmin()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("report_not_found"));
    }

    @Test
    void clearingDropsJustTheSnapshot() throws Exception {
        mockMvc.perform(delete("/admin/feedback-reports/report-with/snapshot").with(asAdmin()))
                .andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForMap(
                "SELECT \"message\", \"dataSnapshot\" FROM \"FeedbackReports\" WHERE \"id\" = 'report-with'"))
                .containsEntry("message", "It broke")
                .containsEntry("dataSnapshot", null);
        mockMvc.perform(delete("/admin/feedback-reports/ghost/snapshot").with(asAdmin()))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletingRemovesTheReport() throws Exception {
        mockMvc.perform(delete("/admin/feedback-reports/report-with").with(asAdmin()))
                .andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"FeedbackReports\" WHERE \"id\" = 'report-with'", Integer.class))
                .isEqualTo(0);
        mockMvc.perform(delete("/admin/feedback-reports/report-with").with(asAdmin()))
                .andExpect(status().isNotFound());
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private RequestPostProcessor asAdmin() {
        return jwt().jwt(token -> token.subject(ADMIN).claim("amr", List.of("pwd", "otp", "mfa")))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority(
                        "ROLE_ADMIN"));
    }

    private RequestPostProcessor asAdminWithoutMfa() {
        return jwt().jwt(token -> token.subject(ADMIN))
                .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority(
                        "ROLE_ADMIN"));
    }
}
