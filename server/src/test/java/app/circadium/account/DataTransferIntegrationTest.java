package app.circadium.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The GDPR export/import pair against the retired actions' semantics. The fixture is a hand-written
 * export in the exact shape {@code actions/dataExport.ts} produced; importing it (replace) and
 * re-exporting must reproduce it section for section, which pins the two services against each other
 * AND against the retired shape. Engine-derived and credential-bearing sections are seeded by SQL and
 * pinned separately (they are never imported).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DataTransferIntegrationTest {

    /** The export sections the import writes; the round trip must reproduce each exactly. */
    private static final List<String> IMPORTED_SECTIONS = List.of(
            "planners", "weeklyTemplates", "categories", "locations", "travelTimes",
            "schedulingPreferences", "taskPreferences", "queues", "dependencies", "aiConversations",
            "viewState", "externalCalendarSources", "externalCalendarEvents", "occurrenceCompletions",
            "habitBuckets", "habits", "habitItems");

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanUp() {
        for (String user : List.of("transfer-user", "transfer-bystander", "transfer-add-user",
                "transfer-fail-user")) {
            jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", user);
        }
    }

    @Test
    void replaceImportRoundTripsTheFixtureAndTheExportExcludesSecrets() throws Exception {
        String user = "transfer-user";
        seedUser(user, "Transfer User", "transfer-user@example.test");
        // Another account's rows must never leak into the export.
        seedUser("transfer-bystander", "Bystander", "transfer-bystander@example.test");
        jdbcTemplate.update("INSERT INTO \"Locations\" (\"id\", \"name\", \"address\", \"placeId\", "
                + "\"lat\", \"lng\", \"userId\", \"createdAt\", \"updatedAt\") "
                + "VALUES ('bystander-loc', 'Elsewhere', '9 Other St', 'place-9', 1, 2, "
                + "'transfer-bystander', now(), now())");

        String fixture = fixture();
        mockMvc.perform(post("/account/import").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"replace\",\"data\":" + fixture + "}"))
                .andExpect(status().isOk())
                // Every fixture row except viewState and schedulingPreferences, which the retired
                // action's count also left out.
                .andExpect(jsonPath("$.imported").value(21));
        assertThat(dataVersion(user)).isEqualTo(8);

        // The sections the import never writes: engine-derived rows, the NextAuth-era accounts row,
        // and a calendar connection whose refresh token must never appear in an export.
        jdbcTemplate.update("INSERT INTO \"SimpleEvents\" (\"id\", \"title\", \"start\", \"end\", "
                + "\"duration\", \"userId\", \"rrule\", \"backgroundColor\", \"borderColor\", "
                + "\"createdAt\", \"updatedAt\") VALUES "
                + "('event-1', 'Placed task', '2026-01-06T09:00:00.000Z', '2026-01-06T10:00:00.000Z', 60, "
                + "'transfer-user', NULL, '#111111', '#222222', "
                + "'2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678'), "
                + "('event-2', 'Bare event', '2026-01-07T09:00:00.000Z', '2026-01-07T10:00:00.000Z', 60, "
                + "'transfer-user', NULL, '#111111', '#222222', "
                + "'2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678')");
        jdbcTemplate.update("INSERT INTO \"EventExtendedProps\" (\"id\", \"plannerType\", \"eventType\", "
                + "\"completedStartTime\", \"completedEndTime\", \"parentId\", \"trespassingStart\", "
                + "\"trespassingEnd\", \"eventId\") "
                + "VALUES ('props-1', 'task', 'planner', NULL, NULL, 'planner-1', false, true, 'event-1')");
        jdbcTemplate.update("INSERT INTO \"CategoryEvents\" (\"id\", \"start\", \"end\", "
                + "\"categoryTimeWindowId\", \"categoryId\", \"userId\", \"createdAt\", \"updatedAt\") "
                + "VALUES ('catevent-1', '2026-01-05T09:00:00.000Z', '2026-01-05T17:00:00.000Z', "
                + "'window-1', 'category-2', 'transfer-user', "
                + "'2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678')");
        jdbcTemplate.update("INSERT INTO \"TravelEvents\" (\"id\", \"start\", \"end\", "
                + "\"fromLocationId\", \"toLocationId\", \"travelMinutes\", \"userId\", \"createdAt\", "
                + "\"updatedAt\") VALUES ('travelevent-1', '2026-01-06T08:40:00.000Z', "
                + "'2026-01-06T09:00:00.000Z', 'loc-1', 'loc-2', 20, 'transfer-user', "
                + "'2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678')");
        jdbcTemplate.update("INSERT INTO \"EngineMessages\" (\"id\", \"type\", \"tone\", \"payload\", "
                + "\"dismissed\", \"userId\", \"createdAt\", \"updatedAt\") "
                + "VALUES ('message-1', 'TASK_TOO_LARGE', 'warn', '{\"plannerId\":\"planner-1\"}'::jsonb, "
                + "false, 'transfer-user', '2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678')");
        jdbcTemplate.update("INSERT INTO \"accounts\" (\"id\", \"user_id\", \"type\", \"provider\", "
                + "\"provider_account_id\", \"refresh_token\") "
                + "VALUES ('account-1', 'transfer-user', 'oidc', 'google', 'g-123', 'oauth-secret')");
        jdbcTemplate.update("INSERT INTO \"GoogleCalendarConnections\" (\"id\", \"userId\", \"email\", "
                + "\"refreshToken\", \"createdAt\", \"updatedAt\") "
                + "VALUES ('gconn-1', 'transfer-user', 'cal@example.test', 'calendar-secret', "
                + "'2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678')");

        String export = mockMvc.perform(get("/account/export").with(asUser(user)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode exportNode = JSON.readTree(export);
        JsonNode fixtureNode = JSON.readTree(fixture);

        for (String section : IMPORTED_SECTIONS) {
            JSONAssert.assertEquals("section " + section, fixtureNode.get(section).toString(),
                    exportNode.get(section).toString(), JSONCompareMode.NON_EXTENSIBLE);
        }

        JSONAssert.assertEquals("""
                {"id":"transfer-user","name":"Transfer User","email":"transfer-user@example.test",
                 "emailVerified":null,"image":null,"role":"USER","isTwoFactorEnabled":false,
                 "onboardedAt":null,"aiMode":null}
                """, exportNode.get("profile").toString(), JSONCompareMode.NON_EXTENSIBLE);
        JSONAssert.assertEquals("[{\"provider\":\"google\",\"type\":\"oidc\",\"providerAccountId\":\"g-123\"}]",
                exportNode.get("linkedSignIns").toString(), JSONCompareMode.NON_EXTENSIBLE);
        JSONAssert.assertEquals("""
                {"email":"cal@example.test","createdAt":"2026-01-02T03:04:05.678Z",
                 "updatedAt":"2026-01-02T03:04:05.678Z"}
                """, exportNode.get("googleCalendarConnection").toString(), JSONCompareMode.NON_EXTENSIBLE);
        assertThat(exportNode.get("microsoftCalendarConnection").isNull()).isTrue();
        JSONAssert.assertEquals("""
                [{"id":"event-1","title":"Placed task","start":"2026-01-06T09:00:00.000Z",
                  "end":"2026-01-06T10:00:00.000Z","duration":60,"userId":"transfer-user","rrule":null,
                  "backgroundColor":"#111111","borderColor":"#222222",
                  "createdAt":"2026-01-02T03:04:05.678Z","updatedAt":"2026-01-02T03:04:05.678Z",
                  "extendedProps":{"id":"props-1","plannerType":"task","eventType":"planner",
                    "completedStartTime":null,"completedEndTime":null,"parentId":"planner-1",
                    "trespassingStart":false,"trespassingEnd":true,"eventId":"event-1"}},
                 {"id":"event-2","title":"Bare event","start":"2026-01-07T09:00:00.000Z",
                  "end":"2026-01-07T10:00:00.000Z","duration":60,"userId":"transfer-user","rrule":null,
                  "backgroundColor":"#111111","borderColor":"#222222",
                  "createdAt":"2026-01-02T03:04:05.678Z","updatedAt":"2026-01-02T03:04:05.678Z",
                  "extendedProps":null}]
                """, exportNode.get("calendarEvents").toString(), JSONCompareMode.NON_EXTENSIBLE);
        JSONAssert.assertEquals("""
                [{"id":"message-1","type":"TASK_TOO_LARGE","tone":"warn",
                  "payload":{"plannerId":"planner-1"},"dismissed":false,"userId":"transfer-user",
                  "createdAt":"2026-01-02T03:04:05.678Z","updatedAt":"2026-01-02T03:04:05.678Z"}]
                """, exportNode.get("engineMessages").toString(), JSONCompareMode.NON_EXTENSIBLE);
        assertThat(exportNode.get("categoryEvents")).hasSize(1);
        assertThat(exportNode.get("travelEvents")).hasSize(1);

        assertThat(exportNode.get("meta").get("format").stringValue())
                .isEqualTo("circadium.data-export.v1");
        // Credentials must never appear anywhere in the blob, and neither may the bystander's rows.
        assertThat(export).doesNotContain("calendar-secret", "oauth-secret", "password-hash",
                "bystander-loc");
    }

    @Test
    void addImportRemapsEveryIdAndReusesTheExistingLocation() throws Exception {
        String user = "transfer-add-user";
        seedUser(user, "Add User", "transfer-add-user@example.test");
        jdbcTemplate.update("INSERT INTO \"Locations\" (\"id\", \"name\", \"address\", \"placeId\", "
                + "\"lat\", \"lng\", \"userId\", \"createdAt\", \"updatedAt\") "
                + "VALUES ('existing-loc', 'My home', '1 Home Street', 'place-1', 59.3, 18.1, ?, "
                + "now(), now())", user);

        mockMvc.perform(post("/account/import").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"add\",\"data\":" + fixture() + "}"))
                .andExpect(status().isOk());
        assertThat(dataVersion(user)).isEqualTo(8);

        // The place-1 location deduped onto the existing row; only Office came in, with a fresh id.
        assertThat(count("Locations", user)).isEqualTo(2);
        String officeId = jdbcTemplate.queryForObject("SELECT \"id\" FROM \"Locations\" "
                + "WHERE \"userId\" = ? AND \"placeId\" = 'place-2'", String.class, user);
        assertThat(officeId).isNotEqualTo("loc-2");

        String taskId = plannerId(user, "Target task");
        String goalId = plannerId(user, "Big goal");
        assertThat(taskId).isNotEqualTo("planner-1");
        Map<String, Object> child = jdbcTemplate.queryForMap("SELECT \"parentId\", \"linkedItemId\" "
                + "FROM \"Planners\" WHERE \"userId\" = ? AND \"title\" = 'Goal step'", user);
        assertThat(child.get("parentId")).isEqualTo(goalId);
        assertThat(child.get("linkedItemId")).isEqualTo(taskId);

        Map<String, Object> travelTime = jdbcTemplate.queryForMap("SELECT \"fromLocationId\", "
                + "\"toLocationId\" FROM \"TravelTimes\" WHERE \"userId\" = ?", user);
        assertThat(travelTime.get("fromLocationId")).isEqualTo("existing-loc");
        assertThat(travelTime.get("toLocationId")).isEqualTo(officeId);

        assertThat(jdbcTemplate.queryForObject("SELECT \"plannerId\" FROM \"QueueMembers\" "
                + "WHERE \"userId\" = ?", String.class, user)).isEqualTo(taskId);
        Map<String, Object> dependency = jdbcTemplate.queryForMap("SELECT \"predecessorId\", "
                + "\"successorId\" FROM \"PlannerDependencies\" WHERE \"userId\" = ?", user);
        assertThat(dependency.get("predecessorId")).isEqualTo(taskId);
        assertThat(dependency.get("successorId")).isEqualTo(goalId);

        Map<String, Object> source = jdbcTemplate.queryForMap("SELECT \"id\", \"locationId\", "
                + "\"locationExceptions\" FROM \"ExternalCalendarSources\" WHERE \"userId\" = ?", user);
        assertThat(source.get("locationId")).isEqualTo("existing-loc");
        JSONAssert.assertEquals("{\"uid-1\":\"" + officeId + "\",\"uid-2\":null}",
                (String) source.get("locationExceptions"), JSONCompareMode.NON_EXTENSIBLE);
        assertThat(jdbcTemplate.queryForObject("SELECT \"id\" FROM \"ExternalEvents\" "
                + "WHERE \"userId\" = ?", String.class, user))
                .isEqualTo(source.get("id") + "|uid-1|2026-01-10T10:00:00.000Z");

        assertThat(jdbcTemplate.queryForObject("SELECT \"plannerId\" FROM \"HabitItems\" "
                + "WHERE \"userId\" = ?", String.class, user)).isEqualTo(taskId);
        assertThat(jdbcTemplate.queryForObject("SELECT t.\"plannerId\" FROM \"TaskPreferences\" t "
                + "JOIN \"Planners\" p ON p.\"id\" = t.\"plannerId\" WHERE p.\"userId\" = ?",
                String.class, user)).isEqualTo(taskId);
        String categoryCloneId = jdbcTemplate.queryForObject("SELECT \"id\" FROM \"Categories\" "
                + "WHERE \"userId\" = ? AND \"name\" = 'Deep work'", String.class, user);
        assertThat(jdbcTemplate.queryForObject("SELECT \"categoryId\" FROM \"CategoryTimeWindows\" "
                + "WHERE \"userId\" = ?", String.class, user)).isEqualTo(categoryCloneId);
    }

    @Test
    void aFailingImportChangesNothing() throws Exception {
        String user = "transfer-fail-user";
        seedUser(user, "Fail User", "transfer-fail-user@example.test");
        jdbcTemplate.update("INSERT INTO \"Planners\" (\"id\", \"title\", \"plannerType\", \"duration\", "
                + "\"priority\", \"userId\", \"createdAt\") "
                + "VALUES ('keep-me', 'Existing', 'task', 30, 3, ?, now())", user);

        // categoryId points at a category the file does not carry: the FK fails, the transaction
        // rolls back, and the rows the replace wiped come back with it.
        String broken = """
                {"meta":{"format":"circadium.data-export.v1"},
                 "planners":[{"id":"p-x","title":"Broken","parentId":null,"plannerType":"task",
                   "isReady":null,"isTriaged":true,"duration":10,"deadline":null,"starts":null,
                   "recurrence":null,"recurrenceExceptions":null,"splitting":null,
                   "completedSegments":null,"maxMinutesPerDay":null,"earliestStartDate":null,
                   "allowedTimes":null,"linkedItemId":null,"notes":null,"sortOrder":0,
                   "completedStartTime":null,"completedEndTime":null,"priority":1,
                   "userId":"x","color":null,"locationId":null,"useParentLocation":false,
                   "categoryId":"ghost-category",
                   "createdAt":"2026-01-02T03:04:05.678Z","updatedAt":"2026-01-02T03:04:05.678Z"}]}
                """;
        mockMvc.perform(post("/account/import").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"replace\",\"data\":" + broken + "}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("import_failed"));

        assertThat(count("Planners", user)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT \"id\" FROM \"Planners\" WHERE \"userId\" = ?",
                String.class, user)).isEqualTo("keep-me");
        assertThat(dataVersion(user)).isEqualTo(7);
    }

    @Test
    void unusableFilesAreRefused() throws Exception {
        String user = "transfer-fail-user";
        seedUser(user, null, "transfer-fail-user@example.test");

        mockMvc.perform(post("/account/import").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"replace\",\"data\":5}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_payload"));
        mockMvc.perform(post("/account/import").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"replace\",\"data\":{\"meta\":{\"format\":\"nope\"}}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unrecognized_format"));
        mockMvc.perform(post("/account/import").with(asUser(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"sideways\",\"data\":{\"meta\":"
                                + "{\"format\":\"circadium.data-export.v1\"}}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_mode"));
        assertThat(dataVersion(user)).isEqualTo(7);
    }

    @Test
    void bothEndpointsRequireAnAccessToken() throws Exception {
        mockMvc.perform(get("/account/export")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/account/import").contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"replace\",\"data\":{}}")).andExpect(status().isUnauthorized());
    }

    private void seedUser(String id, String name, String email) {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"name\", \"email\", \"password\", "
                + "\"ai_model\", \"dataVersion\") VALUES (?, ?, ?, 'password-hash', 'claude-sonnet-5', 7)",
                id, name, email);
    }

    private int dataVersion(String userId) {
        return jdbcTemplate.queryForObject("SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?",
                Integer.class, userId);
    }

    private int count(String table, String userId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"" + table + "\" WHERE \"userId\" = ?", Integer.class, userId);
    }

    private String plannerId(String userId, String title) {
        return jdbcTemplate.queryForObject("SELECT \"id\" FROM \"Planners\" WHERE \"userId\" = ? "
                + "AND \"title\" = ?", String.class, userId, title);
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("account/import-fixture.json")
                .getContentAsString(StandardCharsets.UTF_8);
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }
}
