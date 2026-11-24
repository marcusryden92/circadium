package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.AuthCookieProperties;
import app.circadium.auth.IssuedTokens;
import app.circadium.auth.TokenService;
import app.circadium.external.googlecalendar.FakeGoogleCalendarClient;
import app.circadium.external.googlecalendar.GoogleCalendarClient;
import app.circadium.external.googlecalendar.GoogleEventMapper;
import app.circadium.external.ics.FakeIcsFeedFetcher;
import app.circadium.external.microsoftgraph.FakeMicrosoftGraphClient;
import app.circadium.external.microsoftgraph.GraphEventMapper;
import app.circadium.external.microsoftgraph.MicrosoftGraphClient;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The Google and Microsoft connection endpoints and the browser consent flows: status, calendar
 * lists, API-backed source adds with the duplicate guard, disconnects (best-effort revoke for
 * Google, local delete for Microsoft), and the connect/callback navigations with their state
 * cookie, the exact settings redirects, and the signed-out fallback to the web root.
 */
@SpringBootTest(properties = {
        "circadium.oauth.google.client-id=google-client-id",
        "circadium.oauth.google.client-secret=google-client-secret",
        "circadium.oauth.microsoft.client-id=microsoft-client-id",
        "circadium.oauth.microsoft.client-secret=microsoft-client-secret"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CalendarIntegrationsIntegrationTest {

    private static final String WEB_BASE = "http://localhost:3000";
    private static final String GOOGLE_STATE_COOKIE = "circadium_google_calendar_state";
    private static final String MICROSOFT_STATE_COOKIE = "circadium_microsoft_calendar_state";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    TokenService tokenService;

    @Autowired
    AuthCookieProperties cookieProperties;

    @Autowired
    FakeGoogleCalendarClient googleClient;

    @Autowired
    FakeMicrosoftGraphClient graphClient;

    @Autowired
    FakeIcsFeedFetcher icsFeedFetcher;

    private User user;

    @BeforeEach
    void seed() {
        googleClient.reset();
        graphClient.reset();
        icsFeedFetcher.reset();
        user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName("Integration User");
        user.setEmail("integrations-" + UUID.randomUUID() + "@example.com");
        user.setPassword(passwordEncoder.encode("irrelevant-password"));
        user.setEmailVerified(Instant.now());
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(5);
        userRepository.saveAndFlush(user);
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", user.getId());
    }

    @Test
    void statusReflectsTheConnectionRow() throws Exception {
        mockMvc.perform(get("/integrations/google/status").with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(false));

        insertGoogleConnection(user.getId(), "google-refresh");
        mockMvc.perform(get("/integrations/google/status").with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(true))
                .andExpect(jsonPath("$.email").value(user.getId() + "@gmail.test"));

        mockMvc.perform(get("/integrations/microsoft/status")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(false));
    }

    @Test
    void calendarListsRequireAConnection() throws Exception {
        mockMvc.perform(get("/integrations/google/calendars")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("not_connected"))
                .andExpect(jsonPath("$.detail").value("Google account not connected"));

        insertGoogleConnection(user.getId(), "google-refresh");
        googleClient.calendars.add(new GoogleCalendarClient.CalendarEntry("calendar-1", "Primary",
                "#abcdef", true, "owner"));
        mockMvc.perform(get("/integrations/google/calendars")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.calendars[0].id").value("calendar-1"))
                .andExpect(jsonPath("$.calendars[0].primary").value(true));

        mockMvc.perform(get("/integrations/microsoft/calendars")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("provider_error"))
                .andExpect(jsonPath("$.detail").value(
                        "Microsoft account disconnected — reconnect it under Connected calendars"));

        insertMicrosoftConnection(user.getId(), "microsoft-refresh");
        graphClient.calendars.add(new MicrosoftGraphClient.CalendarEntry("calendar-ms", "Work",
                "#112233", true));
        mockMvc.perform(get("/integrations/microsoft/calendars")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.calendars[0].name").value("Work"));
        // Listing rode a rotated refresh token, and the rotation was persisted.
        assertThat(microsoftRefreshToken(user.getId())).isEqualTo("microsoft-refresh+rot");
    }

    @Test
    void addingAProviderSourceGuardsDuplicatesAndNamesFromTheProvider() throws Exception {
        insertGoogleConnection(user.getId(), "google-refresh");
        googleClient.eventsByCalendarId.put("calendar-1", List.of(new GoogleEventMapper.ApiEvent(
                "event-1", null, "Meeting", null,
                new GoogleEventMapper.ApiTime("2026-11-30T09:00:00Z", null),
                new GoogleEventMapper.ApiTime("2026-11-30T10:00:00Z", null))));
        googleClient.summaryByCalendarId.put("calendar-1", "Primary calendar");

        mockMvc.perform(post("/integrations/google/sources")
                        .with(jwt().jwt(j -> j.subject(user.getId())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"calendarId\": \"calendar-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.kind").value("GOOGLE"))
                .andExpect(jsonPath("$.source.url").value("calendar-1"))
                .andExpect(jsonPath("$.source.name").value("Primary calendar"))
                .andExpect(jsonPath("$.events[0].title").value("Meeting"));

        mockMvc.perform(post("/integrations/google/sources")
                        .with(jwt().jwt(j -> j.subject(user.getId())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"calendarId\": \"calendar-1\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("duplicate_source"))
                .andExpect(jsonPath("$.detail").value("\"Primary calendar\" is already connected"));

        assertThat(dataVersion(user.getId())).isEqualTo(5);
    }

    @Test
    void addingAMicrosoftSourceRequiresTheConnectionAndPersistsRotation() throws Exception {
        mockMvc.perform(post("/integrations/microsoft/sources")
                        .with(jwt().jwt(j -> j.subject(user.getId())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"calendarId\": \"calendar-ms\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("provider_error"));

        insertMicrosoftConnection(user.getId(), "microsoft-refresh");
        graphClient.eventsByCalendarId.put("calendar-ms", List.of(new GraphEventMapper.ApiEvent(
                "graph-1", "Review", null, null, null,
                new GraphEventMapper.ApiTime("2026-11-30T09:00:00.0000000", "UTC"),
                new GraphEventMapper.ApiTime("2026-11-30T10:00:00.0000000", "UTC"))));
        graphClient.nameByCalendarId.put("calendar-ms", "Work calendar");

        mockMvc.perform(post("/integrations/microsoft/sources")
                        .with(jwt().jwt(j -> j.subject(user.getId())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"calendarId\": \"calendar-ms\", \"color\": \"#334455\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source.kind").value("MICROSOFT"))
                .andExpect(jsonPath("$.source.name").value("Work calendar"))
                .andExpect(jsonPath("$.source.color").value("#334455"));

        assertThat(microsoftRefreshToken(user.getId())).isEqualTo("microsoft-refresh+rot");
    }

    @Test
    void googleDisconnectRevokesBestEffortAndDropsSourcesWithTheConnection() throws Exception {
        mockMvc.perform(delete("/integrations/google/connection")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedSourceIds.length()").value(0))
                .andExpect(jsonPath("$.revoked").value(true));

        insertGoogleConnection(user.getId(), "google-refresh");
        String googleSource = insertProviderSource(user.getId(), "GOOGLE", "calendar-1");
        String icsSource = insertProviderSource(user.getId(), "ICS", "https://example.com/cal.ics");
        insertEvent(googleSource, user.getId(), "uid-1");
        googleClient.revokeAnswer = false;

        mockMvc.perform(delete("/integrations/google/connection")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedSourceIds[0]").value(googleSource))
                .andExpect(jsonPath("$.revoked").value(false));

        assertThat(googleClient.revokedTokens).containsExactly("google-refresh");
        assertThat(sourceIds(user.getId())).containsExactly(icsSource);
        assertThat(eventCount(user.getId())).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"GoogleCalendarConnections\" WHERE \"userId\" = ?", Integer.class,
                user.getId())).isZero();
    }

    @Test
    void microsoftDisconnectIsALocalDelete() throws Exception {
        mockMvc.perform(delete("/integrations/microsoft/connection")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedSourceIds.length()").value(0));

        insertMicrosoftConnection(user.getId(), "microsoft-refresh");
        String microsoftSource = insertProviderSource(user.getId(), "MICROSOFT", "calendar-ms");

        mockMvc.perform(delete("/integrations/microsoft/connection")
                        .with(jwt().jwt(j -> j.subject(user.getId()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedSourceIds[0]").value(microsoftSource));

        assertThat(sourceIds(user.getId())).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"MicrosoftCalendarConnections\" WHERE \"userId\" = ?",
                Integer.class, user.getId())).isZero();
    }

    @Test
    void connectSetsTheStateCookieAndRedirectsToConsent() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get("/integrations/google/connect")
                        .cookie(accessCookie()))
                .andExpect(status().isFound())
                .andReturn().getResponse();

        Cookie state = response.getCookie(GOOGLE_STATE_COOKIE);
        assertThat(state).isNotNull();
        assertThat(state.getValue()).hasSize(32);
        assertThat(state.isHttpOnly()).isTrue();
        assertThat(state.getMaxAge()).isEqualTo(600);

        String location = response.getHeader(HttpHeaders.LOCATION);
        assertThat(location).startsWith("https://accounts.google.com/o/oauth2/v2/auth");
        assertThat(location).contains("client_id=google-client-id");
        assertThat(location).contains("access_type=offline");
        assertThat(location).contains("prompt=consent");
        assertThat(location).contains("calendar.readonly");
        assertThat(location).contains("state=" + state.getValue());
        assertThat(location).contains("/integrations/google/callback");
    }

    @Test
    void microsoftConnectRedirectsToTheCommonTenant() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get("/integrations/microsoft/connect")
                        .cookie(accessCookie()))
                .andExpect(status().isFound())
                .andReturn().getResponse();

        Cookie state = response.getCookie(MICROSOFT_STATE_COOKIE);
        assertThat(state).isNotNull();
        String location = response.getHeader(HttpHeaders.LOCATION);
        assertThat(location)
                .startsWith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
        assertThat(location).contains("client_id=microsoft-client-id");
        assertThat(location).contains("prompt=select_account");
        assertThat(location).contains("offline_access");
        assertThat(location).contains("Calendars.Read");
        assertThat(location).contains("state=" + state.getValue());
    }

    @Test
    void aSignedOutVisitorIsSentToTheWebApp() throws Exception {
        mockMvc.perform(get("/integrations/google/connect"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE));

        mockMvc.perform(get("/integrations/google/callback")
                        .param("state", "s").param("code", "c"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE));
    }

    @Test
    void theGoogleCallbackStoresTheGrantAndRevokesAPriorOne() throws Exception {
        googleClient.grantByCode.put("code-1",
                new GoogleCalendarClient.TokenGrant("fresh-refresh", "person@gmail.test"));

        mockMvc.perform(get("/integrations/google/callback")
                        .cookie(accessCookie(), new Cookie(GOOGLE_STATE_COOKIE, "state-value"))
                        .param("state", "state-value")
                        .param("code", "code-1"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE + "/settings?google=connected"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE,
                        org.hamcrest.Matchers.containsString(GOOGLE_STATE_COOKIE + "=;")));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"refreshToken\" FROM \"GoogleCalendarConnections\" WHERE \"userId\" = ?",
                String.class, user.getId())).isEqualTo("fresh-refresh");

        // A re-connect replaces the grant and revokes the old one.
        googleClient.grantByCode.put("code-2",
                new GoogleCalendarClient.TokenGrant("newer-refresh", "person@gmail.test"));
        mockMvc.perform(get("/integrations/google/callback")
                        .cookie(accessCookie(), new Cookie(GOOGLE_STATE_COOKIE, "state-2"))
                        .param("state", "state-2")
                        .param("code", "code-2"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE + "/settings?google=connected"));
        assertThat(googleClient.revokedTokens).containsExactly("fresh-refresh");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"refreshToken\" FROM \"GoogleCalendarConnections\" WHERE \"userId\" = ?",
                String.class, user.getId())).isEqualTo("newer-refresh");
        assertThat(dataVersion(user.getId())).isEqualTo(5);
    }

    @Test
    void aStateMismatchOrFailedExchangeLandsOnTheErrorRedirect() throws Exception {
        mockMvc.perform(get("/integrations/google/callback")
                        .cookie(accessCookie(), new Cookie(GOOGLE_STATE_COOKIE, "expected"))
                        .param("state", "forged")
                        .param("code", "code-1"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE + "/settings?google=error"));

        mockMvc.perform(get("/integrations/google/callback")
                        .cookie(accessCookie(), new Cookie(GOOGLE_STATE_COOKIE, "expected"))
                        .param("state", "expected")
                        .param("code", "unknown-code"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE + "/settings?google=error"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM \"GoogleCalendarConnections\" WHERE \"userId\" = ?", Integer.class,
                user.getId())).isZero();
    }

    @Test
    void theMicrosoftCallbackStoresTheGrantWithoutARevoke() throws Exception {
        graphClient.grantByCode.put("code-ms",
                new MicrosoftGraphClient.TokenGrant("ms-refresh", "person@outlook.test"));

        mockMvc.perform(get("/integrations/microsoft/callback")
                        .cookie(accessCookie(), new Cookie(MICROSOFT_STATE_COOKIE, "state-ms"))
                        .param("state", "state-ms")
                        .param("code", "code-ms"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(WEB_BASE + "/settings?microsoft=connected"));

        assertThat(microsoftRefreshToken(user.getId())).isEqualTo("ms-refresh");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"email\" FROM \"MicrosoftCalendarConnections\" WHERE \"userId\" = ?",
                String.class, user.getId())).isEqualTo("person@outlook.test");
    }

    private String microsoftRefreshToken(String userId) {
        return jdbcTemplate.queryForObject(
                "SELECT \"refreshToken\" FROM \"MicrosoftCalendarConnections\" WHERE \"userId\" = ?",
                String.class, userId);
    }

    private Cookie accessCookie() {
        IssuedTokens tokens = tokenService.startSession(user, null);
        return new Cookie(cookieProperties.accessName(), tokens.accessToken());
    }

    private void insertGoogleConnection(String userId, String refreshToken) {
        jdbcTemplate.update("INSERT INTO \"GoogleCalendarConnections\""
                        + " (\"id\", \"userId\", \"email\", \"refreshToken\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), userId, userId + "@gmail.test", refreshToken,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now()));
    }

    private void insertMicrosoftConnection(String userId, String refreshToken) {
        jdbcTemplate.update("INSERT INTO \"MicrosoftCalendarConnections\""
                        + " (\"id\", \"userId\", \"email\", \"refreshToken\", \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), userId, userId + "@outlook.test", refreshToken,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now()));
    }

    private String insertProviderSource(String userId, String kind, String url) {
        String id = UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO \"ExternalCalendarSources\""
                        + " (\"id\", \"userId\", \"kind\", \"url\", \"name\", \"enabled\", \"mode\","
                        + " \"createdAt\", \"updatedAt\")"
                        + " VALUES (?, ?, ?::\"ExternalCalendarKind\", ?, ?, true, 'BUSY', ?, ?)",
                id, userId, kind, url, kind + " source", Timestamp.from(Instant.now()),
                Timestamp.from(Instant.now()));
        return id;
    }

    private void insertEvent(String sourceId, String userId, String uid) {
        jdbcTemplate.update("INSERT INTO \"ExternalEvents\""
                        + " (\"id\", \"sourceId\", \"userId\", \"uid\", \"title\", \"start\", \"end\","
                        + " \"allDay\") VALUES (?, ?, ?, ?, ?, ?, ?, false)",
                sourceId + "|" + uid, sourceId, userId, uid, "Event", "2026-11-30T12:00:00.000Z",
                "2026-11-30T13:00:00.000Z");
    }

    private List<String> sourceIds(String userId) {
        return jdbcTemplate.queryForList(
                "SELECT \"id\" FROM \"ExternalCalendarSources\" WHERE \"userId\" = ?", String.class,
                userId);
    }

    private int eventCount(String userId) {
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
