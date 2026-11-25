package app.circadium.calendar;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The per-event override columns on ExternalCalendarSources, both keyed by series-level provider
 * UID so an override survives a refresh. {@code modeExceptions} is a JSON string array of UIDs
 * whose busy/visual behavior flips the source default; {@code locationExceptions} is a JSON
 * record of UID to locationId-or-null, where a present key wins over the source default and a
 * null value is an explicit "Anywhere". Readers are lenient — malformed JSON reads as empty —
 * and writers collapse an empty collection to NULL.
 */
final class ExternalSourceExceptions {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private ExternalSourceExceptions() {
    }

    static List<String> parseModeExceptions(String raw) {
        List<String> uids = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return uids;
        }
        try {
            JsonNode parsed = JSON.readTree(raw);
            if (!parsed.isArray()) {
                return uids;
            }
            for (JsonNode entry : parsed) {
                if (entry.isString()) {
                    uids.add(entry.stringValue());
                }
            }
        } catch (RuntimeException e) {
            return uids;
        }
        return uids;
    }

    static String toggleModeException(String raw, String uid) {
        List<String> current = parseModeExceptions(raw);
        // Every copy goes, like the TS filter: a duplicated UID must clear in one toggle.
        if (!current.removeIf(uid::equals)) {
            current.add(uid);
        }
        return current.isEmpty() ? null : JSON.writeValueAsString(current);
    }

    static Map<String, String> parseLocationExceptions(String raw) {
        // Insertion-ordered, null values meaningful ("Anywhere"), like the TS object it replaces.
        Map<String, String> overrides = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) {
            return overrides;
        }
        try {
            JsonNode parsed = JSON.readTree(raw);
            if (!parsed.isObject()) {
                return overrides;
            }
            parsed.properties().forEach(entry -> {
                if (entry.getValue().isNull()) {
                    overrides.put(entry.getKey(), null);
                } else if (entry.getValue().isString()) {
                    overrides.put(entry.getKey(), entry.getValue().stringValue());
                }
            });
        } catch (RuntimeException e) {
            return overrides;
        }
        return overrides;
    }

    static String setLocationException(String raw, String uid, String locationId) {
        Map<String, String> current = parseLocationExceptions(raw);
        current.put(uid, locationId);
        return serializeLocationExceptions(current);
    }

    static String clearLocationException(String raw, String uid) {
        Map<String, String> current = parseLocationExceptions(raw);
        current.remove(uid);
        return serializeLocationExceptions(current);
    }

    private static String serializeLocationExceptions(Map<String, String> overrides) {
        if (overrides.isEmpty()) {
            return null;
        }
        ObjectNode node = JSON.createObjectNode();
        overrides.forEach((uid, locationId) -> {
            if (locationId == null) {
                node.putNull(uid);
            } else {
                node.put(uid, locationId);
            }
        });
        return JSON.writeValueAsString(node);
    }
}
