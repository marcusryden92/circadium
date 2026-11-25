package app.circadium.external.googlecalendar;

import app.circadium.auth.oauth.OAuthProperties;
import app.circadium.external.CalendarProviderException;
import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.ImportedCalendarEvents;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Google Calendar over REST on the shared sign-in app registration. Error messages are the
 * retired TS module's, verbatim — they are user-facing contract.
 */
public class GoogleCalendarRestClient implements GoogleCalendarClient {

    public static final String SCOPE = "openid email https://www.googleapis.com/auth/calendar.readonly";

    private static final String AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String REVOKE_URL = "https://oauth2.googleapis.com/revoke";
    private static final String API_BASE = "https://www.googleapis.com/calendar/v3";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RestClient restClient;
    private final OAuthProperties properties;

    GoogleCalendarRestClient(RestClient.Builder restClientBuilder, OAuthProperties properties) {
        this.restClient = restClientBuilder.build();
        this.properties = properties;
    }

    public static GoogleCalendarRestClient create(OAuthProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(20));
        return new GoogleCalendarRestClient(RestClient.builder().requestFactory(requestFactory), properties);
    }

    /** The consent-screen URL; offline access with a forced consent so a refresh token is granted. */
    public static String authorizationUrl(String clientId, String redirectUri, String state) {
        return UriComponentsBuilder.fromUriString(AUTH_BASE)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", SCOPE)
                .queryParam("access_type", "offline")
                .queryParam("prompt", "consent")
                .queryParam("state", state)
                .encode()
                .build()
                .toUriString();
    }

    @Override
    public TokenGrant exchangeCode(String code, String redirectUri) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", clientId());
        form.add("client_secret", clientSecret());
        form.add("redirect_uri", redirectUri);
        form.add("grant_type", "authorization_code");

        TokenResponse response;
        try {
            response = restClient.post()
                    .uri(TOKEN_URL)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(TokenResponse.class);
        } catch (RestClientResponseException e) {
            throw new CalendarProviderException(
                    "Google token exchange failed (" + e.getStatusCode().value() + ")");
        } catch (RestClientException e) {
            throw new CalendarProviderException("Google could not be reached");
        }
        if (response == null || response.refreshToken() == null || response.refreshToken().isEmpty()) {
            throw new CalendarProviderException("Google did not return an offline grant");
        }
        return new TokenGrant(response.refreshToken(), emailFromIdToken(response.idToken()));
    }

    @Override
    public String refreshAccessToken(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("refresh_token", refreshToken);
        form.add("client_id", clientId());
        form.add("client_secret", clientSecret());
        form.add("grant_type", "refresh_token");

        TokenResponse response;
        try {
            response = restClient.post()
                    .uri(TOKEN_URL)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(TokenResponse.class);
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            throw new CalendarProviderException(status == 400 || status == 401
                    ? "Google access was revoked — reconnect your Google account in Settings"
                    : "Google token refresh failed (" + status + ")");
        } catch (RestClientException e) {
            throw new CalendarProviderException("Google could not be reached");
        }
        if (response == null || response.accessToken() == null || response.accessToken().isEmpty()) {
            throw new CalendarProviderException("Google returned no access token");
        }
        return response.accessToken();
    }

    @Override
    public boolean revokeToken(String refreshToken) {
        try {
            restClient.post()
                    .uri(UriComponentsBuilder.fromUriString(REVOKE_URL)
                            .queryParam("token", refreshToken)
                            .encode()
                            .build()
                            .toUri())
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientResponseException e) {
            // A 400 for an already-revoked/expired token is a benign outcome: the grant is gone
            // either way.
            return e.getStatusCode().value() == 400;
        } catch (RuntimeException e) {
            return false;
        }
    }

    @Override
    public List<CalendarEntry> listCalendars(String accessToken) {
        List<CalendarEntry> entries = new ArrayList<>();
        String pageToken = null;
        do {
            UriComponentsBuilder uri = UriComponentsBuilder.fromUriString(API_BASE + "/users/me/calendarList")
                    .queryParam("minAccessRole", "freeBusyReader")
                    .queryParam("maxResults", "250");
            if (pageToken != null) {
                uri.queryParam("pageToken", pageToken);
            }
            CalendarListResponse response;
            try {
                response = restClient.get()
                        .uri(uri.encode().build().toUri())
                        .header("Authorization", "Bearer " + accessToken)
                        .retrieve()
                        .body(CalendarListResponse.class);
            } catch (RestClientResponseException e) {
                throw new CalendarProviderException(
                        "Google calendar list failed (" + e.getStatusCode().value() + ")");
            } catch (RestClientException e) {
                throw new CalendarProviderException("Google could not be reached");
            }
            if (response == null) {
                break;
            }
            for (CalendarListItem item : response.items() == null ? List.<CalendarListItem>of()
                    : response.items()) {
                if (item.id() == null) {
                    continue;
                }
                // JS truthiness, not hasText: a whitespace-only override/summary is kept verbatim.
                String summary = notEmpty(item.summaryOverride()) ? item.summaryOverride()
                        : notEmpty(item.summary()) ? item.summary() : item.id();
                entries.add(new CalendarEntry(item.id(), summary, item.backgroundColor(),
                        Boolean.TRUE.equals(item.primary()),
                        item.accessRole() == null ? "reader" : item.accessRole()));
            }
            pageToken = continuationToken(response.nextPageToken());
        } while (pageToken != null);
        return entries;
    }

    @Override
    public String calendarSummary(String accessToken, String calendarId) {
        try {
            CalendarResponse response = restClient.get()
                    .uri(API_BASE + "/calendars/{calendarId}", calendarId)
                    .header("Authorization", "Bearer " + accessToken)
                    .retrieve()
                    .body(CalendarResponse.class);
            return response == null ? null : response.summary();
        } catch (RestClientException e) {
            // Display-name fallback only; the caller falls through to the calendar id.
            return null;
        }
    }

    @Override
    public List<ImportedCalendarEvent> fetchEvents(String accessToken, String calendarId, String sourceId,
            String userId, Instant windowStart, Instant windowEnd) {
        List<GoogleEventMapper.ApiEvent> items = new ArrayList<>();
        String pageToken = null;
        do {
            String token = pageToken;
            EventsResponse response;
            try {
                response = restClient.get()
                        .uri(API_BASE + "/calendars/{calendarId}/events", uriBuilder -> {
                            uriBuilder.queryParam("singleEvents", "true")
                                    .queryParam("timeMin", ImportedCalendarEvents.isoMillis(windowStart))
                                    .queryParam("timeMax", ImportedCalendarEvents.isoMillis(windowEnd))
                                    .queryParam("maxResults", "2500")
                                    .queryParam("fields",
                                            "items(id,status,summary,recurringEventId,start,end),nextPageToken");
                            if (token != null) {
                                uriBuilder.queryParam("pageToken", token);
                            }
                            return uriBuilder.build(calendarId);
                        })
                        .header("Authorization", "Bearer " + accessToken)
                        .retrieve()
                        .body(EventsResponse.class);
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                throw new CalendarProviderException(status == 404
                        ? "Google couldn't find that calendar for your account"
                        : status == 403
                                ? "Your Google account doesn't have access to that calendar"
                                : "Google events fetch failed (" + status + ")");
            } catch (RestClientException e) {
                throw new CalendarProviderException("Google could not be reached");
            }
            if (response == null) {
                break;
            }
            if (response.items() != null) {
                items.addAll(response.items());
            }
            pageToken = continuationToken(response.nextPageToken());
        } while (pageToken != null);

        return GoogleEventMapper.map(items, sourceId, userId, windowStart, windowEnd);
    }

    private String clientId() {
        requireConfigured();
        return properties.google().clientId();
    }

    private String clientSecret() {
        requireConfigured();
        return properties.google().clientSecret();
    }

    private void requireConfigured() {
        if (!StringUtils.hasText(properties.google().clientId())
                || !StringUtils.hasText(properties.google().clientSecret())) {
            throw new CalendarProviderException("Google OAuth credentials are not configured");
        }
    }

    /** An empty-string token must end pagination, not re-request with pageToken= forever. */
    private static String continuationToken(String token) {
        return token == null || token.isEmpty() ? null : token;
    }

    private static boolean notEmpty(String value) {
        return value != null && !value.isEmpty();
    }

    /**
     * Display-only claim; the token came straight from Google over TLS, so signature verification
     * adds nothing here.
     */
    static String emailFromIdToken(String idToken) {
        if (idToken == null) {
            return null;
        }
        try {
            String[] segments = idToken.split("\\.");
            JsonNode payload = JSON.readTree(
                    new String(Base64.getUrlDecoder().decode(segments[1]), StandardCharsets.UTF_8));
            JsonNode email = payload.get("email");
            return email != null && email.isString() ? email.stringValue() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(@JsonProperty("access_token") String accessToken,
            @JsonProperty("refresh_token") String refreshToken,
            @JsonProperty("id_token") String idToken) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CalendarListResponse(List<CalendarListItem> items, String nextPageToken) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CalendarListItem(String id, String summary, String summaryOverride, String backgroundColor,
            Boolean primary, String accessRole) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CalendarResponse(String summary) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EventsResponse(List<GoogleEventMapper.ApiEvent> items, String nextPageToken) {
    }
}
