package app.circadium.external.microsoftgraph;

import static org.assertj.core.api.Assertions.assertThat;

import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.microsoftgraph.GraphEventMapper.ApiEvent;
import app.circadium.external.microsoftgraph.GraphEventMapper.ApiTime;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The web's mapGraphEventsToExternalEvents test cases, ported verbatim. */
class GraphEventMapperTest {

    private static final String SOURCE_ID = "src-1";
    private static final String USER_ID = "user-1";
    private static final Instant WINDOW_START = Instant.parse("2026-07-01T00:00:00.000Z");
    private static final Instant WINDOW_END = Instant.parse("2026-09-01T00:00:00.000Z");

    private static List<ImportedCalendarEvent> map(List<ApiEvent> items) {
        return GraphEventMapper.map(items, SOURCE_ID, USER_ID, WINDOW_START, WINDOW_END);
    }

    @Test
    void mapsATimedEventParsingGraphsOffsetlessUtcDatetime() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("abc123", "Standup", null, null,
                null, new ApiTime("2026-07-10T07:00:00.0000000", "UTC"),
                new ApiTime("2026-07-10T07:30:00.0000000", "UTC"))));

        assertThat(events).containsExactly(new ImportedCalendarEvent(
                "src-1|abc123|2026-07-10T07:00:00.000Z", "src-1", "user-1", "abc123", "Standup",
                "2026-07-10T07:00:00.000Z", "2026-07-10T07:30:00.000Z", false));
    }

    @Test
    void usesTheSeriesMasterIdAsUidForRecurringInstances() {
        List<ImportedCalendarEvent> events = map(List.of(
                new ApiEvent("occ1", "Weekly", null, null, "series1",
                        new ApiTime("2026-07-10T07:00:00.0000000", "UTC"),
                        new ApiTime("2026-07-10T08:00:00.0000000", "UTC")),
                new ApiEvent("occ2", "Weekly", null, null, "series1",
                        new ApiTime("2026-07-17T07:00:00.0000000", "UTC"),
                        new ApiTime("2026-07-17T08:00:00.0000000", "UTC"))));

        assertThat(events).extracting(ImportedCalendarEvent::uid).containsExactly("series1", "series1");
        assertThat(events).extracting(ImportedCalendarEvent::id).doesNotHaveDuplicates();
    }

    @Test
    void marksIsAllDayEventsAllDayWithTheExclusiveEndHonored() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("allday1", "Conference", null, true,
                null, new ApiTime("2026-07-20T00:00:00.0000000", "UTC"),
                new ApiTime("2026-07-22T00:00:00.0000000", "UTC"))));

        assertThat(events.getFirst().allDay()).isTrue();
        assertThat(events.getFirst().start()).isEqualTo("2026-07-20T00:00:00.000Z");
        assertThat(events.getFirst().end()).isEqualTo("2026-07-22T00:00:00.000Z");
    }

    @Test
    void titlesSubjectLessEventsBusy() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("private1", null, null, null, null,
                new ApiTime("2026-07-10T07:00:00.0000000", "UTC"),
                new ApiTime("2026-07-10T08:00:00.0000000", "UTC"))));

        assertThat(events.getFirst().title()).isEqualTo("Busy");
    }

    @Test
    void parsesExplicitOffsetDatetimesUnchanged() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("offset1", "Offset", null, null,
                null, new ApiTime("2026-07-10T09:00:00+02:00", null),
                new ApiTime("2026-07-10T09:30:00+02:00", null))));

        assertThat(events.getFirst().start()).isEqualTo("2026-07-10T07:00:00.000Z");
        assertThat(events.getFirst().end()).isEqualTo("2026-07-10T07:30:00.000Z");
    }

    @Test
    void skipsCancelledOutOfWindowAndZeroLengthItems() {
        List<ImportedCalendarEvent> events = map(List.of(
                new ApiEvent("cancelled1", null, true, null, null,
                        new ApiTime("2026-07-10T07:00:00.0000000", "UTC"),
                        new ApiTime("2026-07-10T08:00:00.0000000", "UTC")),
                new ApiEvent("past1", "Too early", null, null, null,
                        new ApiTime("2026-06-01T07:00:00.0000000", "UTC"),
                        new ApiTime("2026-06-01T08:00:00.0000000", "UTC")),
                new ApiEvent("zero1", "Instantaneous", null, null, null,
                        new ApiTime("2026-07-10T07:00:00.0000000", "UTC"),
                        new ApiTime("2026-07-10T07:00:00.0000000", "UTC")),
                new ApiEvent("keep1", "Kept", null, null, null,
                        new ApiTime("2026-07-10T09:00:00.0000000", "UTC"),
                        new ApiTime("2026-07-10T10:00:00.0000000", "UTC"))));

        assertThat(events).extracting(ImportedCalendarEvent::uid).containsExactly("keep1");
    }
}
