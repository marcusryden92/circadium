package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
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
 * The habit endpoints against the retired Prisma actions' semantics: bucket/habit CRUD with
 * no-op deletes and silently-null foreign buckets, the repeating-only link rule with idempotent
 * adds, the assistant batch's order/skip/adopt behavior, and no {@code dataVersion} movement.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class HabitIntegrationTest {

    private static final String USER = "habit-user";
    private static final String OTHER = "habit-other";
    private static final String REPEATING = "habit-repeating-planner";
    private static final String ONE_OFF = "habit-one-off-planner";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 5), (?, ?, 1)",
                USER, USER + "@example.test", OTHER, OTHER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"Planners\" (\"id\", \"title\", \"plannerType\", \"isTriaged\","
                        + " \"duration\", \"sortOrder\", \"priority\", \"userId\", \"useParentLocation\","
                        + " \"recurrence\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, 'Meditate', 'task', true, 20, 0, 1, ?, false,"
                        + " '{\"freq\":\"daily\",\"interval\":1}', now(), now()),"
                        + " (?, 'One-off', 'task', true, 20, 0, 1, ?, false, NULL, now(), now())",
                REPEATING, USER, ONE_OFF, USER);
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" IN (?, ?)", USER, OTHER);
    }

    @Test
    void bucketLifecycleWithSetNullOnDelete() throws Exception {
        mockMvc.perform(post("/habits/buckets").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  Mornings  \",\"color\":\"#aabbcc\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Mornings"))
                .andExpect(jsonPath("$.sortOrder").value(0));
        String bucketId = jdbcTemplate.queryForObject(
                "SELECT \"id\" FROM \"HabitBuckets\" WHERE \"userId\" = ?", String.class, USER);

        mockMvc.perform(post("/habits/buckets").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Evenings\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sortOrder").value(1));

        mockMvc.perform(post("/habits/buckets").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/habits/buckets/{id}", bucketId).with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Early mornings\",\"color\":{\"set\":true,\"value\":null}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Early mornings"))
                .andExpect(jsonPath("$.color").value((Object) null));

        mockMvc.perform(patch("/habits/buckets/{id}", "missing").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("bucket_not_found"));

        mockMvc.perform(post("/habits").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Stretch\",\"bucketId\":\"" + bucketId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bucketId").value(bucketId));

        mockMvc.perform(delete("/habits/buckets/{id}", bucketId).with(asUser(USER)))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/habits/buckets/{id}", bucketId).with(asUser(USER)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/habits").with(asUser(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.buckets.length()").value(1))
                .andExpect(jsonPath("$.habits[0].bucketId").value((Object) null));
    }

    @Test
    void aForeignBucketLandsAsUnsorted() throws Exception {
        jdbcTemplate.update("INSERT INTO \"HabitBuckets\" (\"id\", \"userId\", \"name\", \"sortOrder\","
                + " \"createdAt\", \"updatedAt\") VALUES ('their-bucket', ?, 'Theirs', 0, now(), now())", OTHER);
        mockMvc.perform(post("/habits").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Run\",\"bucketId\":\"their-bucket\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bucketId").value((Object) null));
    }

    @Test
    void linksAcceptOnlyRepeatingRootsAndAreIdempotent() throws Exception {
        mockMvc.perform(post("/habits").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Meditation habit\"}"))
                .andExpect(status().isOk());
        String habitId = jdbcTemplate.queryForObject(
                "SELECT \"id\" FROM \"Habits\" WHERE \"userId\" = ?", String.class, USER);

        mockMvc.perform(addItem(USER, habitId, REPEATING))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannerId").value(REPEATING));
        String linkId = jdbcTemplate.queryForObject(
                "SELECT \"id\" FROM \"HabitItems\" WHERE \"habitId\" = ?", String.class, habitId);

        mockMvc.perform(addItem(USER, habitId, REPEATING))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(linkId));

        mockMvc.perform(addItem(USER, habitId, ONE_OFF))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("item_not_repeating"));
        mockMvc.perform(addItem(USER, habitId, "no-such-planner"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("item_not_found"));
        mockMvc.perform(addItem(USER, "no-such-habit", REPEATING))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("habit_not_found"));

        mockMvc.perform(delete("/habits/{id}/items", habitId).param("plannerId", REPEATING)
                        .with(asUser(USER)))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/habits/{id}/items", habitId).param("plannerId", REPEATING)
                        .with(asUser(USER)))
                .andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"HabitItems\" WHERE \"habitId\" = ?", Integer.class, habitId))
                .isZero();

        mockMvc.perform(delete("/habits/{id}", habitId).with(asUser(USER)))
                .andExpect(status().isNoContent());
    }

    @Test
    void theAssistantBatchAppliesInOrderAndSkipsUnknownIds() throws Exception {
        jdbcTemplate.update("INSERT INTO \"HabitBuckets\" (\"id\", \"userId\", \"name\", \"sortOrder\","
                + " \"createdAt\", \"updatedAt\") VALUES ('old-bucket', ?, 'Old', 0, now(), now())", USER);
        jdbcTemplate.update("INSERT INTO \"Habits\" (\"id\", \"userId\", \"name\", \"bucketId\","
                + " \"sortOrder\", \"createdAt\", \"updatedAt\")"
                + " VALUES ('old-habit', ?, 'Old habit', 'old-bucket', 0, now(), now())", USER);

        String body = """
                {
                  "bucketDeletes": ["old-bucket", "never-existed"],
                  "bucketCreates": [
                    {"id": "new-bucket", "name": "New shelf", "color": "#123456"},
                    {"id": "blank-bucket", "name": "   ", "color": null}
                  ],
                  "bucketUpdates": [{"id": "never-existed", "name": {"set": true, "value": "x"}, "color": null}],
                  "deletes": ["never-existed-habit"],
                  "creates": [
                    {"id": "new-habit", "name": "Read", "color": null, "bucketId": "new-bucket",
                     "itemPlannerIds": ["%s", "%s", "no-such-planner"]}
                  ],
                  "updates": [
                    {"id": "old-habit", "name": {"set": true, "value": "Renamed"},
                     "color": null, "bucketId": {"set": true, "value": null}},
                    {"id": "never-existed-habit", "name": {"set": true, "value": "ghost"},
                     "color": null, "bucketId": null}
                  ],
                  "addItems": [{"habitId": "old-habit", "plannerId": "%s"}],
                  "removeItems": [{"habitId": "old-habit", "plannerId": "never-linked"}]
                }
                """.formatted(REPEATING, ONE_OFF, REPEATING);

        mockMvc.perform(post("/habits/apply").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.buckets.length()").value(1))
                .andExpect(jsonPath("$.buckets[0].id").value("new-bucket"))
                .andExpect(jsonPath("$.habits.length()").value(2))
                .andExpect(jsonPath("$.items.length()").value(2));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"bucketId\" FROM \"Habits\" WHERE \"id\" = 'new-habit'", String.class))
                .isEqualTo("new-bucket");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"name\" FROM \"Habits\" WHERE \"id\" = 'old-habit'", String.class))
                .isEqualTo("Renamed");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"bucketId\" FROM \"Habits\" WHERE \"id\" = 'old-habit'", String.class))
                .isNull();
        // The one-off and the unknown planner were filtered from the create's links.
        assertThat(jdbcTemplate.queryForList(
                "SELECT \"plannerId\" FROM \"HabitItems\" WHERE \"userId\" = ?", String.class, USER))
                .containsOnly(REPEATING);
    }

    @Test
    void habitsNeverMoveDataVersion() throws Exception {
        mockMvc.perform(post("/habits").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Run\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/habits").with(asUser(USER))).andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, USER)).isEqualTo(5);
    }

    @Test
    void everyEndpointRequiresAnAccessToken() throws Exception {
        mockMvc.perform(get("/habits")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/habits").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/habits/apply").contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isUnauthorized());
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder addItem(
            String userId, String habitId, String plannerId) {
        return put("/habits/{id}/items", habitId).with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"plannerId\":\"" + plannerId + "\"}");
    }
}
