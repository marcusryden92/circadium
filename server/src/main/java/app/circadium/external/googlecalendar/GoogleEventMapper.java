package app.circadium.external.googlecalendar;

import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.ImportedCalendarEvents;
import app.circadium.external.ImportedCalendarEvents.Occurrence;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Maps Google event instances ({@code singleEvents=true}) to ExternalEvents rows: the uid is the
 * series id for recurring instances (so one per-event exception covers the whole series, like an
 * ICS UID), cancelled and out-of-window instances are skipped, and free/busy-only calendars omit
 * titles — those render as "Busy".
 */
public final class GoogleEventMapper {

    private GoogleEventMapper() {
    }

    /** The raw shape of one item from events.list with {@code singleEvents=true}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiEvent(String id, String status, String summary, String recurringEventId,
            ApiTime start, ApiTime end) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiTime(String dateTime, String date) {
    }

    public static List<ImportedCalendarEvent> map(List<ApiEvent> items, String sourceId, String userId,
            Instant windowStart, Instant windowEnd) {
        List<Occurrence> occurrences = new ArrayList<>();
        for (ApiEvent item : items) {
            if (item == null || item.id() == null || item.id().isEmpty()
                    || "cancelled".equals(item.status())) {
                continue;
            }
            boolean allDay = item.start() != null && item.start().date() != null;
            Instant start = parse(item.start());
            if (start == null) {
                continue;
            }
            String uid = item.recurringEventId() != null ? item.recurringEventId() : item.id();
            String title = item.summary() == null || item.summary().isEmpty() ? "Busy" : item.summary();
            occurrences.add(new Occurrence(uid, title, start, parse(item.end()), allDay));
        }
        return ImportedCalendarEvents.materialize(occurrences, sourceId, userId, windowStart, windowEnd);
    }

    private static Instant parse(ApiTime time) {
        if (time == null) {
            return null;
        }
        try {
            if (time.dateTime() != null) {
                return OffsetDateTime.parse(time.dateTime()).toInstant();
            }
            if (time.date() != null) {
                return LocalDate.parse(time.date()).atStartOfDay(ZoneOffset.UTC).toInstant();
            }
        } catch (DateTimeParseException e) {
            return null;
        }
        return null;
    }
}
