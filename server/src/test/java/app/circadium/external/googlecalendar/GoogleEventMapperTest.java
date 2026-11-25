package app.circadium.external.googlecalendar;

import static org.assertj.core.api.Assertions.assertThat;

import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.googlecalendar.GoogleEventMapper.ApiEvent;
import app.circadium.external.googlecalendar.GoogleEventMapper.ApiTime;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The web's mapGoogleEventsToExternalEvents test cases, ported verbatim. */
class GoogleEventMapperTest {

    private static final String SOURCE_ID = "src-1";
    private static final String USER_ID = "user-1";
    private static final Instant WINDOW_START = Instant.parse("2026-07-01T00:00:00.000Z");
    private static final Instant WINDOW_END = Instant.parse("2026-09-01T00:00:00.000Z");

    private static List<ImportedCalendarEvent> map(List<ApiEvent> items) {
        return GoogleEventMapper.map(items, SOURCE_ID, USER_ID, WINDOW_START, WINDOW_END);
    }

    @Test
    void mapsATimedEventWithADeterministicId() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("abc123", "confirmed", "Standup",
                null, new ApiTime("2026-07-10T09:00:00+02:00", null),
                new ApiTime("2026-07-10T09:30:00+02:00", null))));

        assertThat(events).containsExactly(new ImportedCalendarEvent(
                "src-1|abc123|2026-07-10T07:00:00.000Z", "src-1", "user-1", "abc123", "Standup",
                "2026-07-10T07:00:00.000Z", "2026-07-10T07:30:00.000Z", false));
    }

    @Test
    void usesTheSeriesIdAsUidForRecurringInstances() {
        List<ImportedCalendarEvent> events = map(List.of(
                new ApiEvent("series1_20260710T070000Z", null, "Weekly", "series1",
                        new ApiTime("2026-07-10T07:00:00Z", null), new ApiTime("2026-07-10T08:00:00Z", null)),
                new ApiEvent("series1_20260717T070000Z", null, "Weekly", "series1",
                        new ApiTime("2026-07-17T07:00:00Z", null),
                        new ApiTime("2026-07-17T08:00:00Z", null))));

        assertThat(events).extracting(ImportedCalendarEvent::uid).containsExactly("series1", "series1");
        assertThat(events).extracting(ImportedCalendarEvent::id).doesNotHaveDuplicates();
    }

    @Test
    void marksDateOnlyEventsAllDayWithTheExclusiveEndHonored() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("allday1", null, "Conference", null,
                new ApiTime(null, "2026-07-20"), new ApiTime(null, "2026-07-22"))));

        assertThat(events.getFirst().allDay()).isTrue();
        assertThat(events.getFirst().start()).isEqualTo("2026-07-20T00:00:00.000Z");
        assertThat(events.getFirst().end()).isEqualTo("2026-07-22T00:00:00.000Z");
    }

    @Test
    void titlesSummaryLessEventsBusy() {
        List<ImportedCalendarEvent> events = map(List.of(new ApiEvent("fb1", null, null, null,
                new ApiTime("2026-07-10T07:00:00Z", null), new ApiTime("2026-07-10T08:00:00Z", null))));

        assertThat(events.getFirst().title()).isEqualTo("Busy");
    }

    @Test
    void skipsCancelledOutOfWindowAndZeroLengthItems() {
        List<ImportedCalendarEvent> events = map(List.of(
                new ApiEvent("cancelled1", "cancelled", null, null,
                        new ApiTime("2026-07-10T07:00:00Z", null), new ApiTime("2026-07-10T08:00:00Z", null)),
                new ApiEvent("past1", null, "Too early", null,
                        new ApiTime("2026-06-01T07:00:00Z", null), new ApiTime("2026-06-01T08:00:00Z", null)),
                new ApiEvent("zero1", null, "Instantaneous", null,
                        new ApiTime("2026-07-10T07:00:00Z", null), new ApiTime("2026-07-10T07:00:00Z", null)),
                new ApiEvent("keep1", null, "Kept", null,
                        new ApiTime("2026-07-10T09:00:00Z", null),
                        new ApiTime("2026-07-10T10:00:00Z", null))));

        assertThat(events).extracting(ImportedCalendarEvent::uid).containsExactly("keep1");
    }
}
