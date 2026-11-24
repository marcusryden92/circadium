package app.circadium.external.ics;

import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.ImportedCalendarEvents;
import app.circadium.external.ImportedCalendarEvents.Occurrence;
import java.io.StringReader;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.Temporal;
import java.time.temporal.TemporalAmount;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.fortuna.ical4j.data.CalendarBuilder;
import net.fortuna.ical4j.model.Calendar;
import net.fortuna.ical4j.model.Component;
import net.fortuna.ical4j.model.Period;
import net.fortuna.ical4j.model.Property;
import net.fortuna.ical4j.model.component.VEvent;
import net.fortuna.ical4j.model.property.DtEnd;
import net.fortuna.ical4j.model.property.DtStart;
import net.fortuna.ical4j.model.property.Duration;
import net.fortuna.ical4j.model.property.RecurrenceId;
import net.fortuna.ical4j.model.property.Status;
import net.fortuna.ical4j.model.property.Summary;
import net.fortuna.ical4j.model.property.Uid;

/**
 * The parseIcsFeed port: VEVENTs only, cancelled events skipped, recurrence rules expanded into
 * concrete occurrences inside the window with RECURRENCE-ID overrides and EXDATEs applied, a
 * malformed rule poisoning only its own event, and X-WR-CALNAME as the calendar-name fallback.
 */
public final class IcsParser {

    private IcsParser() {
    }

    public record Result(List<ImportedCalendarEvent> events, String calendarName) {
    }

    public static Result parse(String icsText, String sourceId, String userId, Instant windowStart,
            Instant windowEnd) {
        String calendarName;
        List<VEvent> components;
        try {
            Calendar calendar = new CalendarBuilder().build(new StringReader(icsText));
            calendarName = calendar.getProperty("X-WR-CALNAME")
                    .map(property -> ((Property) property).getValue())
                    .orElse(null);
            components = calendar.getComponents(Component.VEVENT);
        } catch (Exception e) {
            // ical4j refuses the whole feed over one bad component (a malformed RRULE, say),
            // where the retired node-ical port only lost that event. Salvage: re-parse each
            // VEVENT block against the feed's own header, dropping only the blocks that fail.
            Salvaged salvaged = salvage(icsText);
            if (salvaged == null) {
                throw new IcsFeedException("The URL did not return an ICS calendar feed");
            }
            calendarName = salvaged.calendarName();
            components = salvaged.events();
        }

        // RECURRENCE-ID components attach to their base series, node-ical style: they are only
        // consulted while an RRULE-bearing, non-cancelled base expands (replacing the matching
        // occurrence; a cancelled override vacates it), never emitted standalone. A cancelled
        // base therefore drops its whole series, overrides included, and an override of a
        // non-recurring base is ignored — the base occurrence is emitted unchanged.
        Map<String, Map<Instant, VEvent>> overridesByUid = new HashMap<>();
        for (VEvent event : components) {
            RecurrenceId<Temporal> recurrenceId = event.getRecurrenceId();
            if (recurrenceId == null) {
                continue;
            }
            String uid = uid(event);
            if (uid == null) {
                continue;
            }
            try {
                overridesByUid.computeIfAbsent(uid, key -> new HashMap<>())
                        .put(toInstant(recurrenceId.getDate()), event);
            } catch (RuntimeException e) {
                // A malformed override poisons only itself, never the feed.
            }
        }

        List<Occurrence> occurrences = new ArrayList<>();
        for (VEvent event : components) {
            if (event.getRecurrenceId() != null || isCancelled(event)) {
                continue;
            }
            String uid = uid(event);
            if (uid == null) {
                continue;
            }
            try {
                if (event.getProperty(Property.RRULE).isPresent()) {
                    // The retired node-ical port expanded the RRULE alone — RDATEs never
                    // contributed occurrences, so they must not reach calculateRecurrenceSet.
                    event.removeAll(Property.RDATE);
                    boolean allDay = isAllDay(event);
                    String title = title(event);
                    Map<Instant, VEvent> overrides = overridesByUid.getOrDefault(uid, Map.of());
                    Set<Period<Temporal>> periods =
                            event.calculateRecurrenceSet(new Period<>(windowStart, windowEnd));
                    for (Period<Temporal> period : periods) {
                        Instant start = toInstant(period.getStart());
                        VEvent override = overrides.get(start);
                        if (override == null) {
                            occurrences.add(
                                    new Occurrence(uid, title, start, toInstant(period.getEnd()), allDay));
                        } else if (!isCancelled(override)) {
                            singleOccurrence(override).ifPresent(occurrences::add);
                        }
                    }
                } else {
                    singleOccurrence(event).ifPresent(occurrences::add);
                }
            } catch (RuntimeException e) {
                // A malformed rule poisons only its own event, never the whole feed.
            }
        }

        return new Result(
                ImportedCalendarEvents.materialize(occurrences, sourceId, userId, windowStart, windowEnd),
                calendarName);
    }

    private record Salvaged(List<VEvent> events, String calendarName) {
    }

    /**
     * Splits the feed into its VEVENT blocks and parses each against the feed's own context
     * (calendar properties, VTIMEZONEs — everything outside the event blocks), so one broken
     * event cannot poison the rest. Null when the text holds no event blocks at all.
     */
    private static Salvaged salvage(String icsText) {
        List<String> contextLines = new ArrayList<>();
        List<List<String>> eventBlocks = new ArrayList<>();
        List<String> currentBlock = null;
        for (String line : icsText.split("\r?\n")) {
            if (currentBlock == null && line.startsWith("BEGIN:VEVENT")) {
                currentBlock = new ArrayList<>();
            }
            if (currentBlock != null) {
                currentBlock.add(line);
                if (line.startsWith("END:VEVENT")) {
                    eventBlocks.add(currentBlock);
                    currentBlock = null;
                }
                continue;
            }
            if (!line.startsWith("BEGIN:VCALENDAR") && !line.startsWith("END:VCALENDAR")) {
                contextLines.add(line);
            }
        }
        if (eventBlocks.isEmpty()) {
            return null;
        }

        String context = String.join("\r\n", contextLines);
        List<VEvent> events = new ArrayList<>();
        for (List<String> block : eventBlocks) {
            String single = "BEGIN:VCALENDAR\r\n" + context + "\r\n" + String.join("\r\n", block)
                    + "\r\nEND:VCALENDAR\r\n";
            try {
                Calendar calendar = new CalendarBuilder().build(new StringReader(single));
                events.addAll(calendar.getComponents(Component.VEVENT));
            } catch (Exception e) {
                // This block is the poison; the others still import.
            }
        }

        String calendarName = null;
        for (String line : contextLines) {
            if (line.startsWith("X-WR-CALNAME")) {
                int colon = line.indexOf(':');
                if (colon >= 0) {
                    calendarName = line.substring(colon + 1).trim();
                }
                break;
            }
        }
        return new Salvaged(events, calendarName);
    }

    private static Optional<Occurrence> singleOccurrence(VEvent event) {
        String uid = uid(event);
        DtStart<Temporal> dtStart = event.getDateTimeStart();
        if (uid == null || dtStart == null || dtStart.getDate() == null) {
            return Optional.empty();
        }
        Instant start = toInstant(dtStart.getDate());
        DtEnd<Temporal> dtEnd = event.getDateTimeEnd();
        Instant end;
        if (dtEnd != null && dtEnd.getDate() != null) {
            end = toInstant(dtEnd.getDate());
        } else {
            end = event.getProperty(Property.DURATION)
                    .map(property -> plus(start, ((Duration) property).getDuration()))
                    .orElse(null);
        }
        return Optional.of(new Occurrence(uid, title(event), start, end, isAllDay(event)));
    }

    private static Instant plus(Instant start, TemporalAmount duration) {
        // java.time.Duration adds to an Instant directly; a date-based ical4j duration (P1D, P2W)
        // needs calendar arithmetic, which an Instant cannot do on its own.
        if (duration instanceof java.time.Duration exact) {
            return start.plus(exact);
        }
        return ZonedDateTime.ofInstant(start, ZoneOffset.UTC).plus(duration).toInstant();
    }

    private static boolean isAllDay(VEvent event) {
        DtStart<Temporal> dtStart = event.getDateTimeStart();
        return dtStart != null && dtStart.getDate() instanceof LocalDate;
    }

    private static String title(VEvent event) {
        // An empty SUMMARY: stays "", like the TS summaryText — the "Untitled event" fallback
        // fired only for a missing summary.
        Summary summary = event.getSummary();
        return summary == null || summary.getValue() == null ? "Untitled event" : summary.getValue();
    }

    private static String uid(VEvent event) {
        return event.getUid().map(Uid::getValue).orElse(null);
    }

    private static boolean isCancelled(VEvent event) {
        Status status = event.getStatus();
        return status != null && Status.VALUE_CANCELLED.equals(status.getValue());
    }

    private static Instant toInstant(Temporal temporal) {
        if (temporal instanceof Instant instant) {
            return instant;
        }
        if (temporal instanceof ZonedDateTime zoned) {
            return zoned.toInstant();
        }
        if (temporal instanceof OffsetDateTime offset) {
            return offset.toInstant();
        }
        // Floating local times and date-only values resolve against UTC, the deployed server zone
        // (the node-ical port resolved them against the server's own zone).
        if (temporal instanceof LocalDateTime local) {
            return local.toInstant(ZoneOffset.UTC);
        }
        if (temporal instanceof LocalDate date) {
            return date.atStartOfDay(ZoneOffset.UTC).toInstant();
        }
        return Instant.from(temporal);
    }
}
