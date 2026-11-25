package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import java.sql.Timestamp;
import java.time.Clock;
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

/**
 * The draft-conversation endpoints against the retired action's semantics: the 50-conversation
 * cap and trim, the cross-user id refusal, lenient sanitizing on both read and write, the
 * idempotent delete, writer-stamped timestamps, and no {@code dataVersion} movement.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, DraftConversationIntegrationTest.FrozenClock.class})
class DraftConversationIntegrationTest {

    private static final Instant FROZEN_NOW = Instant.parse("2026-11-24T12:00:00Z");
    private static final String USER = "draft-user";
    private static final String OTHER_USER = "draft-other-user";

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
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 7)",
                USER, USER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 7)",
                OTHER_USER, OTHER_USER + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" IN (?, ?)", USER, OTHER_USER);
    }

    @Test
    void upsertCreatesSanitizesAndStampsTimestamps() throws Exception {
        String body = """
                {"title": "  My plan  ", "messages": [
                  {"id": "m1", "role": "user", "content": "hello"},
                  {"id": "m2", "role": "assistant", "content": "done", "toolNote": "  "},
                  {"id": "m3", "role": "assistant", "content": "with note", "toolNote": "ran tools"},
                  {"id": "", "role": "user", "content": "no id"},
                  {"id": "m4", "role": "system", "content": "bad role"},
                  {"id": "m5", "role": "user", "content": "   "},
                  "not an object"
                ]}""";
        mockMvc.perform(put("/draft-conversations/conversation-1").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNoContent());

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT \"title\", \"messages\"::text AS messages, \"createdAt\", \"updatedAt\""
                        + " FROM \"DraftConversations\" WHERE \"id\" = 'conversation-1'");
        assertThat(row.get("title")).isEqualTo("My plan");
        assertThat((String) row.get("messages"))
                .contains("\"m1\"")
                .contains("\"with note\"")
                .contains("ran tools")
                .doesNotContain("no id")
                .doesNotContain("bad role");
        // The blank toolNote is dropped, not stored as an empty string: only m3 carries one.
        assertThat((String) row.get("messages")).containsOnlyOnce("toolNote");
        assertThat(storedUtc(row.get("createdAt"))).isEqualTo(FROZEN_NOW);
        assertThat(storedUtc(row.get("updatedAt"))).isEqualTo(FROZEN_NOW);

        assertThat(dataVersion(USER)).isEqualTo(7);
    }

    @Test
    void upsertUpdatesInPlaceKeepingCreatedAt() throws Exception {
        Instant created = Instant.parse("2026-11-20T08:00:00Z");
        insertConversation("conversation-2", USER, "Old title", created, created);

        mockMvc.perform(put("/draft-conversations/conversation-2").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"New title\", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isNoContent());

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT \"title\", \"createdAt\", \"updatedAt\" FROM \"DraftConversations\""
                        + " WHERE \"id\" = 'conversation-2'");
        assertThat(row.get("title")).isEqualTo("New title");
        assertThat(storedUtc(row.get("createdAt"))).isEqualTo(created);
        assertThat(storedUtc(row.get("updatedAt"))).isEqualTo(FROZEN_NOW);
    }

    @Test
    void anEmptyTitleFallsBackToUntitledAndALongOneTruncates() throws Exception {
        mockMvc.perform(put("/draft-conversations/conversation-untitled")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"   \", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isNoContent());
        assertThat(title("conversation-untitled")).isEqualTo("Untitled");

        mockMvc.perform(put("/draft-conversations/conversation-long-title")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"" + "x".repeat(120) + "\", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isNoContent());
        assertThat(title("conversation-long-title")).hasSize(80);

        // NBSP is JS whitespace (the retired action's trim) but not Java-trim whitespace.
        mockMvc.perform(put("/draft-conversations/conversation-nbsp-title")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"\\u00a0\\u00a0\", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isNoContent());
        assertThat(title("conversation-nbsp-title")).isEqualTo("Untitled");
    }

    @Test
    void unusableIdsAndEmptyMessagesAreRefused() throws Exception {
        mockMvc.perform(put("/draft-conversations/" + "i".repeat(65))
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"t\", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_conversation_id"));

        mockMvc.perform(put("/draft-conversations/conversation-empty")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"t\", \"messages\": [{\"id\": \"m1\", \"role\": \"user\","
                                + " \"content\": \"   \"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("nothing_to_save"))
                .andExpect(jsonPath("$.detail").value("Nothing to save"));
    }

    @Test
    void theClientMintedIdCannotTouchAnotherUsersRow() throws Exception {
        insertConversation("conversation-foreign", OTHER_USER, "Theirs", FROZEN_NOW, FROZEN_NOW);

        mockMvc.perform(put("/draft-conversations/conversation-foreign")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"Mine now\", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("conversation_not_found"))
                .andExpect(jsonPath("$.detail").value("Not Found"));

        assertThat(title("conversation-foreign")).isEqualTo("Theirs");
    }

    @Test
    void theNewestFiftyConversationsSurviveAnUpsert() throws Exception {
        for (int i = 0; i < 50; i++) {
            insertConversation("conversation-bulk-" + i, USER, "Conversation " + i,
                    FROZEN_NOW.minusSeconds(86_400), FROZEN_NOW.minusSeconds(3600L + i));
        }

        mockMvc.perform(put("/draft-conversations/conversation-newest")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"Newest\", \"messages\":"
                                + " [{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]}"))
                .andExpect(status().isNoContent());

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"DraftConversations\" WHERE \"userId\" = ?", Integer.class, USER);
        assertThat(count).isEqualTo(50);
        // The stalest row (largest age offset) was trimmed; the fresh upsert survives.
        Integer trimmed = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"DraftConversations\" WHERE \"id\" = 'conversation-bulk-49'",
                Integer.class);
        assertThat(trimmed).isZero();
        assertThat(title("conversation-newest")).isEqualTo("Newest");
    }

    @Test
    void listReturnsSummariesNewestFirst() throws Exception {
        insertConversation("conversation-a", USER, "Older", FROZEN_NOW, FROZEN_NOW.minusSeconds(600));
        insertConversation("conversation-b", USER, "Newer", FROZEN_NOW, FROZEN_NOW.minusSeconds(60));
        insertConversation("conversation-c", OTHER_USER, "Foreign", FROZEN_NOW, FROZEN_NOW);

        mockMvc.perform(get("/draft-conversations").with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value("conversation-b"))
                .andExpect(jsonPath("$[0].title").value("Newer"))
                .andExpect(jsonPath("$[0].updatedAt").isNotEmpty())
                .andExpect(jsonPath("$[0].messages").doesNotExist())
                .andExpect(jsonPath("$[1].id").value("conversation-a"));
    }

    @Test
    void getSanitizesStoredMessagesAndRefusesForeignRows() throws Exception {
        jdbcTemplate.update("INSERT INTO \"DraftConversations\""
                        + " (\"id\", \"title\", \"messages\", \"userId\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?::jsonb, ?, ?, ?)",
                "conversation-messy", "Messy",
                "[{\"id\": \"m1\", \"role\": \"user\", \"content\": \"ok\"},"
                        + " {\"id\": \"m2\", \"role\": \"nonsense\", \"content\": \"dropped\"}, 42]",
                USER, Timestamp.from(FROZEN_NOW), Timestamp.from(FROZEN_NOW));

        mockMvc.perform(get("/draft-conversations/conversation-messy")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("conversation-messy"))
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].id").value("m1"))
                .andExpect(jsonPath("$.messages[0].toolNote").doesNotExist());

        mockMvc.perform(get("/draft-conversations/conversation-messy")
                        .with(jwt().jwt(j -> j.subject(OTHER_USER))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("conversation_not_found"));
    }

    @Test
    void deleteIsIdempotentAndScoped() throws Exception {
        insertConversation("conversation-delete", USER, "Mine", FROZEN_NOW, FROZEN_NOW);

        mockMvc.perform(delete("/draft-conversations/conversation-delete")
                        .with(jwt().jwt(j -> j.subject(OTHER_USER))))
                .andExpect(status().isNoContent());
        assertThat(title("conversation-delete")).isEqualTo("Mine");

        mockMvc.perform(delete("/draft-conversations/conversation-delete")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/draft-conversations/conversation-delete")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isNoContent());

        assertThat(dataVersion(USER)).isEqualTo(7);
        assertThat(dataVersion(OTHER_USER)).isEqualTo(7);
    }

    private void insertConversation(String id, String userId, String title, Instant createdAt,
            Instant updatedAt) {
        jdbcTemplate.update("INSERT INTO \"DraftConversations\""
                        + " (\"id\", \"title\", \"messages\", \"userId\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?::jsonb, ?, ?, ?)",
                id, title, "[{\"id\": \"m1\", \"role\": \"user\", \"content\": \"hi\"}]", userId,
                utcWallClock(createdAt), utcWallClock(updatedAt));
    }

    /** The column is UTC wall-clock; a java.sql.Timestamp parameter would write the JVM zone's. */
    private static LocalDateTime utcWallClock(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private static Instant storedUtc(Object column) {
        return ((Timestamp) column).toLocalDateTime().toInstant(ZoneOffset.UTC);
    }

    private String title(String id) {
        return jdbcTemplate.queryForObject(
                "SELECT \"title\" FROM \"DraftConversations\" WHERE \"id\" = ?", String.class, id);
    }

    private int dataVersion(String userId) {
        Integer version = jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, userId);
        return version == null ? -1 : version;
    }
}
