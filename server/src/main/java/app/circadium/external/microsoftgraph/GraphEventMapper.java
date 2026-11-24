package app.circadium.external.microsoftgraph;

import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.ImportedCalendarEvents;
import app.circadium.external.ImportedCalendarEvents.Occurrence;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Maps Graph calendarView instances to ExternalEvents rows: the uid is the series master id for
 * recurring instances (so one per-event exception covers the whole series, like an ICS UID),
 * cancelled and out-of-window instances are skipped, and private or subject-less events render
 * as "Busy".
 */
public final class GraphEventMapper {

    // Graph returns "2026-07-28T10:00:00.0000000" — no offset, 7 fraction digits. Requests carry
    // Prefer: outlook.timezone="UTC", so an offset-less value is a UTC instant.
    private static final Pattern OFFSETLESS =
            Pattern.compile("^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(?:\\.(\\d+))?$");

    private GraphEventMapper() {
    }

    /** The raw shape of one item from calendarView (occurrences pre-expanded). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiEvent(String id, String subject, Boolean isCancelled, Boolean isAllDay,
            String seriesMasterId, ApiTime start, ApiTime end) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiTime(String dateTime, String timeZone) {
    }

    public static List<ImportedCalendarEvent> map(List<ApiEvent> items, String sourceId, String userId,
            Instant windowStart, Instant windowEnd) {
        List<Occurrence> occurrences = new ArrayList<>();
        for (ApiEvent item : items) {
            if (item == null || item.id() == null || item.id().isEmpty()
                    || Boolean.TRUE.equals(item.isCancelled())) {
                continue;
            }
            boolean allDay = Boolean.TRUE.equals(item.isAllDay());
            Instant start = parse(item.start() == null ? null : item.start().dateTime());
            if (start == null) {
                continue;
            }
            String uid = item.seriesMasterId() != null ? item.seriesMasterId() : item.id();
            String title = item.subject() == null || item.subject().isEmpty() ? "Busy" : item.subject();
            Instant end = parse(item.end() == null ? null : item.end().dateTime());
            occurrences.add(new Occurrence(uid, title, start, end, allDay));
        }
        return ImportedCalendarEvents.materialize(occurrences, sourceId, userId, windowStart, windowEnd);
    }

    static Instant parse(String value) {
        if (value == null) {
            return null;
        }
        try {
            Matcher offsetless = OFFSETLESS.matcher(value);
            if (offsetless.matches()) {
                return LocalDateTime.parse(offsetless.group(1)).toInstant(ZoneOffset.UTC)
                        .plusNanos(fractionNanos(offsetless.group(2)));
            }
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static long fractionNanos(String fraction) {
        if (fraction == null || fraction.isEmpty()) {
            return 0;
        }
        // The TS port kept only the three fraction digits Date parses reliably; ids must match.
        String millis = (fraction + "000").substring(0, 3);
        return Long.parseLong(millis) * 1_000_000L;
    }
}
