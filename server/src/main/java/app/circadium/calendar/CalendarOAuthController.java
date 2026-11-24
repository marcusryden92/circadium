package app.circadium.calendar;

import app.circadium.auth.AuthCookieProperties;
import app.circadium.auth.AuthCookies;
import app.circadium.auth.oauth.OAuthProperties;
import app.circadium.external.googlecalendar.GoogleCalendarClient;
import app.circadium.external.googlecalendar.GoogleCalendarRestClient;
import app.circadium.external.mail.MailProperties;
import app.circadium.external.microsoftgraph.MicrosoftGraphClient;
import app.circadium.external.microsoftgraph.MicrosoftGraphRestClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.WebUtils;

/**
 * The calendar-import consent flows: browser-navigated GETs, so unlike the JSON API they answer
 * failures with redirects, never ProblemDetails. The endpoints are public in the security chain
 * and authenticate the access cookie here instead (the resolver deliberately ignores cookies on
 * public endpoints, and the chain's 401 is a JSON body a navigating browser would dead-end on —
 * a consent screen can outlive the 15-minute cookie). A signed-out visitor goes to the web root;
 * every other outcome lands on {@code /settings?{provider}=connected|error}, the exact redirect
 * shape the retired Next routes used, so the UI banners are untouched. The callback's state
 * cookie ties it to the browser that started the flow; this is a hand-rolled code flow separate
 * from the Spring Security sign-in chain, which must keep owning {@code /login/oauth2/code/*}.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class CalendarOAuthController {

    private static final String GOOGLE_STATE_COOKIE = "circadium_google_calendar_state";
    private static final String MICROSOFT_STATE_COOKIE = "circadium_microsoft_calendar_state";
    private static final Duration STATE_TTL = Duration.ofSeconds(600);

    private final CalendarIntegrationService calendarIntegrationService;
    private final GoogleCalendarClient googleClient;
    private final MicrosoftGraphClient graphClient;
    private final OAuthProperties oauthProperties;
    private final AuthCookieProperties cookieProperties;
    private final AuthCookies authCookies;
    private final JwtDecoder jwtDecoder;
    private final MailProperties mailProperties;
    private final SecureRandom secureRandom = new SecureRandom();

    @GetMapping("/integrations/google/connect")
    @Operation(summary = "Start the Google Calendar consent flow",
            description = "Browser navigation: sets the state cookie and redirects to Google's "
                    + "consent screen. A signed-out visitor is sent to the web app instead.")
    @ApiResponse(responseCode = "302", description = "To Google, or to the web app when signed out "
            + "or unconfigured")
    public ResponseEntity<Void> googleConnect(HttpServletRequest request) {
        String userId = authenticatedUserId(request);
        if (userId == null) {
            return redirect(mailProperties.webBaseUrl());
        }
        // Both halves checked, like the TS clientCredentials(): a clientId-only deployment must
        // not march the user through Google's consent screen only to fail the callback exchange.
        if (!StringUtils.hasText(oauthProperties.google().clientId())
                || !StringUtils.hasText(oauthProperties.google().clientSecret())) {
            return redirect(settingsUrl("google", "error"));
        }
        String state = newState();
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, stateCookie(GOOGLE_STATE_COOKIE, state, STATE_TTL).toString())
                .header(HttpHeaders.LOCATION, GoogleCalendarRestClient.authorizationUrl(
                        oauthProperties.google().clientId(), redirectUri("google"), state))
                .build();
    }

    @GetMapping("/integrations/google/callback")
    @Operation(summary = "Finish the Google Calendar consent flow",
            description = "Validates the state cookie, trades the code for an offline grant and "
                    + "stores it (revoking a prior grant), then redirects to the web app's "
                    + "settings page with ?google=connected or ?google=error.")
    @ApiResponse(responseCode = "302", description = "To the web app's settings page")
    public ResponseEntity<Void> googleCallback(HttpServletRequest request,
            @RequestParam(required = false) String state, @RequestParam(required = false) String code) {
        String userId = authenticatedUserId(request);
        if (userId == null) {
            return redirect(mailProperties.webBaseUrl());
        }
        String expectedState = cookieValue(request, GOOGLE_STATE_COOKIE);
        String clearCookie = stateCookie(GOOGLE_STATE_COOKIE, "", Duration.ZERO).toString();
        if (code == null || state == null || expectedState == null || !state.equals(expectedState)) {
            return redirectClearing(settingsUrl("google", "error"), clearCookie);
        }
        try {
            GoogleCalendarClient.TokenGrant grant = googleClient.exchangeCode(code, redirectUri("google"));
            calendarIntegrationService.upsertGoogleConnection(userId, grant.refreshToken(), grant.email());
            return redirectClearing(settingsUrl("google", "connected"), clearCookie);
        } catch (RuntimeException e) {
            log.error("Google Calendar connect failed", e);
            return redirectClearing(settingsUrl("google", "error"), clearCookie);
        }
    }

    @GetMapping("/integrations/microsoft/connect")
    @Operation(summary = "Start the Microsoft calendar consent flow",
            description = "Browser navigation: sets the state cookie and redirects to Microsoft's "
                    + "consent screen. A signed-out visitor is sent to the web app instead.")
    @ApiResponse(responseCode = "302", description = "To Microsoft, or to the web app when signed out "
            + "or unconfigured")
    public ResponseEntity<Void> microsoftConnect(HttpServletRequest request) {
        String userId = authenticatedUserId(request);
        if (userId == null) {
            return redirect(mailProperties.webBaseUrl());
        }
        if (!StringUtils.hasText(oauthProperties.microsoft().clientId())
                || !StringUtils.hasText(oauthProperties.microsoft().clientSecret())) {
            return redirect(settingsUrl("microsoft", "error"));
        }
        String state = newState();
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE,
                        stateCookie(MICROSOFT_STATE_COOKIE, state, STATE_TTL).toString())
                .header(HttpHeaders.LOCATION, MicrosoftGraphRestClient.authorizationUrl(
                        oauthProperties.microsoft().clientId(), redirectUri("microsoft"), state))
                .build();
    }

    @GetMapping("/integrations/microsoft/callback")
    @Operation(summary = "Finish the Microsoft calendar consent flow",
            description = "Validates the state cookie, trades the code for an offline grant and "
                    + "stores it, then redirects to the web app's settings page with "
                    + "?microsoft=connected or ?microsoft=error.")
    @ApiResponse(responseCode = "302", description = "To the web app's settings page")
    public ResponseEntity<Void> microsoftCallback(HttpServletRequest request,
            @RequestParam(required = false) String state, @RequestParam(required = false) String code) {
        String userId = authenticatedUserId(request);
        if (userId == null) {
            return redirect(mailProperties.webBaseUrl());
        }
        String expectedState = cookieValue(request, MICROSOFT_STATE_COOKIE);
        String clearCookie = stateCookie(MICROSOFT_STATE_COOKIE, "", Duration.ZERO).toString();
        if (code == null || state == null || expectedState == null || !state.equals(expectedState)) {
            return redirectClearing(settingsUrl("microsoft", "error"), clearCookie);
        }
        try {
            MicrosoftGraphClient.TokenGrant grant = graphClient.exchangeCode(code,
                    redirectUri("microsoft"));
            calendarIntegrationService.upsertMicrosoftConnection(userId, grant.refreshToken(),
                    grant.email());
            return redirectClearing(settingsUrl("microsoft", "connected"), clearCookie);
        } catch (RuntimeException e) {
            log.error("Microsoft calendar connect failed", e);
            return redirectClearing(settingsUrl("microsoft", "error"), clearCookie);
        }
    }

    /** The chain's decoder (session-family check included), applied to the access cookie by hand. */
    private String authenticatedUserId(HttpServletRequest request) {
        return authCookies.accessToken(request).map(token -> {
            try {
                return jwtDecoder.decode(token).getSubject();
            } catch (JwtException e) {
                return null;
            }
        }).orElse(null);
    }

    private String newState() {
        byte[] bytes = new byte[16];
        secureRandom.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private ResponseCookie stateCookie(String name, String value, Duration maxAge) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(cookieProperties.secure())
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private String redirectUri(String provider) {
        return oauthProperties.redirectBaseUrl() + "/integrations/" + provider + "/callback";
    }

    private String settingsUrl(String provider, String result) {
        return mailProperties.webBaseUrl() + "/settings?" + provider + "=" + result;
    }

    private static ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, location).build();
    }

    private static ResponseEntity<Void> redirectClearing(String location, String clearCookie) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, clearCookie)
                .header(HttpHeaders.LOCATION, location)
                .build();
    }

    private static String cookieValue(HttpServletRequest request, String name) {
        Cookie cookie = WebUtils.getCookie(request, name);
        return cookie == null || cookie.getValue().isBlank() ? null : cookie.getValue();
    }
}
