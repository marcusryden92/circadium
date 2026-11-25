package app.circadium.account;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * GDPR Article 15 (access) + Article 20 (portability), ported from {@code actions/dataExport.ts}: a
 * machine-readable copy of everything the user has stored. Secrets are deliberately excluded — password
 * hashes, OAuth tokens, the calendar-connection refresh tokens, and the short-lived auth tokens are
 * credentials, not the user's own data. Each section's keys and per-row key order mirror the retired
 * action's output (the Prisma model field order), so an old export and a new one diff cleanly; the one
 * deliberate deviation is a stable {@code ORDER BY "id"} per table where the TS version left row order
 * to the database.
 */
@Service
@RequiredArgsConstructor
public class DataExportService {

    public static final String FORMAT = "circadium.data-export.v1";

    /** Prisma's {@code Date.toJSON()} shape: UTC, always three fraction digits. */
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    private enum Kind { STR, INT, FLOAT, BOOL, TS, JSON_BLOB, INT_ARRAY }

    /** One exported column: the JSON key, the value kind, and the DB column when its name differs. */
    private record Col(String key, Kind kind, String column) {

        Col(String key, Kind kind) {
            this(key, kind, key);
        }
    }

    // Per-table column lists in the Prisma model's field order — the key order the TS export emitted.

    private static final List<Col> PROFILE = List.of(
            new Col("id", Kind.STR), new Col("name", Kind.STR), new Col("email", Kind.STR),
            new Col("emailVerified", Kind.TS, "email_verified"), new Col("image", Kind.STR),
            new Col("role", Kind.STR), new Col("isTwoFactorEnabled", Kind.BOOL),
            new Col("onboardedAt", Kind.TS, "onboarded_at"), new Col("aiMode", Kind.STR, "ai_mode"));

    private static final List<Col> LINKED_SIGN_INS = List.of(
            new Col("provider", Kind.STR), new Col("type", Kind.STR),
            new Col("providerAccountId", Kind.STR, "provider_account_id"));

    private static final List<Col> PLANNERS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("parentId", Kind.STR),
            new Col("plannerType", Kind.STR), new Col("isReady", Kind.BOOL), new Col("isTriaged", Kind.BOOL),
            new Col("duration", Kind.INT), new Col("deadline", Kind.STR), new Col("starts", Kind.STR),
            new Col("recurrence", Kind.STR), new Col("recurrenceExceptions", Kind.STR),
            new Col("splitting", Kind.STR), new Col("completedSegments", Kind.STR),
            new Col("maxMinutesPerDay", Kind.INT), new Col("earliestStartDate", Kind.STR),
            new Col("allowedTimes", Kind.STR), new Col("linkedItemId", Kind.STR), new Col("notes", Kind.STR),
            new Col("sortOrder", Kind.FLOAT), new Col("completedStartTime", Kind.STR),
            new Col("completedEndTime", Kind.STR), new Col("priority", Kind.INT), new Col("userId", Kind.STR),
            new Col("color", Kind.STR), new Col("locationId", Kind.STR), new Col("useParentLocation", Kind.BOOL),
            new Col("categoryId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> SIMPLE_EVENTS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("start", Kind.STR),
            new Col("end", Kind.STR), new Col("duration", Kind.INT), new Col("userId", Kind.STR),
            new Col("rrule", Kind.STR), new Col("backgroundColor", Kind.STR), new Col("borderColor", Kind.STR),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> EXTENDED_PROPS = List.of(
            new Col("id", Kind.STR), new Col("plannerType", Kind.STR), new Col("eventType", Kind.STR),
            new Col("completedStartTime", Kind.STR), new Col("completedEndTime", Kind.STR),
            new Col("parentId", Kind.STR), new Col("trespassingStart", Kind.BOOL),
            new Col("trespassingEnd", Kind.BOOL), new Col("eventId", Kind.STR));

    private static final List<Col> TEMPLATES = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("startDay", Kind.STR),
            new Col("startTime", Kind.STR), new Col("userId", Kind.STR), new Col("duration", Kind.INT),
            new Col("color", Kind.STR), new Col("locationId", Kind.STR),
            new Col("recurrenceExceptions", Kind.STR), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> CATEGORIES = List.of(
            new Col("id", Kind.STR), new Col("name", Kind.STR), new Col("icon", Kind.STR),
            new Col("color", Kind.STR), new Col("sortOrder", Kind.INT), new Col("useTimeWindows", Kind.BOOL),
            new Col("isStrict", Kind.BOOL), new Col("confineToOwnWindows", Kind.BOOL),
            new Col("locationId", Kind.STR), new Col("parentId", Kind.STR), new Col("userId", Kind.STR),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> TIME_WINDOWS = List.of(
            new Col("id", Kind.STR), new Col("day", Kind.INT), new Col("startTime", Kind.STR),
            new Col("endTime", Kind.STR), new Col("recurrenceExceptions", Kind.STR),
            new Col("categoryId", Kind.STR), new Col("userId", Kind.STR));

    private static final List<Col> CATEGORY_EVENTS = List.of(
            new Col("id", Kind.STR), new Col("start", Kind.STR), new Col("end", Kind.STR),
            new Col("trespassingStart", Kind.BOOL), new Col("trespassingEnd", Kind.BOOL),
            new Col("categoryTimeWindowId", Kind.STR), new Col("categoryId", Kind.STR),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> TRAVEL_EVENTS = List.of(
            new Col("id", Kind.STR), new Col("start", Kind.STR), new Col("end", Kind.STR),
            new Col("fromLocationId", Kind.STR), new Col("toLocationId", Kind.STR),
            new Col("travelMinutes", Kind.INT), new Col("requiredTravelMinutes", Kind.INT),
            new Col("insufficientTravel", Kind.BOOL), new Col("overconstrained", Kind.BOOL),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> ENGINE_MESSAGES = List.of(
            new Col("id", Kind.STR), new Col("type", Kind.STR), new Col("tone", Kind.STR),
            new Col("payload", Kind.JSON_BLOB), new Col("dismissed", Kind.BOOL), new Col("userId", Kind.STR),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> LOCATIONS = List.of(
            new Col("id", Kind.STR), new Col("name", Kind.STR), new Col("address", Kind.STR),
            new Col("placeId", Kind.STR), new Col("lat", Kind.FLOAT), new Col("lng", Kind.FLOAT),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> TRAVEL_TIMES = List.of(
            new Col("id", Kind.STR), new Col("fromLocationId", Kind.STR), new Col("toLocationId", Kind.STR),
            new Col("transportMode", Kind.STR), new Col("googleRushHourMinutes", Kind.INT),
            new Col("googleRegularMinutes", Kind.INT), new Col("googleNightMinutes", Kind.INT),
            new Col("customRushHourMinutes", Kind.INT), new Col("customRegularMinutes", Kind.INT),
            new Col("customNightMinutes", Kind.INT), new Col("unroutableAt", Kind.TS),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> SCHEDULING_PREFERENCES = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("bufferTimeMinutes", Kind.INT),
            new Col("defaultTransportMode", Kind.STR), new Col("weekStartDay", Kind.INT),
            new Col("lastTravelRefreshAt", Kind.TS), new Col("lastTravelTopUpAt", Kind.TS),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> TASK_PREFERENCES = List.of(
            new Col("id", Kind.STR), new Col("plannerId", Kind.STR), new Col("taskType", Kind.STR),
            new Col("preferredDays", Kind.INT_ARRAY), new Col("preferredStartTime", Kind.STR),
            new Col("preferredEndTime", Kind.STR), new Col("avoidDays", Kind.INT_ARRAY),
            new Col("priority", Kind.STR), new Col("energyLevel", Kind.STR),
            new Col("allowFlexibility", Kind.BOOL));

    private static final List<Col> QUEUES = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("sortOrder", Kind.INT),
            new Col("color", Kind.STR), new Col("categoryId", Kind.STR), new Col("userId", Kind.STR),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> QUEUE_MEMBERS = List.of(
            new Col("id", Kind.STR), new Col("sortOrder", Kind.FLOAT), new Col("queueId", Kind.STR),
            new Col("plannerId", Kind.STR), new Col("userId", Kind.STR), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> DEPENDENCIES = List.of(
            new Col("id", Kind.STR), new Col("predecessorId", Kind.STR), new Col("successorId", Kind.STR),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> CONVERSATIONS = List.of(
            new Col("id", Kind.STR), new Col("title", Kind.STR), new Col("messages", Kind.JSON_BLOB),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> VIEW_STATE = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("graph", Kind.STR),
            new Col("mindmap", Kind.STR), new Col("updatedAt", Kind.TS));

    private static final List<Col> EXTERNAL_SOURCES = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("kind", Kind.STR),
            new Col("url", Kind.STR), new Col("name", Kind.STR), new Col("color", Kind.STR),
            new Col("enabled", Kind.BOOL), new Col("mode", Kind.STR), new Col("modeExceptions", Kind.STR),
            new Col("locationId", Kind.STR), new Col("locationExceptions", Kind.STR),
            new Col("lastFetchedAt", Kind.TS), new Col("lastError", Kind.STR), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> EXTERNAL_EVENTS = List.of(
            new Col("id", Kind.STR), new Col("sourceId", Kind.STR), new Col("userId", Kind.STR),
            new Col("uid", Kind.STR), new Col("title", Kind.STR), new Col("start", Kind.STR),
            new Col("end", Kind.STR), new Col("allDay", Kind.BOOL));

    /** Connection state without the refresh token — the grant is a credential, not the user's data. */
    private static final List<Col> CALENDAR_CONNECTION = List.of(
            new Col("email", Kind.STR), new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> OCCURRENCE_COMPLETIONS = List.of(
            new Col("id", Kind.STR), new Col("plannerId", Kind.STR), new Col("userId", Kind.STR),
            new Col("occurrenceKey", Kind.STR), new Col("start", Kind.STR), new Col("end", Kind.STR),
            new Col("createdAt", Kind.TS));

    private static final List<Col> HABIT_BUCKETS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("name", Kind.STR),
            new Col("color", Kind.STR), new Col("sortOrder", Kind.INT), new Col("createdAt", Kind.TS),
            new Col("updatedAt", Kind.TS));

    private static final List<Col> HABITS = List.of(
            new Col("id", Kind.STR), new Col("userId", Kind.STR), new Col("name", Kind.STR),
            new Col("color", Kind.STR), new Col("bucketId", Kind.STR), new Col("sortOrder", Kind.INT),
            new Col("createdAt", Kind.TS), new Col("updatedAt", Kind.TS));

    private static final List<Col> HABIT_ITEMS = List.of(
            new Col("id", Kind.STR), new Col("habitId", Kind.STR), new Col("plannerId", Kind.STR),
            new Col("userId", Kind.STR), new Col("createdAt", Kind.TS));

    /** The whole export, sections in the retired action's key order. */
    @Transactional(readOnly = true)
    public ObjectNode export(String userId) {
        ObjectNode root = JSON.createObjectNode();

        ObjectNode meta = root.putObject("meta");
        meta.put("exportedAt", ISO_MILLIS.format(clock.instant().atOffset(ZoneOffset.UTC)));
        meta.put("format", FORMAT);
        meta.put("note", "Your personal data held by Circadium. Credentials (passwords, access tokens) "
                + "are intentionally excluded.");

        root.set("profile", single("users", PROFILE, "\"id\" = ?", userId));
        root.set("linkedSignIns", list("accounts", LINKED_SIGN_INS, "\"user_id\" = ?",
                "\"provider_account_id\"", userId));
        root.set("planners", owned("Planners", PLANNERS, userId));
        root.set("calendarEvents", calendarEvents(userId));
        root.set("weeklyTemplates", owned("EventTemplates", TEMPLATES, userId));
        root.set("categories", categories(userId));
        root.set("categoryEvents", owned("CategoryEvents", CATEGORY_EVENTS, userId));
        root.set("travelEvents", owned("TravelEvents", TRAVEL_EVENTS, userId));
        root.set("engineMessages", owned("EngineMessages", ENGINE_MESSAGES, userId));
        root.set("locations", owned("Locations", LOCATIONS, userId));
        root.set("travelTimes", owned("TravelTimes", TRAVEL_TIMES, userId));
        root.set("schedulingPreferences", single("UserSchedulingPreferences", SCHEDULING_PREFERENCES,
                "\"userId\" = ?", userId));
        root.set("taskPreferences", list("TaskPreferences t JOIN \"Planners\" p ON p.\"id\" = t.\"plannerId\"",
                TASK_PREFERENCES.stream().map(c -> new Col(c.key(), c.kind(), "t.\"" + c.column() + '"')).toList(),
                "p.\"userId\" = ?", "t.\"id\"", userId));
        root.set("queues", queues(userId));
        root.set("dependencies", owned("PlannerDependencies", DEPENDENCIES, userId));
        root.set("aiConversations", owned("DraftConversations", CONVERSATIONS, userId));
        root.set("viewState", single("UserViewStates", VIEW_STATE, "\"userId\" = ?", userId));
        root.set("externalCalendarSources", owned("ExternalCalendarSources", EXTERNAL_SOURCES, userId));
        root.set("externalCalendarEvents", owned("ExternalEvents", EXTERNAL_EVENTS, userId));
        root.set("googleCalendarConnection", single("GoogleCalendarConnections", CALENDAR_CONNECTION,
                "\"userId\" = ?", userId));
        root.set("microsoftCalendarConnection", single("MicrosoftCalendarConnections", CALENDAR_CONNECTION,
                "\"userId\" = ?", userId));
        root.set("occurrenceCompletions", owned("HabitCompletions", OCCURRENCE_COMPLETIONS, userId));
        root.set("habitBuckets", owned("HabitBuckets", HABIT_BUCKETS, userId));
        root.set("habits", owned("Habits", HABITS, userId));
        root.set("habitItems", owned("HabitItems", HABIT_ITEMS, userId));

        return root;
    }

    private JsonNode calendarEvents(String userId) {
        Map<String, ObjectNode> propsByEventId = index(
                list("EventExtendedProps x JOIN \"SimpleEvents\" e ON e.\"id\" = x.\"eventId\"",
                        EXTENDED_PROPS.stream().map(c -> new Col(c.key(), c.kind(), "x.\"" + c.column() + '"')).toList(),
                        "e.\"userId\" = ?", "x.\"id\"", userId),
                node -> node.get("eventId").stringValue());
        ArrayNode events = owned("SimpleEvents", SIMPLE_EVENTS, userId);
        for (JsonNode event : events) {
            ObjectNode row = (ObjectNode) event;
            ObjectNode props = propsByEventId.get(row.get("id").stringValue());
            if (props == null) {
                row.putNull("extendedProps");
            } else {
                row.set("extendedProps", props);
            }
        }
        return events;
    }

    private JsonNode categories(String userId) {
        Map<String, ArrayNode> windowsByCategory = group(owned("CategoryTimeWindows", TIME_WINDOWS, userId),
                node -> node.get("categoryId").isNull() ? null : node.get("categoryId").stringValue());
        ArrayNode categories = owned("Categories", CATEGORIES, userId);
        for (JsonNode category : categories) {
            ObjectNode row = (ObjectNode) category;
            ArrayNode windows = windowsByCategory.get(row.get("id").stringValue());
            // The TS export reached windows only through their category, so an unassigned draft
            // window (categoryId null) is not exported — kept for parity.
            row.set("timeSlots", windows == null ? JSON.createArrayNode() : windows);
        }
        return categories;
    }

    private JsonNode queues(String userId) {
        Map<String, ArrayNode> membersByQueue = group(owned("QueueMembers", QUEUE_MEMBERS, userId),
                node -> node.get("queueId").stringValue());
        ArrayNode queues = owned("Queues", QUEUES, userId);
        for (JsonNode queue : queues) {
            ObjectNode row = (ObjectNode) queue;
            ArrayNode members = membersByQueue.get(row.get("id").stringValue());
            row.set("members", members == null ? JSON.createArrayNode() : members);
        }
        return queues;
    }

    private ArrayNode owned(String table, List<Col> cols, String userId) {
        return list(table, cols, "\"userId\" = ?", "\"id\"", userId);
    }

    private ArrayNode list(String from, List<Col> cols, String where, String orderBy, Object... params) {
        String sql = "SELECT " + String.join(", ", cols.stream().map(DataExportService::selected).toList())
                + " FROM " + quoteFrom(from) + " WHERE " + where + " ORDER BY " + orderBy;
        List<ObjectNode> rows = jdbcTemplate.query(sql, (rs, i) -> row(rs, cols), params);
        ArrayNode array = JSON.createArrayNode();
        rows.forEach(array::add);
        return array;
    }

    private JsonNode single(String from, List<Col> cols, String where, Object... params) {
        ArrayNode rows = list(from, cols, where, "1", params);
        return rows.isEmpty() ? tools.jackson.databind.node.NullNode.getInstance() : rows.get(0);
    }

    private static String selected(Col col) {
        return col.column().contains("\"") ? col.column() : '"' + col.column() + '"';
    }

    /** A joined FROM clause arrives pre-quoted (it contains spaces); a bare table name is quoted here. */
    private static String quoteFrom(String from) {
        return from.contains(" ") ? '"' + from.replaceFirst(" ", "\" ") : '"' + from + '"';
    }

    private static ObjectNode row(ResultSet rs, List<Col> cols) throws SQLException {
        ObjectNode node = JSON.createObjectNode();
        for (int i = 0; i < cols.size(); i++) {
            Col col = cols.get(i);
            int index = i + 1;
            switch (col.kind()) {
                case STR -> node.put(col.key(), rs.getString(index));
                case INT -> put(node, col.key(), rs.getObject(index, Integer.class));
                case FLOAT -> put(node, col.key(), rs.getObject(index, Double.class));
                case BOOL -> put(node, col.key(), rs.getObject(index, Boolean.class));
                case TS -> {
                    LocalDateTime value = rs.getObject(index, LocalDateTime.class);
                    node.put(col.key(), value == null ? null : ISO_MILLIS.format(value));
                }
                case JSON_BLOB -> {
                    String value = rs.getString(index);
                    if (value == null) {
                        node.putNull(col.key());
                    } else {
                        node.set(col.key(), JSON.readTree(value));
                    }
                }
                case INT_ARRAY -> {
                    java.sql.Array value = rs.getArray(index);
                    ArrayNode array = JSON.createArrayNode();
                    if (value != null) {
                        for (Object element : (Object[]) value.getArray()) {
                            array.add((Integer) element);
                        }
                    }
                    node.set(col.key(), array);
                }
            }
        }
        return node;
    }

    private static void put(ObjectNode node, String key, Integer value) {
        if (value == null) {
            node.putNull(key);
        } else {
            node.put(key, value);
        }
    }

    private static void put(ObjectNode node, String key, Double value) {
        if (value == null) {
            node.putNull(key);
        } else {
            node.put(key, value);
        }
    }

    private static void put(ObjectNode node, String key, Boolean value) {
        if (value == null) {
            node.putNull(key);
        } else {
            node.put(key, value);
        }
    }

    private static Map<String, ObjectNode> index(ArrayNode rows, Function<ObjectNode, String> key) {
        Map<String, ObjectNode> byKey = new java.util.HashMap<>();
        for (JsonNode row : rows) {
            byKey.put(key.apply((ObjectNode) row), (ObjectNode) row);
        }
        return byKey;
    }

    private static Map<String, ArrayNode> group(ArrayNode rows, Function<ObjectNode, String> key) {
        Map<String, ArrayNode> byKey = new java.util.HashMap<>();
        for (JsonNode row : rows) {
            String groupKey = key.apply((ObjectNode) row);
            if (groupKey == null) {
                continue;
            }
            byKey.computeIfAbsent(groupKey, k -> JSON.createArrayNode()).add(row);
        }
        return byKey;
    }
}
