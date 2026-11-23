package app.circadium.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * What the golden corpus cannot show, because the web's sync does not do it or the corpus has no case for it: access
 * control, request validation, concurrent syncs, the ownership checks on references, and a batch too large for a
 * statement with one parameter per value.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SyncIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final List<String> GROUPS = List.of("planner", "calendar", "template", "extendedProps", "category",
            "categoryTimeWindow", "categoryEvent", "travelEvent", "engineMessage", "queue", "queueMember",
            "dependency", "location", "travelTime");
    private static final String CREATED = "2026-03-01T20:00:00.000Z";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void requiresAnAccessToken() throws Exception {
        mockMvc.perform(post("/calendar/sync").contentType(MediaType.APPLICATION_JSON)
                        .content(request(changes(), 0).toString()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anAccountThatNoLongerExistsIsUnauthorized() throws Exception {
        ObjectNode changes = changes();
        add(changes, "planner", "create", planner(UUID.randomUUID().toString(), "Orphan"));

        sync(UUID.randomUUID().toString(), request(changes, 0))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("account_not_found"));
    }

    @Test
    void anEmptyDiffSucceedsWithoutTouchingTheAccount() throws Exception {
        String userId = newUser();

        sync(userId, request(changes(), 4))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.newDataVersion").value(4));
        assertThat(dataVersion(userId)).isZero();
    }

    @Test
    void aStaleSyncCarriesTheCurrentStateAndWritesNothing() throws Exception {
        String userId = newUser();
        ObjectNode changes = changes();
        add(changes, "planner", "create", planner(userId + "-planner", "Lost"));

        sync(userId, request(changes, 3))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("stale"))
                .andExpect(jsonPath("$.freshState.dataVersion").value(0))
                .andExpect(jsonPath("$.freshState.planner").isEmpty())
                .andExpect(jsonPath("$.requestId").exists());
        assertThat(count("Planners", userId)).isZero();
    }

    @Test
    void ofTwoSyncsAgainstTheSameVersionExactlyOneIsSaved() throws Exception {
        String userId = newUser();
        CountDownLatch start = new CountDownLatch(1);
        Callable<Integer> attempt = () -> {
            ObjectNode changes = changes();
            add(changes, "planner", "create", planner(userId + "-" + UUID.randomUUID(), "Racing"));
            start.await();
            return sync(userId, request(changes, 0)).andReturn().getResponse().getStatus();
        };

        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = pool.submit(attempt);
            Future<Integer> second = pool.submit(attempt);
            start.countDown();
            assertThat(List.of(first.get(), second.get())).containsExactlyInAnyOrder(200, 409);
        }
        assertThat(dataVersion(userId)).isEqualTo(1);
        assertThat(count("Planners", userId)).isEqualTo(1);
    }

    @Test
    void aBodyMissingAGroupIsRejected() throws Exception {
        String userId = newUser();
        ObjectNode changes = changes();
        changes.remove("travelTime");

        sync(userId, request(changes, 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['changes.travelTime']").exists());
    }

    @Test
    void aRowWithoutAnIdIsRejected() throws Exception {
        String userId = newUser();
        ObjectNode changes = changes();
        ObjectNode planner = planner("ignored", "No id");
        planner.putNull("id");
        add(changes, "planner", "update", planner);

        sync(userId, request(changes, 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['changes.planner.update[0].id']").exists());
        assertThat(dataVersion(userId)).isZero();
    }

    @Test
    void aWeekdayOutsideZeroToSixIsRejected() throws Exception {
        String userId = newUser();
        ObjectNode changes = changes();
        add(changes, "template", "create", JSON.createObjectNode()
                .put("id", userId + "-template").put("title", "Someday").put("startDay", 7).put("startTime", "09:00")
                .put("userId", userId).put("duration", 30).putNull("color").putNull("locationId")
                .putNull("recurrenceExceptions").put("createdAt", CREATED).put("updatedAt", CREATED));

        sync(userId, request(changes, 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['changes.template.create[0].startDay']").exists());
    }

    @Test
    void aMissingVersionIsRejected() throws Exception {
        String userId = newUser();
        ObjectNode body = JSON.createObjectNode();
        body.set("changes", changes());

        sync(userId, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.clientKnownDataVersion").exists());
    }

    /**
     * Rows read back through a parent (windows through their category, members through their queue) and the
     * table-wide unique slots (a planner's one queue membership, a dependency pair) may only point at the caller's
     * own rows. The web's sync has no such check.
     */
    @Test
    void referencesToAnotherAccountsRowsAreSkipped() throws Exception {
        String me = newUser();
        String other = newUser();
        insertCategory(me + "-category", me);
        insertCategory(other + "-category", other);
        jdbcTemplate.update("INSERT INTO \"CategoryTimeWindows\" (\"id\", \"day\", \"startTime\", \"endTime\", "
                + "\"categoryId\", \"userId\") VALUES (?, 1, '09:00', '10:00', ?, ?)", me + "-window", me + "-category", me);
        insertPlanner(me + "-planner", me);
        insertPlanner(me + "-planner-2", me);
        insertPlanner(other + "-planner", other);
        insertQueue(me + "-queue", me);
        insertQueue(other + "-queue", other);
        jdbcTemplate.update("INSERT INTO \"QueueMembers\" (\"id\", \"sortOrder\", \"queueId\", \"plannerId\", "
                + "\"userId\", \"createdAt\", \"updatedAt\") VALUES (?, 0, ?, ?, ?, ?::timestamp(3), ?::timestamp(3))",
                me + "-member", me + "-queue", me + "-planner", me, CREATED, CREATED);

        ObjectNode changes = changes();
        add(changes, "categoryTimeWindow", "create", window(me + "-planted-window", other + "-category", me));
        add(changes, "categoryTimeWindow", "update", window(me + "-window", other + "-category", me));
        add(changes, "queueMember", "create", member(me + "-planted-member", other + "-queue", me + "-planner-2", me));
        add(changes, "queueMember", "create", member(me + "-squatting-member", me + "-queue", other + "-planner", me));
        add(changes, "queueMember", "update", member(me + "-member", other + "-queue", me + "-planner", me));
        add(changes, "dependency", "create", JSON.createObjectNode()
                .put("id", me + "-foreign-dependency").put("predecessorId", me + "-planner")
                .put("successorId", other + "-planner").put("userId", me).put("createdAt", CREATED)
                .put("updatedAt", CREATED));

        sync(me, request(changes, 0)).andExpect(status().isOk()).andExpect(jsonPath("$.newDataVersion").value(1));

        assertThat(jdbcTemplate.queryForList("SELECT \"id\" FROM \"CategoryTimeWindows\" WHERE \"userId\" = ?",
                String.class, me)).containsExactly(me + "-window");
        assertThat(jdbcTemplate.queryForObject("SELECT \"categoryId\" FROM \"CategoryTimeWindows\" WHERE \"id\" = ?",
                String.class, me + "-window")).isEqualTo(me + "-category");
        assertThat(jdbcTemplate.queryForList("SELECT \"id\" FROM \"QueueMembers\" WHERE \"userId\" = ?",
                String.class, me)).containsExactly(me + "-member");
        assertThat(jdbcTemplate.queryForObject("SELECT \"queueId\" FROM \"QueueMembers\" WHERE \"id\" = ?",
                String.class, me + "-member")).isEqualTo(me + "-queue");
        assertThat(count("PlannerDependencies", me)).isZero();
    }

    /** 3,000 planner items carry 87,000 values, past the 65,535 parameters a statement may bind. */
    @Test
    void aBatchPastTheBindParameterLimitIsSaved() throws Exception {
        String userId = newUser();
        ObjectNode changes = changes();
        for (int i = 0; i < 3_000; i++) {
            add(changes, "planner", "create", planner(userId + "-" + i, "Item " + i));
        }

        sync(userId, request(changes, 0)).andExpect(status().isOk());
        assertThat(count("Planners", userId)).isEqualTo(3_000);
    }

    @Test
    void theOpenApiDocumentDescribesTheRequestAndTheConflict() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/calendar/sync'].post.requestBody.content['application/json']"
                        + ".schema['$ref']").value("#/components/schemas/SyncRequest"))
                .andExpect(jsonPath("$.paths['/calendar/sync'].post.responses['200'].content['application/json']"
                        + ".schema['$ref']").value("#/components/schemas/SyncResult"))
                .andExpect(jsonPath("$.paths['/calendar/sync'].post.responses['409']"
                        + ".content['application/problem+json'].schema['$ref']")
                        .value("#/components/schemas/StaleSyncProblem"))
                .andExpect(jsonPath("$.components.schemas.StaleSyncProblem.properties.freshState['$ref']")
                        .value("#/components/schemas/BootstrapPayload"))
                .andExpect(jsonPath("$.components.schemas.DatabaseChanges.properties.travelTime").exists());
    }

    private ResultActions sync(String userId, ObjectNode body) throws Exception {
        return mockMvc.perform(post("/calendar/sync")
                .with(jwt().jwt(token -> token.subject(userId)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body.toString()));
    }

    private static ObjectNode request(ObjectNode changes, int clientKnownDataVersion) {
        ObjectNode body = JSON.createObjectNode();
        body.set("changes", changes);
        body.put("clientKnownDataVersion", clientKnownDataVersion);
        return body;
    }

    private static ObjectNode changes() {
        ObjectNode changes = JSON.createObjectNode();
        for (String group : GROUPS) {
            ObjectNode lists = changes.putObject(group);
            lists.putArray("create");
            lists.putArray("update");
            lists.putArray("destroy");
        }
        return changes;
    }

    private static void add(ObjectNode changes, String group, String operation, ObjectNode row) {
        ((ArrayNode) changes.get(group).get(operation)).add(row);
    }

    private static ObjectNode planner(String id, String title) {
        ObjectNode planner = JSON.createObjectNode().put("id", id).put("title", title).putNull("parentId")
                .put("plannerType", "task").put("isReady", true).put("isTriaged", true).put("duration", 30);
        for (String nullable : List.of("deadline", "starts", "recurrence", "recurrenceExceptions", "splitting",
                "completedSegments", "maxMinutesPerDay", "earliestStartDate", "allowedTimes", "linkedItemId",
                "notes", "completedStartTime", "completedEndTime", "color", "locationId", "categoryId")) {
            planner.putNull(nullable);
        }
        return planner.put("sortOrder", 0).put("priority", 3).put("userId", "ignored")
                .put("useParentLocation", false).put("createdAt", CREATED).put("updatedAt", CREATED);
    }

    private static ObjectNode window(String id, String categoryId, String userId) {
        return JSON.createObjectNode().put("id", id).put("day", 2).put("startTime", "13:00").put("endTime", "14:00")
                .putNull("recurrenceExceptions").put("categoryId", categoryId).put("userId", userId);
    }

    private static ObjectNode member(String id, String queueId, String plannerId, String userId) {
        return JSON.createObjectNode().put("id", id).put("sortOrder", 1.5).put("queueId", queueId)
                .put("plannerId", plannerId).put("userId", userId).put("createdAt", CREATED).put("updatedAt", CREATED);
    }

    private String newUser() {
        String userId = UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\") VALUES (?, ?)", userId,
                userId + "@example.test");
        return userId;
    }

    private void insertCategory(String id, String userId) {
        jdbcTemplate.update(
                "INSERT INTO \"Categories\" (\"id\", \"name\", \"userId\", \"updatedAt\") VALUES (?, ?, ?, ?::timestamp(3))",
                id, id, userId, CREATED);
    }

    private void insertPlanner(String id, String userId) {
        jdbcTemplate.update("INSERT INTO \"Planners\" (\"id\", \"title\", \"plannerType\", \"duration\", \"priority\", "
                + "\"userId\", \"createdAt\", \"updatedAt\") VALUES (?, ?, 'task', 30, 3, ?, ?::timestamp(3), ?::timestamp(3))",
                id, id, userId, CREATED, CREATED);
    }

    private void insertQueue(String id, String userId) {
        jdbcTemplate.update(
                "INSERT INTO \"Queues\" (\"id\", \"title\", \"userId\", \"updatedAt\") VALUES (?, ?, ?, ?::timestamp(3))",
                id, id, userId, CREATED);
    }

    private int dataVersion(String userId) {
        return jdbcTemplate.queryForObject("SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class,
                userId);
    }

    private int count(String table, String userId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM \"" + table + "\" WHERE \"userId\" = ?",
                Integer.class, userId);
    }
}
