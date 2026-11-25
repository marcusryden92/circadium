package app.circadium.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.RecordingAccountMailer;
import app.circadium.auth.RecordingAccountMailer.Kind;
import java.util.List;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Support messages + the suggestion wall against the retired {@code actions/feedback.ts}: the exact
 * validation strings, the snapshot stored on the row only with consent, the author's own upvote riding
 * the create, the per-user cap, idempotent vote removal, the admin-only cross-user delete — and no
 * {@code dataVersion} movement anywhere.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class FeedbackIntegrationTest {

    private static final String REPORTER = "feedback-reporter";
    private static final String OTHER = "feedback-other";
    private static final String ADMIN = "feedback-admin";

    @TestConfiguration(proxyBeanMethods = false)
    static class MailConfig {
        @Bean
        @Primary
        RecordingAccountMailer recordingAccountMailer() {
            return new RecordingAccountMailer();
        }
    }

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    RecordingAccountMailer mailer;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\", \"dataVersion\") "
                + "VALUES (?, 'Reporter', ?, 5)", REPORTER, REPORTER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\") VALUES (?, NULL, ?)",
                OTHER, OTHER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\", \"role\") "
                + "VALUES (?, 'Admin', ?, 'ADMIN')", ADMIN, ADMIN + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        for (String user : List.of(REPORTER, OTHER, ADMIN)) {
            jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", user);
        }
    }

    @Test
    void aSupportMessageStoresTheReportAndQueuesTheNotification() throws Exception {
        mockMvc.perform(post("/feedback/support").with(asUser(REPORTER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"short\",\"includeSnapshot\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Tell us a bit more — at least 10 characters."));

        mockMvc.perform(post("/feedback/support").with(asUser(REPORTER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"Something is broken over here\",\"includeSnapshot\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reportId").isNotEmpty());

        Map<String, Object> report = jdbcTemplate.queryForMap("SELECT \"message\", \"dataSnapshot\" "
                + "FROM \"FeedbackReports\" WHERE \"userId\" = ?", REPORTER);
        assertThat(report.get("message")).isEqualTo("Something is broken over here");
        assertThat(report.get("dataSnapshot")).isNull();
        assertThat(mailer.count(Kind.FEEDBACK, REPORTER + "@example.test")).isEqualTo(1);
        assertThat(dataVersion(REPORTER)).isEqualTo(5);
    }

    @Test
    void aConsentedSnapshotStoresTheFullExportOnTheRow() throws Exception {
        mockMvc.perform(post("/feedback/support").with(asUser(REPORTER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"Here is my data snapshot\",\"includeSnapshot\":true}"))
                .andExpect(status().isOk());

        String snapshot = jdbcTemplate.queryForObject("SELECT \"dataSnapshot\"::text "
                + "FROM \"FeedbackReports\" WHERE \"userId\" = ?", String.class, REPORTER);
        assertThat(snapshot).contains("circadium.data-export.v1");
    }

    @Test
    void theWallAggregatesVotesAndNamesAuthors() throws Exception {
        mockMvc.perform(post("/suggestions").with(asUser(REPORTER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"ab\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Give the suggestion a short title."));

        String body = mockMvc.perform(post("/suggestions").with(asUser(REPORTER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  Dark mode  \",\"body\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Dark mode"))
                .andExpect(jsonPath("$.body").value((Object) null))
                .andExpect(jsonPath("$.authorName").value("Reporter"))
                .andExpect(jsonPath("$.isMine").value(true))
                .andExpect(jsonPath("$.myVote").value(1))
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.score").value(1))
                .andReturn().getResponse().getContentAsString();
        String suggestionId = body.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");

        // A nameless author reads as Anonymous on everyone's wall.
        mockMvc.perform(post("/suggestions").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Calendar colors\",\"body\":\"per role\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorName").value("Anonymous"));

        mockMvc.perform(put("/suggestions/" + suggestionId + "/vote").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":-1}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/suggestions").with(asUser(OTHER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + suggestionId + "')].score").value(0))
                .andExpect(jsonPath("$[?(@.id=='" + suggestionId + "')].upvotes").value(1))
                .andExpect(jsonPath("$[?(@.id=='" + suggestionId + "')].downvotes").value(1))
                .andExpect(jsonPath("$[?(@.id=='" + suggestionId + "')].myVote").value(-1))
                .andExpect(jsonPath("$[?(@.id=='" + suggestionId + "')].isMine").value(false))
                .andExpect(jsonPath("$[?(@.id=='" + suggestionId + "')].authorName").value("Reporter"));

        // Flipping the vote updates the one row; 0 removes it; both idempotent.
        mockMvc.perform(put("/suggestions/" + suggestionId + "/vote").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":1}"))
                .andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM \"SuggestionVotes\" "
                + "WHERE \"suggestionId\" = ?", Integer.class, suggestionId)).isEqualTo(2);
        mockMvc.perform(put("/suggestions/" + suggestionId + "/vote").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":0}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(put("/suggestions/" + suggestionId + "/vote").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":0}"))
                .andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM \"SuggestionVotes\" "
                + "WHERE \"suggestionId\" = ?", Integer.class, suggestionId)).isEqualTo(1);

        mockMvc.perform(put("/suggestions/" + suggestionId + "/vote").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":5}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid vote"));
        mockMvc.perform(put("/suggestions/ghost/vote").with(asUser(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":1}"))
                .andExpect(status().isNotFound());

        assertThat(dataVersion(REPORTER)).isEqualTo(5);
    }

    @Test
    void theSuggestionCapIsEnforced() throws Exception {
        for (int i = 0; i < 25; i++) {
            jdbcTemplate.update("INSERT INTO \"Suggestions\" (\"id\", \"title\", \"userId\", "
                    + "\"createdAt\") VALUES (?, ?, ?, now())", "cap-" + i, "Filler " + i, REPORTER);
        }
        mockMvc.perform(post("/suggestions").with(asUser(REPORTER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"One more\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "You have reached the suggestion limit — delete one of yours to post a new one."));
    }

    @Test
    void onlyAdminsDeleteOtherPeoplesSuggestions() throws Exception {
        jdbcTemplate.update("INSERT INTO \"Suggestions\" (\"id\", \"title\", \"userId\", \"createdAt\") "
                + "VALUES ('sg-1', 'Mine', ?, now())", REPORTER);

        // Not the owner's: a 204 no-op, exactly like the retired deleteMany.
        mockMvc.perform(delete("/suggestions/sg-1").with(asUser(OTHER)))
                .andExpect(status().isNoContent());
        assertThat(suggestionCount("sg-1")).isEqualTo(1);

        // An ADMIN whose sign-in lacks the 2FA code is an ordinary user here.
        mockMvc.perform(delete("/suggestions/sg-1").with(asAdminWithoutMfa()))
                .andExpect(status().isNoContent());
        assertThat(suggestionCount("sg-1")).isEqualTo(1);

        mockMvc.perform(delete("/suggestions/sg-1").with(asAdmin()))
                .andExpect(status().isNoContent());
        assertThat(suggestionCount("sg-1")).isEqualTo(0);

        jdbcTemplate.update("INSERT INTO \"Suggestions\" (\"id\", \"title\", \"userId\", \"createdAt\") "
                + "VALUES ('sg-2', 'Mine too', ?, now())", REPORTER);
        mockMvc.perform(delete("/suggestions/sg-2").with(asUser(REPORTER)))
                .andExpect(status().isNoContent());
        assertThat(suggestionCount("sg-2")).isEqualTo(0);
    }

    @Test
    void everyEndpointRequiresAnAccessToken() throws Exception {
        mockMvc.perform(get("/suggestions")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/feedback/support").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"Hello hello hello\",\"includeSnapshot\":false}"))
                .andExpect(status().isUnauthorized());
    }

    private int suggestionCount(String id) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM \"Suggestions\" WHERE \"id\" = ?",
                Integer.class, id);
    }

    private int dataVersion(String userId) {
        return jdbcTemplate.queryForObject("SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?",
                Integer.class, userId);
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private RequestPostProcessor asAdmin() {
        return jwt().jwt(token -> token.subject(ADMIN).claim("amr", List.of("pwd", "otp", "mfa")))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private RequestPostProcessor asAdminWithoutMfa() {
        return jwt().jwt(token -> token.subject(ADMIN))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }
}
