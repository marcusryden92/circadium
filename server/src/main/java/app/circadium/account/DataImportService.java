package app.circadium.account;

import app.circadium.auth.AccountFlowException;
import app.circadium.persistence.DbTime;
import app.circadium.ws.DataVersionBroadcaster;
import java.sql.PreparedStatement;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Counterpart to {@link DataExportService}, ported from {@code actions/dataImport.ts}: load a Circadium
 * export back into the account.
 *
 * <ul>
 * <li><b>replace</b> wipes the account's data and restores the file (ids preserved, re-owned to the
 * caller) — the true restore, used for DB migration. Engine-derived rows (calendar/category/travel
 * events, engine messages) are wiped but never imported — the engine regenerates them. The calendar
 * CONNECTION rows survive (their refresh tokens are not in an export).</li>
 * <li><b>add</b> brings the file's items in as NEW rows beside existing data; every id is remapped
 * through a per-table-namespaced map so nothing collides, a location whose placeId the user already has
 * reuses the existing row, and the deterministic external-event ids are rebuilt on the new source id.</li>
 * </ul>
 *
 * <p>Every table goes in as ONE multi-row {@code unnest} insert. That is not just the sync writer's
 * plan-reuse trick: {@code Planners.linkedItemId} and {@code Categories.parentId} are self-referencing
 * foreign keys and an import batch may reference rows later in the same batch — Postgres checks
 * non-deferred FKs at end of statement, so a single statement accepts what per-row inserts would refuse
 * (Prisma's {@code createMany} worked the same way).
 *
 * <p>The retired action's stale-JWT user-existence pre-check is dropped: a Java access token only
 * validates while its {@code sessions} row exists, and sessions cascade with the user, so the session
 * user always exists here. Its {@code userId} spread into the {@code TaskPreferences} insert is dropped
 * too — that table has no such column (latent in TS because the array was always empty). The
 * {@code dataVersion} bump is broadcast to the user's live sessions after the commit, which the action
 * predates.
 */
@Service
public class DataImportService {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final DateTimeFormatter DB_LOCAL = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS");

    private final JdbcTemplate jdbcTemplate;
    private final DataVersionBroadcaster broadcaster;
    private final TransactionTemplate transactionTemplate;

    DataImportService(JdbcTemplate jdbcTemplate, DataVersionBroadcaster broadcaster,
            PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        this.broadcaster = broadcaster;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setTimeout(120);
    }

    public record ImportResult(int imported) {}

    private enum Kind { STR, INT, FLOAT, BOOL, TS, JSONB, INT_ARRAY }

    /**
     * One written column: the export key, the value kind, and an optional cast to the column's own type
     * (Postgres enums; {@code jsonb}, {@code timestamp(3)} and {@code int4[]} ride on their kind).
     */
    private record Col(String key, Kind kind, String enumType) {

        Col(String key, Kind kind) {
            this(key, kind, null);
        }

        static Col label(String key, String enumType) {
            return new Col(key, Kind.STR, enumType);
        }
    }

    public ImportResult importData(String userId, String rawMode, JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_payload",
                    "That file isn't a valid Circadium export.");
        }
        JsonNode meta = payload.get("meta");
        if (meta == null || !meta.isObject() || !DataExportService.FORMAT.equals(str(meta, "format"))) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "unrecognized_format",
                    "Unrecognized file — use a JSON file exported from Circadium.");
        }
        boolean remap = switch (rawMode == null ? "" : rawMode) {
            case "add" -> true;
            case "replace" -> false;
            default -> throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_mode",
                    "Unknown import mode.");
        };

        State state;
        try {
            state = transactionTemplate.execute(status -> run(userId, remap, payload));
        } catch (AccountFlowException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new AccountFlowException(HttpStatus.UNPROCESSABLE_ENTITY, "import_failed",
                    "Import failed — nothing was changed. Details: "
                            + (e.getMessage() == null ? "unknown error" : e.getMessage()));
        }
        // After the commit, like the sync: other live sessions hear the new version and adopt the
        // imported state through the bootstrap.
        broadcaster.broadcast(userId, state.newDataVersion);
        return new ImportResult(state.imported);
    }

    private static final class State {
        final Map<String, String> idMap = new HashMap<>();
        boolean remap;
        int imported;
        int newDataVersion;
    }

    private State run(String userId, boolean remap, JsonNode data) {
        State state = new State();
        state.remap = remap;

        List<ObjectNode> locations = rows(data, "locations");
        List<ObjectNode> travelTimes = rows(data, "travelTimes");
        List<ObjectNode> categories = rows(data, "categories");
        List<ObjectNode> templates = rows(data, "weeklyTemplates");
        List<ObjectNode> planners = rows(data, "planners");
        List<ObjectNode> taskPreferences = rows(data, "taskPreferences");
        List<ObjectNode> queues = rows(data, "queues");
        List<ObjectNode> dependencies = rows(data, "dependencies");
        List<ObjectNode> conversations = rows(data, "aiConversations");
        List<ObjectNode> sources = rows(data, "externalCalendarSources");
        List<ObjectNode> events = rows(data, "externalCalendarEvents");
        List<ObjectNode> habitBuckets = rows(data, "habitBuckets");
        List<ObjectNode> habits = rows(data, "habits");
        List<ObjectNode> habitItems = rows(data, "habitItems");
        List<ObjectNode> completions = rows(data, "occurrenceCompletions");
        JsonNode viewState = objectOrNull(data.get("viewState"));
        JsonNode preferences = objectOrNull(data.get("schedulingPreferences"));

        if (!state.remap) {
            wipe(userId);
        }

        // In add mode, a location with a placeId the user already has must reuse the existing row
        // (the [userId, placeId] unique would reject a duplicate, and child rows need a valid target).
        Map<String, String> existingByPlace = new HashMap<>();
        if (state.remap) {
            jdbcTemplate.query("SELECT \"id\", \"placeId\" FROM \"Locations\" WHERE \"userId\" = ?",
                    rs -> { existingByPlace.put(rs.getString("placeId"), rs.getString("id")); }, userId);
        }
        List<ObjectNode> locationsToInsert = new ArrayList<>();
        for (ObjectNode location : locations) {
            String placeId = idOf(location.get("placeId"));
            if (state.remap && !placeId.isEmpty() && existingByPlace.containsKey(placeId)) {
                state.idMap.put("location:" + idOf(location.get("id")), existingByPlace.get(placeId));
                continue;
            }
            locationsToInsert.add(location);
        }
        for (ObjectNode location : locationsToInsert) {
            assign(state, "location", location.get("id"));
        }

        // Pre-assign ids so references resolve regardless of row order.
        for (ObjectNode row : travelTimes) assign(state, "travelTime", row.get("id"));
        for (ObjectNode row : categories) assign(state, "category", row.get("id"));
        for (ObjectNode row : categories) {
            for (ObjectNode window : children(row, "timeSlots")) assign(state, "window", window.get("id"));
        }
        for (ObjectNode row : templates) assign(state, "template", row.get("id"));
        for (ObjectNode row : planners) assign(state, "planner", row.get("id"));
        for (ObjectNode row : taskPreferences) assign(state, "taskPref", row.get("id"));
        for (ObjectNode row : queues) assign(state, "queue", row.get("id"));
        for (ObjectNode row : queues) {
            for (ObjectNode member : children(row, "members")) assign(state, "member", member.get("id"));
        }
        for (ObjectNode row : dependencies) assign(state, "dependency", row.get("id"));
        for (ObjectNode row : conversations) assign(state, "conversation", row.get("id"));
        for (ObjectNode row : sources) assign(state, "source", row.get("id"));
        for (ObjectNode row : habitBuckets) assign(state, "habitBucket", row.get("id"));
        for (ObjectNode row : habits) assign(state, "habit", row.get("id"));
        for (ObjectNode row : habitItems) assign(state, "habitItem", row.get("id"));
        for (ObjectNode row : completions) assign(state, "completion", row.get("id"));

        insert(state, "Locations", locationsToInsert.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, LOCATION_COLS);
                    values.put("id", ref(state, "location", row.get("id")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), LOCATION_COLS);

        insert(state, "TravelTimes", travelTimes.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, TRAVEL_TIME_COLS);
                    values.put("id", ref(state, "travelTime", row.get("id")));
                    values.put("fromLocationId", ref(state, "location", row.get("fromLocationId")));
                    values.put("toLocationId", ref(state, "location", row.get("toLocationId")));
                    values.put("userId", userId);
                    return values;
                })
                .filter(values -> present(values, "fromLocationId") && present(values, "toLocationId"))
                .toList(), TRAVEL_TIME_COLS);

        insert(state, "Categories", categories.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, CATEGORY_COLS);
                    values.put("id", ref(state, "category", row.get("id")));
                    values.put("parentId", isMissing(row.get("parentId")) ? null
                            : ref(state, "category", row.get("parentId")));
                    values.put("locationId", isMissing(row.get("locationId")) ? null
                            : ref(state, "location", row.get("locationId")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), CATEGORY_COLS);

        List<Map<String, Object>> windows = new ArrayList<>();
        for (ObjectNode category : categories) {
            for (ObjectNode window : children(category, "timeSlots")) {
                Map<String, Object> values = base(window, WINDOW_COLS);
                values.put("id", ref(state, "window", window.get("id")));
                values.put("categoryId", isMissing(window.get("categoryId"))
                        ? ref(state, "category", category.get("id"))
                        : ref(state, "category", window.get("categoryId")));
                values.put("userId", userId);
                windows.add(values);
            }
        }
        insert(state, "CategoryTimeWindows", windows, WINDOW_COLS);

        insert(state, "EventTemplates", templates.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, TEMPLATE_COLS);
                    values.put("id", ref(state, "template", row.get("id")));
                    values.put("locationId", isMissing(row.get("locationId")) ? null
                            : ref(state, "location", row.get("locationId")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), TEMPLATE_COLS);

        insert(state, "Planners", planners.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, PLANNER_COLS);
                    values.put("id", ref(state, "planner", row.get("id")));
                    // parentId is a plain column (no FK); still remapped so the tree holds.
                    values.put("parentId", isMissing(row.get("parentId")) ? null
                            : ref(state, "planner", row.get("parentId")));
                    values.put("categoryId", isMissing(row.get("categoryId")) ? null
                            : ref(state, "category", row.get("categoryId")));
                    values.put("locationId", isMissing(row.get("locationId")) ? null
                            : ref(state, "location", row.get("locationId")));
                    values.put("linkedItemId", isMissing(row.get("linkedItemId")) ? null
                            : ref(state, "planner", row.get("linkedItemId")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), PLANNER_COLS);

        insert(state, "TaskPreferences", taskPreferences.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, TASK_PREFERENCE_COLS);
                    values.put("id", ref(state, "taskPref", row.get("id")));
                    values.put("plannerId", ref(state, "planner", row.get("plannerId")));
                    return values;
                })
                .filter(values -> present(values, "plannerId"))
                .toList(), TASK_PREFERENCE_COLS);

        insert(state, "Queues", queues.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, QUEUE_COLS);
                    values.put("id", ref(state, "queue", row.get("id")));
                    values.put("categoryId", isMissing(row.get("categoryId")) ? null
                            : ref(state, "category", row.get("categoryId")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), QUEUE_COLS);

        List<Map<String, Object>> members = new ArrayList<>();
        for (ObjectNode queue : queues) {
            for (ObjectNode member : children(queue, "members")) {
                Map<String, Object> values = base(member, MEMBER_COLS);
                values.put("id", ref(state, "member", member.get("id")));
                values.put("queueId", ref(state, "queue", queue.get("id")));
                values.put("plannerId", ref(state, "planner", member.get("plannerId")));
                values.put("userId", userId);
                if (present(values, "queueId") && present(values, "plannerId")) {
                    members.add(values);
                }
            }
        }
        insert(state, "QueueMembers", members, MEMBER_COLS);

        insert(state, "PlannerDependencies", dependencies.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, DEPENDENCY_COLS);
                    values.put("id", ref(state, "dependency", row.get("id")));
                    values.put("predecessorId", ref(state, "planner", row.get("predecessorId")));
                    values.put("successorId", ref(state, "planner", row.get("successorId")));
                    values.put("userId", userId);
                    return values;
                })
                .filter(values -> present(values, "predecessorId") && present(values, "successorId"))
                .toList(), DEPENDENCY_COLS);

        insert(state, "DraftConversations", conversations.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, CONVERSATION_COLS);
                    values.put("id", ref(state, "conversation", row.get("id")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), CONVERSATION_COLS);

        insert(state, "ExternalCalendarSources", sources.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, SOURCE_COLS);
                    values.put("id", ref(state, "source", row.get("id")));
                    values.put("locationId", isMissing(row.get("locationId")) ? null
                            : ref(state, "location", row.get("locationId")));
                    // locationExceptions references location ids by value; remapped in add mode or
                    // they dangle.
                    if (state.remap && values.get("locationExceptions") instanceof String exceptions) {
                        values.put("locationExceptions", remapLocationExceptions(state, exceptions));
                    }
                    values.put("userId", userId);
                    return values;
                })
                .toList(), SOURCE_COLS);

        insert(state, "ExternalEvents", events.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, EXTERNAL_EVENT_COLS);
                    String sourceId = ref(state, "source", row.get("sourceId"));
                    values.put("sourceId", sourceId);
                    // The id is composite (`sourceId|uid|start`); rebuilt when the source id changed.
                    values.put("id", state.remap
                            ? sourceId + "|" + idOf(row.get("uid")) + "|" + idOf(row.get("start"))
                            : idOf(row.get("id")));
                    values.put("userId", userId);
                    return values;
                })
                .filter(values -> present(values, "sourceId"))
                .toList(), EXTERNAL_EVENT_COLS);

        insert(state, "HabitBuckets", habitBuckets.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, HABIT_BUCKET_COLS);
                    values.put("id", ref(state, "habitBucket", row.get("id")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), HABIT_BUCKET_COLS);

        // Legacy exports carried categoryId on habits (buckets were category references before they
        // became their own entity) — never read here, so an old file still imports, unsorted.
        insert(state, "Habits", habits.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, HABIT_COLS);
                    values.put("id", ref(state, "habit", row.get("id")));
                    values.put("bucketId", isMissing(row.get("bucketId")) ? null
                            : ref(state, "habitBucket", row.get("bucketId")));
                    values.put("userId", userId);
                    return values;
                })
                .toList(), HABIT_COLS);

        insert(state, "HabitItems", habitItems.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, HABIT_ITEM_COLS);
                    values.put("id", ref(state, "habitItem", row.get("id")));
                    values.put("habitId", ref(state, "habit", row.get("habitId")));
                    values.put("plannerId", ref(state, "planner", row.get("plannerId")));
                    values.put("userId", userId);
                    return values;
                })
                .filter(values -> present(values, "habitId") && present(values, "plannerId"))
                .toList(), HABIT_ITEM_COLS);

        insert(state, "HabitCompletions", completions.stream()
                .map(row -> {
                    Map<String, Object> values = base(row, COMPLETION_COLS);
                    values.put("id", ref(state, "completion", row.get("id")));
                    values.put("plannerId", ref(state, "planner", row.get("plannerId")));
                    values.put("userId", userId);
                    return values;
                })
                .filter(values -> present(values, "plannerId"))
                .toList(), COMPLETION_COLS);

        // Single-row, user-unique state: only restored on a full replace so an add never clobbers
        // current preferences / view settings. Deliberately outside the `imported` count, like the
        // retired action (it only summed the createMany calls).
        int countedSoFar = state.imported;
        if (!state.remap && viewState != null) {
            Map<String, Object> values = base((ObjectNode) viewState, VIEW_STATE_COLS);
            values.put("userId", userId);
            insert(state, "UserViewStates", List.of(values), VIEW_STATE_COLS);
        }
        if (!state.remap && preferences != null) {
            Map<String, Object> values = base((ObjectNode) preferences, PREFERENCES_COLS);
            values.put("userId", userId);
            insert(state, "UserSchedulingPreferences", List.of(values), PREFERENCES_COLS);
        }
        state.imported = countedSoFar;

        state.newDataVersion = jdbcTemplate.queryForObject(
                "UPDATE \"users\" SET \"dataVersion\" = \"dataVersion\" + 1 WHERE \"id\" = ? "
                        + "RETURNING \"dataVersion\"", Integer.class, userId);
        return state;
    }

    /** Children before parents. Engine-derived rows go too — they rebuild on the next regen. */
    private void wipe(String userId) {
        for (String table : List.of("ExternalEvents", "ExternalCalendarSources", "CategoryEvents",
                "TravelEvents", "EngineMessages", "DraftConversations", "SimpleEvents", "QueueMembers",
                "Queues", "PlannerDependencies")) {
            jdbcTemplate.update("DELETE FROM \"" + table + "\" WHERE \"userId\" = ?", userId);
        }
        jdbcTemplate.update("DELETE FROM \"TaskPreferences\" t WHERE EXISTS (SELECT 1 FROM \"Planners\" p "
                + "WHERE p.\"id\" = t.\"plannerId\" AND p.\"userId\" = ?)", userId);
        for (String table : List.of("HabitItems", "Habits", "HabitBuckets", "HabitCompletions",
                "CategoryTimeWindows", "Planners", "Categories", "EventTemplates", "TravelTimes",
                "Locations", "UserViewStates", "UserSchedulingPreferences")) {
            jdbcTemplate.update("DELETE FROM \"" + table + "\" WHERE \"userId\" = ?", userId);
        }
    }

    // Per-table column lists. "id" and every remapped reference column are overwritten by the caller;
    // base() seeds the rest straight from the export row.

    private static final List<Col> LOCATION_COLS = List.of(
            new Col("id", Kind.STR), new Col("name", Kind.STR), new Col("address", Kind.STR),
            new Col("placeId", Kind.STR), new Col("lat", Kind.FLOAT), new Col("lng", Kind.FLOAT),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> TRAVEL_TIME_COLS = List.of(
            new Col("id", Kind.STR), new Col("fromLocationId", Kind.STR), new Col("toLocationId", Kind.STR),
            Col.label("transportMode", "TransportMode"), new Col("googleRushHourMinutes", Kind.INT),
            new Col("googleRegularMinutes", Kind.INT), new Col("googleNightMinutes", Kind.INT),
            new Col("customRushHourMinutes", Kind.INT), new Col("customRegularMinutes", Kind.INT),
            new Col("customNightMinutes", Kind.INT), new Col("unroutableAt", Kind.TS),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> CATEGORY_COLS = List.of(
            new Col("id", Kind.STR), new Col("name", Kind.STR), new Col("icon", Kind.STR),
            new Col("color", Kind.STR), new Col("sortOrder", Kind.INT), new Col("useTimeWindows", Kind.BOOL),
            new Col("isStrict", Kind.BOOL), new Col("confineToOwnWindows", Kind.BOOL),
            new Col("locationId", Kind.STR), new Col("parentId", Kind.STR), new Col("userId", Kind.STR),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> WINDOW_COLS = List.of(
            new Col("id", Kind.STR), new Col("day", Kind.INT), new Col("startTime", Kind.STR),
            new Col("endTime", Kind.STR), new Col("recurrenceExceptions", Kind.STR),
            new Col("categoryId", Kind.STR), new Col("userId", Kind.STR));

    private static final List<Col> TEMPLATE_COLS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), Col.label("startDay", "WeekDayType"),
            new Col("startTime", Kind.STR), new Col("userId", Kind.STR), new Col("duration", Kind.INT),
            new Col("color", Kind.STR), new Col("locationId", Kind.STR),
            new Col("recurrenceExceptions", Kind.STR), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> PLANNER_COLS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("parentId", Kind.STR),
            Col.label("plannerType", "PlannerType"), new Col("isReady", Kind.BOOL),
            new Col("isTriaged", Kind.BOOL), new Col("duration", Kind.INT), new Col("deadline", Kind.STR),
            new Col("starts", Kind.STR), new Col("recurrence", Kind.STR),
            new Col("recurrenceExceptions", Kind.STR), new Col("splitting", Kind.STR),
            new Col("completedSegments", Kind.STR), new Col("maxMinutesPerDay", Kind.INT),
            new Col("earliestStartDate", Kind.STR), new Col("allowedTimes", Kind.STR),
            new Col("linkedItemId", Kind.STR), new Col("notes", Kind.STR), new Col("sortOrder", Kind.FLOAT),
            new Col("completedStartTime", Kind.STR), new Col("completedEndTime", Kind.STR),
            new Col("priority", Kind.INT), new Col("userId", Kind.STR), new Col("color", Kind.STR),
            new Col("locationId", Kind.STR), new Col("useParentLocation", Kind.BOOL),
            new Col("categoryId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> TASK_PREFERENCE_COLS = List.of(
            new Col("id", Kind.STR), new Col("plannerId", Kind.STR), Col.label("taskType", "TaskTypeEnum"),
            new Col("preferredDays", Kind.INT_ARRAY), new Col("preferredStartTime", Kind.STR),
            new Col("preferredEndTime", Kind.STR), new Col("avoidDays", Kind.INT_ARRAY),
            Col.label("priority", "PriorityLevel"), Col.label("energyLevel", "EnergyLevel"),
            new Col("allowFlexibility", Kind.BOOL));

    private static final List<Col> QUEUE_COLS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("sortOrder", Kind.INT),
            new Col("color", Kind.STR), new Col("categoryId", Kind.STR), new Col("userId", Kind.STR),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> MEMBER_COLS = List.of(
            new Col("id", Kind.STR), new Col("sortOrder", Kind.FLOAT), new Col("queueId", Kind.STR),
            new Col("plannerId", Kind.STR), new Col("userId", Kind.STR), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> DEPENDENCY_COLS = List.of(
            new Col("id", Kind.STR), new Col("predecessorId", Kind.STR), new Col("successorId", Kind.STR),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> CONVERSATION_COLS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("messages", Kind.JSONB),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> SOURCE_COLS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), Col.label("kind", "ExternalCalendarKind"),
            new Col("url", Kind.STR), new Col("name", Kind.STR), new Col("color", Kind.STR),
            new Col("enabled", Kind.BOOL), Col.label("mode", "ExternalCalendarMode"),
            new Col("modeExceptions", Kind.STR), new Col("locationId", Kind.STR),
            new Col("locationExceptions", Kind.STR), new Col("lastFetchedAt", Kind.TS),
            new Col("lastError", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> EXTERNAL_EVENT_COLS = List.of(
            new Col("id", Kind.STR), new Col("sourceId", Kind.STR), new Col("userId", Kind.STR),
            new Col("uid", Kind.STR), new Col("title", Kind.STR), new Col("start", Kind.STR),
            new Col("end", Kind.STR), new Col("allDay", Kind.BOOL));

    private static final List<Col> HABIT_BUCKET_COLS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("name", Kind.STR),
            new Col("color", Kind.STR), new Col("sortOrder", Kind.INT), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> HABIT_COLS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("name", Kind.STR),
            new Col("color", Kind.STR), new Col("bucketId", Kind.STR), new Col("sortOrder", Kind.INT),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> HABIT_ITEM_COLS = List.of(
            new Col("id", Kind.STR), new Col("habitId", Kind.STR), new Col("plannerId", Kind.STR),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS));

    private static final List<Col> COMPLETION_COLS = List.of(
            new Col("id", Kind.STR), new Col("plannerId", Kind.STR), new Col("userId", Kind.STR),
            new Col("occurrenceKey", Kind.STR), new Col("start", Kind.STR), new Col("end", Kind.STR),
            new Col("createdAt", Kind.TS));

    private static final List<Col> VIEW_STATE_COLS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("graph", Kind.STR),
            new Col("mindmap", Kind.STR), new Col("updatedAt", Kind.TS));

    private static final List<Col> PREFERENCES_COLS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("bufferTimeMinutes", Kind.INT),
            Col.label("defaultTransportMode", "TransportMode"), new Col("weekStartDay", Kind.INT),
            new Col("lastTravelRefreshAt", Kind.TS), new Col("lastTravelTopUpAt", Kind.TS),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    /** The row's own values for every column, before the caller overwrites ids and references. */
    private static Map<String, Object> base(ObjectNode row, List<Col> cols) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (Col col : cols) {
            JsonNode value = row.get(col.key());
            values.put(col.key(), switch (col.kind()) {
                case STR -> value != null && value.isString() ? value.stringValue() : null;
                case INT -> value != null && value.isNumber() ? value.intValue() : null;
                case FLOAT -> value != null && value.isNumber() ? value.doubleValue() : null;
                case BOOL -> value != null && value.isBoolean() ? (Boolean) value.booleanValue() : null;
                case TS -> toDbLocal(value);
                case JSONB -> value == null || value.isNull() ? null : JSON.writeValueAsString(value);
                case INT_ARRAY -> toIntArrayLiteral(value);
            });
        }
        return values;
    }

    /**
     * One multi-row {@code unnest} insert (see the class comment for why it must be one statement).
     * Values travel as one array per column; enums, timestamps, jsonb and int arrays travel as text and
     * are cast into the column's own type.
     */
    private void insert(State state, String table, List<Map<String, Object>> rows, List<Col> cols) {
        if (rows.isEmpty()) {
            return;
        }
        String columns = cols.stream().map(c -> '"' + c.key() + '"').collect(Collectors.joining(", "));
        String selected = cols.stream().map(DataImportService::selectedColumn).collect(Collectors.joining(", "));
        String arrays = cols.stream().map(c -> "?::" + arrayType(c) + "[]").collect(Collectors.joining(", "));
        String sql = "INSERT INTO \"" + table + "\" (" + columns + ") SELECT " + selected
                + " FROM unnest(" + arrays + ") AS v(" + columns + ")"
                + (state.remap ? " ON CONFLICT DO NOTHING" : "");
        state.imported += jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql);
            for (int i = 0; i < cols.size(); i++) {
                Col col = cols.get(i);
                Object[] values = rows.stream().map(row -> row.get(col.key())).toArray();
                statement.setArray(i + 1, connection.createArrayOf(arrayType(col), values));
            }
            return statement;
        });
    }

    private static String selectedColumn(Col col) {
        String value = "v.\"" + col.key() + '"';
        if (col.enumType() != null) {
            return value + "::\"" + col.enumType() + '"';
        }
        return switch (col.kind()) {
            case TS -> value + "::timestamp(3)";
            case JSONB -> value + "::jsonb";
            case INT_ARRAY -> value + "::int4[]";
            default -> value;
        };
    }

    private static String arrayType(Col col) {
        return switch (col.kind()) {
            case INT -> "int4";
            case FLOAT -> "float8";
            case BOOL -> "bool";
            default -> "text";
        };
    }

    /** An export timestamp ("...Z", UTC) as the DB's local-UTC text, castable to {@code timestamp(3)}. */
    private static String toDbLocal(JsonNode value) {
        if (value == null || !value.isString()) {
            return null;
        }
        try {
            return DB_LOCAL.format(DbTime.toDb(Instant.parse(value.stringValue())));
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** A Postgres array literal ("{1,2,3}"), castable to {@code int4[]}; null stays null. */
    private static String toIntArrayLiteral(JsonNode value) {
        if (value == null || !value.isArray()) {
            return null;
        }
        List<String> elements = new ArrayList<>();
        for (JsonNode element : value) {
            if (element.isNumber()) {
                elements.add(String.valueOf(element.intValue()));
            }
        }
        return "{" + String.join(",", elements) + "}";
    }

    private String remapLocationExceptions(State state, String exceptions) {
        JsonNode parsed;
        try {
            parsed = JSON.readTree(exceptions);
        } catch (RuntimeException e) {
            return exceptions;
        }
        if (!parsed.isObject()) {
            return exceptions;
        }
        ObjectNode remapped = JSON.createObjectNode();
        parsed.properties().forEach(entry -> {
            JsonNode location = entry.getValue();
            if (location == null || location.isNull() || !location.isString()) {
                remapped.putNull(entry.getKey());
            } else {
                String mapped = state.idMap.get("location:" + location.stringValue());
                if (mapped == null) {
                    remapped.putNull(entry.getKey());
                } else {
                    remapped.put(entry.getKey(), mapped);
                }
            }
        });
        return JSON.writeValueAsString(remapped);
    }

    // Ids in an export are always strings; anything else is treated as absent, like the TS idOf.

    private static String idOf(JsonNode value) {
        return value != null && value.isString() ? value.stringValue() : "";
    }

    private static void assign(State state, String table, JsonNode oldId) {
        if (!state.remap) {
            return;
        }
        String key = table + ":" + idOf(oldId);
        state.idMap.computeIfAbsent(key, k -> UUID.randomUUID().toString());
    }

    private static String ref(State state, String table, JsonNode oldId) {
        String original = idOf(oldId);
        if (!state.remap) {
            return original;
        }
        return state.idMap.get(table + ":" + original);
    }

    private static boolean present(Map<String, Object> values, String key) {
        return values.get(key) instanceof String value && !value.isEmpty();
    }

    private static boolean isMissing(JsonNode value) {
        return value == null || value.isNull();
    }

    private static List<ObjectNode> rows(JsonNode data, String key) {
        List<ObjectNode> rows = new ArrayList<>();
        JsonNode section = data.get(key);
        if (section != null && section.isArray()) {
            for (JsonNode row : section) {
                if (row.isObject()) {
                    rows.add((ObjectNode) row);
                }
            }
        }
        return rows;
    }

    private static List<ObjectNode> children(ObjectNode row, String key) {
        List<ObjectNode> children = new ArrayList<>();
        JsonNode section = row.get(key);
        if (section != null && section.isArray()) {
            for (JsonNode child : section) {
                if (child.isObject()) {
                    children.add((ObjectNode) child);
                }
            }
        }
        return children;
    }

    private static JsonNode objectOrNull(JsonNode value) {
        return value != null && value.isObject() ? value : null;
    }

    private static String str(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isString() ? value.stringValue() : null;
    }
}
