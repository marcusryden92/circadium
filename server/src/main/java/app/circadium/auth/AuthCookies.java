package app.circadium.auth;

import app.circadium.auth.AuthController.TokenResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

/**
 * Writes and reads the web client's token cookies. Both are HttpOnly, so no page script, including an injected
 * one, can read a token.
 *
 * <ul>
 *   <li>The access cookie covers the shared parent domain and every path, so the API and the web server both
 *       receive it. SameSite=Lax because it must still arrive when a link on another site (an email) opens the
 *       web app; with Strict the web server would see a signed-in user as signed out.
 *   <li>The refresh cookie is host-only, so it reaches the API and never the web server. SameSite=Strict because
 *       only the web app's own requests, which are same-site, ever need it. Its path is {@code /}, which the
 *       {@code __Host-} name prefix deployed environments use requires; only refresh and logout read it.
 * </ul>
 *
 * Max-Age follows each token's expiry, so the browser drops a cookie once its token is useless.
 */
@Component
@RequiredArgsConstructor
public class AuthCookies {

    private final AuthCookieProperties properties;
    private final Clock clock;

    /**
     * Hands a new token pair to the client. The web app gets both tokens as cookies and only their expiry times in
     * the body, so no page script ever holds a token; the mobile app gets everything in the body.
     */
    public Delivery deliver(IssuedTokens tokens, ClientType client) {
        return switch (client) {
            case WEB -> new Delivery(cookieHeaders(tokens), TokenResponse.expiryOnly(tokens));
            case MOBILE -> new Delivery(new HttpHeaders(), TokenResponse.from(tokens));
        };
    }

    /**
     * {@code Set-Cookie} headers that delete both cookies. A cookie is deleted by overwriting it with
     * {@code Max-Age=0}, which only works when Domain and Path match the original exactly.
     */
    public HttpHeaders clear() {
        return setCookieHeaders(accessCookie("", Duration.ZERO), refreshCookie("", Duration.ZERO));
    }

    public Optional<String> accessToken(HttpServletRequest request) {
        return value(request, properties.accessName());
    }

    public Optional<String> refreshToken(HttpServletRequest request) {
        return value(request, properties.refreshName());
    }

    /** The response headers and body that carry a new token pair to one kind of client. */
    public record Delivery(HttpHeaders headers, TokenResponse body) {

        /** A 200 with the tokens; never cached. */
        public ResponseEntity<TokenResponse> asResponse() {
            return ResponseEntity.ok().headers(headers).cacheControl(CacheControl.noStore()).body(body);
        }
    }

    private HttpHeaders cookieHeaders(IssuedTokens tokens) {
        Instant now = clock.instant();
        return setCookieHeaders(
                accessCookie(tokens.accessToken(), Duration.between(now, tokens.accessTokenExpiresAt())),
                refreshCookie(tokens.refreshToken(), Duration.between(now, tokens.refreshTokenExpiresAt())));
    }

    private ResponseCookie accessCookie(String value, Duration maxAge) {
        return ResponseCookie.from(properties.accessName(), value)
                .httpOnly(true)
                .secure(properties.secure())
                .sameSite("Lax")
                .domain(properties.domain())
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private ResponseCookie refreshCookie(String value, Duration maxAge) {
        return ResponseCookie.from(properties.refreshName(), value)
                .httpOnly(true)
                .secure(properties.secure())
                .sameSite("Strict")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private static HttpHeaders setCookieHeaders(ResponseCookie... cookies) {
        HttpHeaders headers = new HttpHeaders();
        for (ResponseCookie cookie : cookies) {
            headers.add(HttpHeaders.SET_COOKIE, cookie.toString());
        }
        return headers;
    }

    private static Optional<String> value(HttpServletRequest request, String name) {
        Cookie cookie = WebUtils.getCookie(request, name);
        return Optional.ofNullable(cookie).map(Cookie::getValue).filter(value -> !value.isBlank());
    }
}
