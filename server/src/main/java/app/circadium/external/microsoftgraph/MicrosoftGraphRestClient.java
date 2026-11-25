package app.circadium.external.microsoftgraph;

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
 * Microsoft Graph over REST on the shared Entra app registration (common tenant). Error messages
 * are the retired TS module's, verbatim — they are user-facing contract.
 */
public class MicrosoftGraphRestClient implements MicrosoftGraphClient {

    public static final String SCOPE = "openid email offline_access https://graph.microsoft.com/Calendars.Read";

    private static final String AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    private static final String TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    private static final String GRAPH_BASE = "https://graph.microsoft.com/v1.0";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RestClient restClient;
    private final OAuthProperties properties;

    MicrosoftGraphRestClient(RestClient.Builder restClientBuilder, OAuthProperties properties) {
        this.restClient = restClientBuilder.build();
        this.properties = properties;
    }

    public static MicrosoftGraphRestClient create(OAuthProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(20));
        return new MicrosoftGraphRestClient(RestClient.builder().requestFactory(requestFactory), properties);
    }

    /** The consent-screen URL; select_account because a user may hold several Microsoft accounts. */
    public static String authorizationUrl(String clientId, String redirectUri, String state) {
        return UriComponentsBuilder.fromUriString(AUTH_BASE)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("response_mode", "query")
                .queryParam("scope", SCOPE)
                .queryParam("prompt", "select_account")
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
        form.add("scope", SCOPE);

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
                    "Microsoft token exchange failed (" + e.getStatusCode().value() + ")");
        } catch (RestClientException e) {
            throw new CalendarProviderException("Microsoft could not be reached");
        }
        if (response == null || response.refreshToken() == null || response.refreshToken().isEmpty()) {
            throw new CalendarProviderException("Microsoft did not return an offline grant");
        }
        return new TokenGrant(response.refreshToken(), emailFromIdToken(response.idToken()));
    }

    @Override
    public TokenPair refreshTokens(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("refresh_token", refreshToken);
        form.add("client_id", clientId());
        form.add("client_secret", clientSecret());
        form.add("grant_type", "refresh_token");
        form.add("scope", SCOPE);

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
                    ? "Microsoft access was revoked — reconnect your Microsoft account in Settings"
                    : "Microsoft token refresh failed (" + status + ")");
        } catch (RestClientException e) {
            throw new CalendarProviderException("Microsoft could not be reached");
        }
        if (response == null || response.accessToken() == null || response.accessToken().isEmpty()) {
            throw new CalendarProviderException("Microsoft returned no access token");
        }
        return new TokenPair(response.accessToken(),
                response.refreshToken() == null || response.refreshToken().isEmpty()
                        ? refreshToken
                        : response.refreshToken());
    }

    @Override
    public List<CalendarEntry> listCalendars(String accessToken) {
        List<CalendarEntry> entries = new ArrayList<>();
        String url = GRAPH_BASE + "/me/calendars?$select=id,name,hexColor,isDefaultCalendar&$top=100";
        while (url != null) {
            CalendarListResponse response;
            try {
                response = restClient.get()
                        .uri(java.net.URI.create(url))
                        .header("Authorization", "Bearer " + accessToken)
                        .retrieve()
                        .body(CalendarListResponse.class);
            } catch (RestClientResponseException e) {
                throw new CalendarProviderException(
                        "Microsoft calendar list failed (" + e.getStatusCode().value() + ")");
            } catch (RestClientException e) {
                throw new CalendarProviderException("Microsoft could not be reached");
            }
            if (response == null) {
                break;
            }
            for (CalendarListItem item : response.value() == null ? List.<CalendarListItem>of()
                    : response.value()) {
                if (item.id() == null) {
                    continue;
                }
                // JS truthiness, not hasText: a whitespace-only name is kept verbatim.
                entries.add(new CalendarEntry(item.id(),
                        item.name() != null && !item.name().isEmpty() ? item.name() : item.id(),
                        item.hexColor() != null && item.hexColor().startsWith("#") ? item.hexColor() : null,
                        Boolean.TRUE.equals(item.isDefaultCalendar())));
            }
            url = continuationLink(response.nextLink());
        }
        return entries;
    }

    @Override
    public String calendarName(String accessToken, String calendarId) {
        try {
            CalendarResponse response = restClient.get()
                    .uri(UriComponentsBuilder.fromUriString(GRAPH_BASE + "/me/calendars/{calendarId}")
                            .queryParam("$select", "name")
                            .encode()
                            .build(calendarId))
                    .header("Authorization", "Bearer " + accessToken)
                    .retrieve()
                    .body(CalendarResponse.class);
            return response == null ? null : response.name();
        } catch (RestClientException e) {
            // Display-name fallback only; the caller falls through to the calendar id.
            return null;
        }
    }

    @Override
    public List<ImportedCalendarEvent> fetchEvents(String accessToken, String calendarId, String sourceId,
            String userId, Instant windowStart, Instant windowEnd) {
        List<GraphEventMapper.ApiEvent> items = new ArrayList<>();
        java.net.URI url = UriComponentsBuilder
                .fromUriString(GRAPH_BASE + "/me/calendars/{calendarId}/calendarView")
                .queryParam("startDateTime", ImportedCalendarEvents.isoMillis(windowStart))
                .queryParam("endDateTime", ImportedCalendarEvents.isoMillis(windowEnd))
                .queryParam("$select", "id,subject,start,end,isAllDay,isCancelled,seriesMasterId")
                .queryParam("$top", "500")
                .encode()
                .build(calendarId);
        while (url != null) {
            EventsResponse response;
            try {
                response = restClient.get()
                        .uri(url)
                        .header("Authorization", "Bearer " + accessToken)
                        .header("Prefer", "outlook.timezone=\"UTC\"")
                        .retrieve()
                        .body(EventsResponse.class);
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                throw new CalendarProviderException(status == 404
                        ? "Microsoft couldn't find that calendar for your account"
                        : status == 403
                                ? "Your Microsoft account doesn't have access to that calendar"
                                : "Microsoft events fetch failed (" + status + ")");
            } catch (RestClientException e) {
                throw new CalendarProviderException("Microsoft could not be reached");
            }
            if (response == null) {
                break;
            }
            if (response.value() != null) {
                items.addAll(response.value());
            }
            String nextLink = continuationLink(response.nextLink());
            url = nextLink == null ? null : java.net.URI.create(nextLink);
        }

        return GraphEventMapper.map(items, sourceId, userId, windowStart, windowEnd);
    }

    private String clientId() {
        requireConfigured();
        return properties.microsoft().clientId();
    }

    private String clientSecret() {
        requireConfigured();
        return properties.microsoft().clientSecret();
    }

    private void requireConfigured() {
        if (!StringUtils.hasText(properties.microsoft().clientId())
                || !StringUtils.hasText(properties.microsoft().clientSecret())) {
            throw new CalendarProviderException("Microsoft OAuth credentials are not configured");
        }
    }

    /** An empty-string nextLink must end pagination, not become an unusable relative URI. */
    private static String continuationLink(String nextLink) {
        return nextLink == null || nextLink.isEmpty() ? null : nextLink;
    }

    /**
     * Display-only claim; the token came straight from Microsoft over TLS, so signature
     * verification adds nothing here.
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
            if (email != null && email.isString()) {
                return email.stringValue();
            }
            JsonNode preferredUsername = payload.get("preferred_username");
            return preferredUsername != null && preferredUsername.isString()
                    ? preferredUsername.stringValue()
                    : null;
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
    record CalendarListResponse(List<CalendarListItem> value,
            @JsonProperty("@odata.nextLink") String nextLink) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CalendarListItem(String id, String name, String hexColor, Boolean isDefaultCalendar) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CalendarResponse(String name) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EventsResponse(List<GraphEventMapper.ApiEvent> value,
            @JsonProperty("@odata.nextLink") String nextLink) {
    }
}
