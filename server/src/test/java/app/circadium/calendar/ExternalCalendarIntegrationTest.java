package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.external.googlecalendar.FakeGoogleCalendarClient;
import app.circadium.external.googlecalendar.GoogleEventMapper;
import app.circadium.external.ics.FakeIcsFeedFetcher;
import app.circadium.external.ics.IcsFeedException;
import app.circadium.external.microsoftgraph.FakeMicrosoftGraphClient;
import app.circadium.external.microsoftgraph.GraphEventMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The external-calendar source endpoints against the retired actions' semantics: the add flow
 * (plain ICS, the Google sharing-link ladder, the no-orphan-row rule), the wholesale-replace
 * refresh with the error-with-body failure shape and the rotated Microsoft token, the partial
 * patch, the per-event busy and location overrides, cascade delete, and no {@code dataVersion}
 * movement anywhere.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, ExternalCalendarIntegrationTest.FrozenClock.class})
class ExternalCalendarIntegrationTest {

    private static final Instant FROZEN_NOW = Instant.parse("2026-11-24T12:00:00Z");
    /** Insert parameter for timestamp columns: UTC wall-clock, like every server-side write. */
    private static final LocalDateTime UTC_NOW = LocalDateTime.ofInstant(FROZEN_NOW, ZoneOffset.UTC);
    private static final String USER = "external-user";
    private static final String OTHER_USER = "external-other-user";

    private static final String FEED_URL = "https://example.com/team.ics";
    private static final String SIMPLE_FEED = """
            BEGIN:VCALENDAR\r
            PRODID:-//Test//EN\r
            VERSION:2.0\r
            X-WR-CALNAME:Team calendar\r
            BEGIN:VEVENT\r
            UID:single-1\r
            DTSTAMP:20261101T000000Z\r
            DTSTART:20261130T120000Z\r
            DTEND:20261130T130000Z\r
            SUMMARY:Dentist\r
            END:VEVENT\r
            END:VCALENDAR\r
            """;
    private static final String REPLACEMENT_FEED = """
            BEGIN:VCALENDAR\r
            PRODID:-//Test//EN\r
            VERSION:2.0\r
            BEGIN:VEVENT\r
            UID:replacement-1\r
            DTSTAMP:20261101T000000Z\r
            DTSTART:20261201T090000Z\r
            DTEND:20261201T100000Z\r
            SUMMARY:Standup\r
            END:VEVENT\r
            END:VCALENDAR\r
            """;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    FakeIcsFeedFetcher icsFeedFetcher;

    @Autowired
    FakeGoogleCalendarClient googleClient;

    @Autowired
    FakeMicrosoftGraphClient graphClient;

    @TestConfiguration(proxyBeanMethods = false)
    static class FrozenClock {

        @Bean
        @Primary
        Clock frozenClock() {
            return Clock.fixed(FROZEN_NOW, ZoneOffset.UTC);
        }
    }

    @BeforeEach
    void seed() {
        icsFeedFetcher.reset();
        googleClient.reset();
        graphClient.reset();
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 11)",
                USER, USER + "@example.test");
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 11)",
                OTHER_USER, OTHER_USER + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" IN (?, ?)", USER, OTHER_USER);
    }

    @Test
    void fetchReturnsOwnSourcesAndEvents() throws Exception {
        String sourceId = insertIcsSource(USER, FEED_URL, "Mine");
        insertEvent(sourceId, USER, "uid-1", "2026-11-30T12:00:00.000Z", "2026-11-30T13:00:00.000Z");
        String foreignSource = insertIcsSource(OTHER_USER, "https://example.com/other.ics", "Theirs");
        insertEvent(foreignSource, OTHER_USER, "uid-2", "2026-11-30T12:00:00.000Z",
                "2026-11-30T13:00:00.000Z");

        mockMvc.perform(get("/external-calendars").with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sources.length()").value(1))
                .andExpect(jsonPath("$.sources[0].name").value("Mine"))
                .andExpect(jsonPath("$.sources[0].kind").value("ICS"))
                .andExpect(jsonPath("$.events.length()").value(1))
                .andExpect(jsonPath("$.events[0].uid").value("uid-1"));
    }

    @Test
    void addingAFeedParsesBeforeWritingAndNamesFromTheCalendar() throws Exception {
        icsFeedFetcher.textByUrl.put(FEED_URL, SIMPLE_FEED);

        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"webcal://example.com/team.ics\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.kind").value("ICS"))
                .andExpect(jsonPath("$.source.url").value(FEED_URL))
                .andExpect(jsonPath("$.source.name").value("Team calendar"))
                .andExpect(jsonPath("$.source.enabled").value(true))
                .andExpect(jsonPath("$.source.mode").value("BUSY"))
                .andExpect(jsonPath("$.source.lastFetchedAt").isNotEmpty())
                .andExpect(jsonPath("$.events.length()").value(1))
                .andExpect(jsonPath("$.events[0].title").value("Dentist"));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT \"name\", \"kind\"::text AS kind FROM \"ExternalCalendarSources\""
                        + " WHERE \"userId\" = ?", USER);
        assertThat(row.get("name")).isEqualTo("Team calendar");
        assertThat(eventCountForUser(USER)).isEqualTo(1);
        assertThat(dataVersion(USER)).isEqualTo(11);
    }

    @Test
    void aBadFeedLeavesNoOrphanedSourceRow() throws Exception {
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"::\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_url"))
                .andExpect(jsonPath("$.detail").value("That doesn't look like a valid URL"));

        icsFeedFetcher.textByUrl.put("https://example.com/page", "<!doctype html><html>nope</html>");
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://example.com/page\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("feed_error"))
                .andExpect(jsonPath("$.detail").value(
                        "The URL returned a web page, not a calendar feed — look for a link ending"
                                + " in .ics (in Google Calendar: the “Secret address in iCal format”)"));

        icsFeedFetcher.textByUrl.put("https://example.com/plain", "just some text");
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://example.com/plain\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("The URL did not return an ICS calendar feed"));

        icsFeedFetcher.failureByUrl.put("https://example.com/missing.ics",
                new IcsFeedException("The feed responded with status 404"));
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://example.com/missing.ics\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("The feed responded with status 404"));

        assertThat(sourceCountForUser(USER)).isZero();
    }

    @Test
    void aSharingLinkWithoutAConnectionTriesThePublicFeedThenNamesTheFix() throws Exception {
        // cid=dXNlckBleGFtcGxlLmNvbQ -> user@example.com; its public feed is not reachable.
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":"
                                + " \"https://calendar.google.com/calendar/u/0?cid=dXNlckBleGFtcGxlLmNvbQ\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("feed_error"))
                .andExpect(jsonPath("$.detail").value(
                        "That's a Google Calendar sharing link, and this calendar isn't public."
                                + " Either connect your Google account under Connected calendars"
                                + " (works for calendars shared with you), or — for your own"
                                + " calendar — copy the “Secret address in iCal format”"
                                + " from Google Calendar's settings and paste that .ics link here."));

        // A public calendar resolves through its basic.ics feed and lands as an ICS source.
        String publicUrl =
                "https://calendar.google.com/calendar/ical/user%40example.com/public/basic.ics";
        icsFeedFetcher.textByUrl.put(publicUrl, SIMPLE_FEED);
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":"
                                + " \"https://calendar.google.com/calendar/u/0?cid=dXNlckBleGFtcGxlLmNvbQ\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.kind").value("ICS"))
                .andExpect(jsonPath("$.source.url").value(publicUrl));
    }

    @Test
    void aSharingLinkWithAConnectionResolvesThroughTheApi() throws Exception {
        insertGoogleConnection(USER, "google-refresh");
        googleClient.eventsByCalendarId.put("user@example.com", List.of(new GoogleEventMapper.ApiEvent(
                "api-event-1", null, "From the API", null,
                new GoogleEventMapper.ApiTime("2026-11-30T09:00:00Z", null),
                new GoogleEventMapper.ApiTime("2026-11-30T10:00:00Z", null))));
        googleClient.summaryByCalendarId.put("user@example.com", "Shared with me");

        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":"
                                + " \"https://calendar.google.com/calendar/u/0?cid=dXNlckBleGFtcGxlLmNvbQ\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.kind").value("GOOGLE"))
                .andExpect(jsonPath("$.source.url").value("user@example.com"))
                .andExpect(jsonPath("$.source.name").value("Shared with me"))
                .andExpect(jsonPath("$.events[0].title").value("From the API"));
    }

    @Test
    void aSharingLinkFallsFromTheApiToThePublicFeedAndThenFailsNamingBoth() throws Exception {
        insertGoogleConnection(USER, "google-refresh");
        // The connected account cannot read it (no canned calendar), and the public feed works.
        String publicUrl =
                "https://calendar.google.com/calendar/ical/user%40example.com/public/basic.ics";
        icsFeedFetcher.textByUrl.put(publicUrl, SIMPLE_FEED);
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":"
                                + " \"https://calendar.google.com/calendar/u/0?cid=dXNlckBleGFtcGxlLmNvbQ\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.kind").value("ICS"));

        // Neither path works: the message names both.
        jdbcTemplate.update("DELETE FROM \"ExternalCalendarSources\" WHERE \"userId\" = ?", USER);
        icsFeedFetcher.reset();
        mockMvc.perform(post("/external-calendars").with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":"
                                + " \"https://calendar.google.com/calendar/u/0?cid=dXNlckBleGFtcGxlLmNvbQ\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value(
                        "That's a Google Calendar sharing link, but neither your connected Google"
                                + " account nor the public feed can read that calendar. Ask the owner"
                                + " to share it with your Google account, or paste the calendar's"
                                + " “Secret address in iCal format”."));
    }

    @Test
    void refreshReplacesEventsWholesaleAndClearsLastError() throws Exception {
        icsFeedFetcher.textByUrl.put(FEED_URL, SIMPLE_FEED);
        String sourceId = insertIcsSource(USER, FEED_URL, "Team");
        jdbcTemplate.update("UPDATE \"ExternalCalendarSources\" SET \"lastError\" = 'old failure'"
                + " WHERE \"id\" = ?", sourceId);
        insertEvent(sourceId, USER, "stale-uid", "2026-11-01T12:00:00.000Z", "2026-11-01T13:00:00.000Z");
        icsFeedFetcher.textByUrl.put(FEED_URL, REPLACEMENT_FEED);

        mockMvc.perform(post("/external-calendars/" + sourceId + "/refresh")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.lastError").doesNotExist())
                .andExpect(jsonPath("$.events.length()").value(1))
                .andExpect(jsonPath("$.events[0].uid").value("replacement-1"));

        List<String> uids = jdbcTemplate.queryForList(
                "SELECT \"uid\" FROM \"ExternalEvents\" WHERE \"sourceId\" = ?", String.class, sourceId);
        assertThat(uids).containsExactly("replacement-1");
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT \"lastError\", \"lastFetchedAt\" FROM \"ExternalCalendarSources\""
                        + " WHERE \"id\" = ?", sourceId);
        assertThat(row.get("lastError")).isNull();
        assertThat(((Timestamp) row.get("lastFetchedAt")).toLocalDateTime().toInstant(ZoneOffset.UTC))
                .isEqualTo(FROZEN_NOW);
        assertThat(dataVersion(USER)).isEqualTo(11);
    }

    @Test
    void aFailedRefreshWritesLastErrorAndCarriesTheSourceInTheBody() throws Exception {
        String sourceId = insertIcsSource(USER, FEED_URL, "Team");
        insertEvent(sourceId, USER, "kept-uid", "2026-11-01T12:00:00.000Z", "2026-11-01T13:00:00.000Z");
        icsFeedFetcher.failureByUrl.put(FEED_URL,
                new IcsFeedException("The feed responded with status 500"));

        mockMvc.perform(post("/external-calendars/" + sourceId + "/refresh")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("refresh_failed"))
                .andExpect(jsonPath("$.detail").value("The feed responded with status 500"))
                .andExpect(jsonPath("$.source.id").value(sourceId))
                .andExpect(jsonPath("$.source.lastError").value("The feed responded with status 500"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"lastError\" FROM \"ExternalCalendarSources\" WHERE \"id\" = ?", String.class,
                sourceId)).isEqualTo("The feed responded with status 500");
        // The stale events survive a failed refresh untouched.
        assertThat(eventCountForUser(USER)).isEqualTo(1);
    }

    @Test
    void aGoogleRefreshWithoutAConnectionFailsWithTheReconnectMessage() throws Exception {
        String sourceId = insertProviderSource(USER, "GOOGLE", "calendar-1", "Work");

        mockMvc.perform(post("/external-calendars/" + sourceId + "/refresh")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("refresh_failed"))
                .andExpect(jsonPath("$.detail").value(
                        "Google account disconnected — reconnect it under Connected calendars"));
    }

    @Test
    void aMicrosoftRefreshPersistsTheRotatedRefreshToken() throws Exception {
        insertMicrosoftConnection(USER, "microsoft-refresh");
        String sourceId = insertProviderSource(USER, "MICROSOFT", "calendar-ms", "Work");
        graphClient.eventsByCalendarId.put("calendar-ms", List.of(new GraphEventMapper.ApiEvent(
                "graph-1", "Sync", null, null, null,
                new GraphEventMapper.ApiTime("2026-11-30T09:00:00.0000000", "UTC"),
                new GraphEventMapper.ApiTime("2026-11-30T10:00:00.0000000", "UTC"))));

        mockMvc.perform(post("/external-calendars/" + sourceId + "/refresh")
                        .with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events[0].uid").value("graph-1"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"refreshToken\" FROM \"MicrosoftCalendarConnections\" WHERE \"userId\" = ?",
                String.class, USER)).isEqualTo("microsoft-refresh+rot");
    }

    @Test
    void patchUpdatesOnlyTheFieldsSent() throws Exception {
        String locationId = insertLocation(USER, "Office");
        String sourceId = insertIcsSource(USER, FEED_URL, "Team");

        mockMvc.perform(patch("/external-calendars/" + sourceId).with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Renamed\", \"mode\": \"VISUAL\", \"enabled\": false,"
                                + " \"color\": {\"set\": true, \"value\": \"#aabbcc\"},"
                                + " \"locationId\": {\"set\": true, \"value\": \"" + locationId + "\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.mode").value("VISUAL"))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.color").value("#aabbcc"))
                .andExpect(jsonPath("$.locationId").value(locationId));

        // Absent fields stay; set-null clears.
        mockMvc.perform(patch("/external-calendars/" + sourceId).with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locationId\": {\"set\": true, \"value\": null}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.color").value("#aabbcc"))
                .andExpect(jsonPath("$.locationId").doesNotExist());

        // Another user's location cannot be attached.
        String foreignLocation = insertLocation(OTHER_USER, "Their office");
        mockMvc.perform(patch("/external-calendars/" + sourceId).with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locationId\": {\"set\": true, \"value\": \"" + foreignLocation
                                + "\"}}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("location_not_found"));

        // A foreign source answers 404, not a write.
        mockMvc.perform(patch("/external-calendars/" + sourceId)
                        .with(jwt().jwt(j -> j.subject(OTHER_USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Hijacked\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("calendar_not_found"));
    }

    @Test
    void deleteCascadesEventsAndAnswers404ForForeignRows() throws Exception {
        String sourceId = insertIcsSource(USER, FEED_URL, "Team");
        insertEvent(sourceId, USER, "uid-1", "2026-11-30T12:00:00.000Z", "2026-11-30T13:00:00.000Z");

        mockMvc.perform(delete("/external-calendars/" + sourceId)
                        .with(jwt().jwt(j -> j.subject(OTHER_USER))))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/external-calendars/" + sourceId).with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isNoContent());
        assertThat(sourceCountForUser(USER)).isZero();
        assertThat(eventCountForUser(USER)).isZero();

        mockMvc.perform(delete("/external-calendars/" + sourceId).with(jwt().jwt(j -> j.subject(USER))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Calendar not found"));
    }

    @Test
    void busyExceptionTogglesPerSeriesUid() throws Exception {
        String sourceId = insertIcsSource(USER, FEED_URL, "Team");

        mockMvc.perform(post("/external-calendars/" + sourceId + "/busy-exception")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uid\": \"series-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modeExceptions").value("[\"series-1\"]"));

        mockMvc.perform(post("/external-calendars/" + sourceId + "/busy-exception")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uid\": \"series-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modeExceptions").doesNotExist());
    }

    @Test
    void eventLocationOverridesPinClearAndInherit() throws Exception {
        String locationId = insertLocation(USER, "Office");
        String sourceId = insertIcsSource(USER, FEED_URL, "Team");

        mockMvc.perform(put("/external-calendars/" + sourceId + "/event-location")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uid\": \"series-1\", \"inherit\": false, \"locationId\": \""
                                + locationId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locationExceptions")
                        .value("{\"series-1\":\"" + locationId + "\"}"));

        // null = explicit Anywhere, distinct from inherit.
        mockMvc.perform(put("/external-calendars/" + sourceId + "/event-location")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uid\": \"series-1\", \"inherit\": false, \"locationId\": null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locationExceptions").value("{\"series-1\":null}"));

        mockMvc.perform(put("/external-calendars/" + sourceId + "/event-location")
                        .with(jwt().jwt(j -> j.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uid\": \"series-1\", \"inherit\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locationExceptions").doesNotExist());

        assertThat(dataVersion(USER)).isEqualTo(11);
    }

    private String insertIcsSource(String userId, String url, String name) {
        String id = java.util.UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO \"ExternalCalendarSources\""
                        + " (\"id\", \"userId\", \"kind\", \"url\", \"name\", \"enabled\", \"mode\","
                        + " \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, 'ICS', ?, ?, true, 'BUSY', ?, ?)",
                id, userId, url, name, UTC_NOW, UTC_NOW);
        return id;
    }

    private String insertProviderSource(String userId, String kind, String calendarId, String name) {
        String id = java.util.UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO \"ExternalCalendarSources\""
                        + " (\"id\", \"userId\", \"kind\", \"url\", \"name\", \"enabled\", \"mode\","
                        + " \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?::\"ExternalCalendarKind\", ?, ?, true, 'BUSY', ?, ?)",
                id, userId, kind, calendarId, name, UTC_NOW,
                UTC_NOW);
        return id;
    }

    private void insertEvent(String sourceId, String userId, String uid, String start, String end) {
        jdbcTemplate.update("INSERT INTO \"ExternalEvents\""
                        + " (\"id\", \"sourceId\", \"userId\", \"uid\", \"title\", \"start\", \"end\","
                        + " \"allDay\") VALUES (?, ?, ?, ?, ?, ?, ?, false)",
                sourceId + "|" + uid + "|" + start, sourceId, userId, uid, "Event", start, end);
    }

    private void insertGoogleConnection(String userId, String refreshToken) {
        jdbcTemplate.update("INSERT INTO \"GoogleCalendarConnections\""
                        + " (\"id\", \"userId\", \"email\", \"refreshToken\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?, ?, ?)",
                java.util.UUID.randomUUID().toString(), userId, userId + "@gmail.test", refreshToken,
                UTC_NOW, UTC_NOW);
    }

    private void insertMicrosoftConnection(String userId, String refreshToken) {
        jdbcTemplate.update("INSERT INTO \"MicrosoftCalendarConnections\""
                        + " (\"id\", \"userId\", \"email\", \"refreshToken\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?, ?, ?)",
                java.util.UUID.randomUUID().toString(), userId, userId + "@outlook.test", refreshToken,
                UTC_NOW, UTC_NOW);
    }

    private String insertLocation(String userId, String name) {
        String id = java.util.UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO \"Locations\""
                        + " (\"id\", \"name\", \"address\", \"placeId\", \"lat\", \"lng\", \"userId\","
                        + " \"createdAt\", \"updatedAt\") VALUES (?, ?, ?, ?, 59.0, 18.0, ?, ?, ?)",
                id, name, name + " street", "place-" + id, userId, UTC_NOW,
                UTC_NOW);
        return id;
    }

    private int sourceCountForUser(String userId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"ExternalCalendarSources\" WHERE \"userId\" = ?", Integer.class,
                userId);
        return count == null ? -1 : count;
    }

    private int eventCountForUser(String userId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"ExternalEvents\" WHERE \"userId\" = ?", Integer.class, userId);
        return count == null ? -1 : count;
    }

    private int dataVersion(String userId) {
        Integer version = jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, userId);
        return version == null ? -1 : version;
    }
}
