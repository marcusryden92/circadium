package app.circadium.external.ics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.circadium.external.ImportedCalendarEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The web's parseIcsFeed test cases, ported verbatim: they pin the mapping semantics the
 * imported rows (and their deterministic ids) depend on.
 */
class IcsParserTest {

    private static final String SOURCE_ID = "src-1";
    private static final String USER_ID = "user-1";
    private static final Instant WINDOW_START = Instant.parse("2026-07-01T00:00:00Z");
    private static final Instant WINDOW_END = Instant.parse("2026-09-01T00:00:00Z");

    private static IcsParser.Result parse(String... lines) {
        StringBuilder ics = new StringBuilder("BEGIN:VCALENDAR\r\nPRODID:-//Test//EN\r\nVERSION:2.0\r\n");
        for (String line : lines) {
            ics.append(line).append("\r\n");
        }
        ics.append("END:VCALENDAR\r\n");
        return IcsParser.parse(ics.toString(), SOURCE_ID, USER_ID, WINDOW_START, WINDOW_END);
    }

    @Test
    void parsesASingleUtcEventWithDeterministicId() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:single-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "SUMMARY:Dentist",
                "END:VEVENT").events();

        assertThat(events).hasSize(1);
        ImportedCalendarEvent event = events.getFirst();
        assertThat(event.start()).isEqualTo("2026-07-10T12:00:00.000Z");
        assertThat(event.end()).isEqualTo("2026-07-10T13:00:00.000Z");
        assertThat(event.title()).isEqualTo("Dentist");
        assertThat(event.uid()).isEqualTo("single-1");
        assertThat(event.allDay()).isFalse();
        assertThat(event.id()).isEqualTo("src-1|single-1|2026-07-10T12:00:00.000Z");
        assertThat(event.sourceId()).isEqualTo(SOURCE_ID);
        assertThat(event.userId()).isEqualTo(USER_ID);
    }

    @Test
    void expandsATzidWeeklyRuleWithExdateAndAMovedRecurrenceIdOverride() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:weekly-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART;TZID=Europe/Stockholm:20260706T090000",
                "DTEND;TZID=Europe/Stockholm:20260706T100000",
                "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4",
                "EXDATE;TZID=Europe/Stockholm:20260713T090000",
                "SUMMARY:Standup",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:weekly-1",
                "RECURRENCE-ID;TZID=Europe/Stockholm:20260720T090000",
                "DTSTAMP:20260701T000000Z",
                "DTSTART;TZID=Europe/Stockholm:20260720T140000",
                "DTEND;TZID=Europe/Stockholm:20260720T150000",
                "SUMMARY:Standup (moved)",
                "END:VEVENT").events();

        // COUNT=4 minus one EXDATE, with the third occurrence moved.
        List<String> starts = events.stream().map(ImportedCalendarEvent::start).toList();
        assertThat(starts).contains("2026-07-06T07:00:00.000Z");
        assertThat(starts).doesNotContain("2026-07-13T07:00:00.000Z");
        assertThat(starts).contains("2026-07-27T07:00:00.000Z");

        ImportedCalendarEvent moved = events.stream()
                .filter(event -> event.title().equals("Standup (moved)"))
                .findFirst()
                .orElseThrow();
        assertThat(moved.start()).isEqualTo("2026-07-20T12:00:00.000Z");
        assertThat(moved.end()).isEqualTo("2026-07-20T13:00:00.000Z");
        assertThat(events).hasSize(3);
    }

    @Test
    void marksDateOnlyEventsAllDayWithAOneDayDefaultSpan() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:allday-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART;VALUE=DATE:20260715",
                "SUMMARY:Holiday",
                "END:VEVENT").events();

        assertThat(events).hasSize(1);
        assertThat(events.getFirst().allDay()).isTrue();
        Duration span = Duration.between(Instant.parse(events.getFirst().start()),
                Instant.parse(events.getFirst().end()));
        assertThat(span).isEqualTo(Duration.ofHours(24));
    }

    @Test
    void skipsCancelledEventsAndEventsOutsideTheWindow() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:cancelled-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "STATUS:CANCELLED",
                "SUMMARY:Cancelled thing",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:far-future",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20261225T120000Z",
                "DTEND:20261225T130000Z",
                "SUMMARY:Christmas thing",
                "END:VEVENT").events();

        assertThat(events).isEmpty();
    }

    @Test
    void extractsTheCalendarDisplayName() {
        IcsParser.Result result = parse(
                "X-WR-CALNAME:Team calendar",
                "BEGIN:VEVENT",
                "UID:single-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "SUMMARY:Dentist",
                "END:VEVENT");

        assertThat(result.calendarName()).isEqualTo("Team calendar");
    }

    @Test
    void aMalformedRulePoisonsOnlyItsOwnEvent() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:broken-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "RRULE:FREQ=NONSENSE",
                "SUMMARY:Broken",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:fine-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260711T120000Z",
                "DTEND:20260711T130000Z",
                "SUMMARY:Fine",
                "END:VEVENT").events();

        assertThat(events).extracting(ImportedCalendarEvent::uid).containsExactly("fine-1");
    }

    @Test
    void anRdateOnlyEventEmitsJustItsDtstartOccurrence() {
        // The retired node-ical port expanded RRULEs only; RDATE without a rule fell through to
        // the single-occurrence path.
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:rdate-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "RDATE:20260715T120000Z,20260716T120000Z",
                "SUMMARY:Rdate only",
                "END:VEVENT").events();

        assertThat(events).extracting(ImportedCalendarEvent::start)
                .containsExactly("2026-07-10T12:00:00.000Z");
    }

    @Test
    void rdatesNeverContributeToARuleExpansion() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:rule-rdate-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260706T120000Z",
                "DTEND:20260706T130000Z",
                "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2",
                "RDATE:20260716T120000Z",
                "SUMMARY:Rule with rdate",
                "END:VEVENT").events();

        assertThat(events).extracting(ImportedCalendarEvent::start)
                .containsExactly("2026-07-06T12:00:00.000Z", "2026-07-13T12:00:00.000Z");
    }

    @Test
    void aCancelledBaseSeriesDropsItsOverridesToo() {
        // node-ical nests overrides inside the base event, so skipping a cancelled base dropped
        // the whole series, live overrides included.
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:cancelled-series-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260706T120000Z",
                "DTEND:20260706T130000Z",
                "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2",
                "STATUS:CANCELLED",
                "SUMMARY:Cancelled series",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:cancelled-series-1",
                "RECURRENCE-ID:20260713T120000Z",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260713T140000Z",
                "DTEND:20260713T150000Z",
                "SUMMARY:Live override",
                "END:VEVENT").events();

        assertThat(events).isEmpty();
    }

    @Test
    void anOverrideOfANonRecurringBaseIsIgnored() {
        // Expansion (and with it override handling) ran only for rrule events in the TS; a
        // non-recurring base emits unchanged whatever its overrides say.
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:plain-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "SUMMARY:Plain",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:plain-1",
                "RECURRENCE-ID:20260710T120000Z",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T140000Z",
                "DTEND:20260710T150000Z",
                "STATUS:CANCELLED",
                "SUMMARY:Pointless override",
                "END:VEVENT").events();

        assertThat(events).hasSize(1);
        assertThat(events.getFirst().start()).isEqualTo("2026-07-10T12:00:00.000Z");
        assertThat(events.getFirst().title()).isEqualTo("Plain");
    }

    @Test
    void aCancelledOverrideVacatesItsOccurrence() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:vacated-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260706T120000Z",
                "DTEND:20260706T130000Z",
                "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2",
                "SUMMARY:Series",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:vacated-1",
                "RECURRENCE-ID:20260713T120000Z",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260713T120000Z",
                "DTEND:20260713T130000Z",
                "STATUS:CANCELLED",
                "SUMMARY:Series",
                "END:VEVENT").events();

        assertThat(events).extracting(ImportedCalendarEvent::start)
                .containsExactly("2026-07-06T12:00:00.000Z");
    }

    @Test
    void anOverrideOffTheRuleGridIsIgnored() {
        // node-ical consulted overrides per expanded rule date; a RECURRENCE-ID matching no
        // enumerated occurrence never surfaced.
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:offgrid-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260706T120000Z",
                "DTEND:20260706T130000Z",
                "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2",
                "SUMMARY:Series",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:offgrid-1",
                "RECURRENCE-ID:20260709T120000Z",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260709T140000Z",
                "DTEND:20260709T150000Z",
                "SUMMARY:Off the grid",
                "END:VEVENT").events();

        assertThat(events).extracting(ImportedCalendarEvent::start)
                .containsExactly("2026-07-06T12:00:00.000Z", "2026-07-13T12:00:00.000Z");
        assertThat(events).extracting(ImportedCalendarEvent::title)
                .doesNotContain("Off the grid");
    }

    @Test
    void anEmptySummaryStaysEmptyAndAMissingOneFallsBack() {
        List<ImportedCalendarEvent> events = parse(
                "BEGIN:VEVENT",
                "UID:empty-summary-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260710T120000Z",
                "DTEND:20260710T130000Z",
                "SUMMARY:",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:no-summary-1",
                "DTSTAMP:20260701T000000Z",
                "DTSTART:20260711T120000Z",
                "DTEND:20260711T130000Z",
                "END:VEVENT").events();

        assertThat(events).hasSize(2);
        assertThat(events.getFirst().title()).isEmpty();
        assertThat(events.getLast().title()).isEqualTo("Untitled event");
    }

    @Test
    void garbageTextIsRefusedAsNotAFeed() {
        assertThatThrownBy(() -> IcsParser.parse("not even close", SOURCE_ID, USER_ID, WINDOW_START,
                WINDOW_END))
                .isInstanceOf(IcsFeedException.class)
                .hasMessage("The URL did not return an ICS calendar feed");
    }
}
