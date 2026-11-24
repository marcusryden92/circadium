package app.circadium.external;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The occurrence-to-row finisher every import path shares (ICS, Google, Microsoft Graph): the
 * RFC 5545 end default (date-only events span one day, a timed event without an end is
 * zero-length and dropped by the {@code end > start} guard), the expansion-window overlap filter,
 * the deterministic id, last-wins dedupe per id, and a chronological sort.
 */
public final class ImportedCalendarEvents {

    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private ImportedCalendarEvents() {
    }

    /** One candidate occurrence as a provider mapper sees it; {@code end} may be null. */
    public record Occurrence(String uid, String title, Instant start, Instant end, boolean allDay) {
    }

    public static String isoMillis(Instant instant) {
        return ISO_MILLIS.format(instant);
    }

    public static List<ImportedCalendarEvent> materialize(List<Occurrence> occurrences, String sourceId,
            String userId, Instant windowStart, Instant windowEnd) {
        Map<String, ImportedCalendarEvent> byId = new LinkedHashMap<>();
        for (Occurrence occurrence : occurrences) {
            Instant start = occurrence.start();
            if (start == null) {
                continue;
            }
            Instant end = occurrence.end();
            if (end == null) {
                end = occurrence.allDay() ? start.plus(24, ChronoUnit.HOURS) : start;
            }
            if (!end.isAfter(start)) {
                continue;
            }
            if (!start.isBefore(windowEnd) || !end.isAfter(windowStart)) {
                continue;
            }
            String startIso = isoMillis(start);
            String id = sourceId + "|" + occurrence.uid() + "|" + startIso;
            byId.put(id, new ImportedCalendarEvent(id, sourceId, userId, occurrence.uid(), occurrence.title(),
                    startIso, isoMillis(end), occurrence.allDay()));
        }
        return byId.values().stream()
                .sorted(Comparator.comparing(ImportedCalendarEvent::start))
                .toList();
    }
}
