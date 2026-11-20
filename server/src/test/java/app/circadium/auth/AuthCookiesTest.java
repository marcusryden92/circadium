package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;

import app.circadium.auth.AuthController.TokenResponse;
import app.circadium.auth.AuthCookies.Delivery;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

/** The attributes of the token cookies in a deployed (shared domain, HTTPS) and a local setup. */
class AuthCookiesTest {

    private static final Instant NOW = Instant.parse("2026-11-20T12:00:00Z");
    private static final IssuedTokens TOKENS = new IssuedTokens(
            "header.payload.signature", NOW.plus(Duration.ofMinutes(15)),
            "refresh-token-value", NOW.plus(Duration.ofDays(30)));

    private final AuthCookies deployed = new AuthCookies(
            new AuthCookieProperties("circadium_access", "circadium_refresh", "circadium.app", true),
            Clock.fixed(NOW, ZoneOffset.UTC));
    private final AuthCookies local = new AuthCookies(
            new AuthCookieProperties("circadium_access", "circadium_refresh", "", false),
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void webDeliveryPutsTheAccessTokenOnTheSharedDomainAndTheRefreshTokenOnTheApiHostOnly() {
        List<String> cookies = setCookies(deployed.deliver(TOKENS, ClientType.WEB).headers());

        assertThat(cookies).hasSize(2);
        assertThat(cookies.get(0)).startsWith("circadium_access=header.payload.signature;");
        assertThat(attributes(cookies.get(0))).contains(
                "Path=/", "Domain=circadium.app", "Max-Age=900", "Secure", "HttpOnly", "SameSite=Lax");
        assertThat(cookies.get(1)).startsWith("circadium_refresh=refresh-token-value;");
        assertThat(attributes(cookies.get(1))).contains(
                "Path=/auth", "Max-Age=2592000", "Secure", "HttpOnly", "SameSite=Strict");
        assertThat(attributes(cookies.get(1))).noneMatch(attribute -> attribute.startsWith("Domain="));
    }

    @Test
    void webDeliveryKeepsTheTokensOutOfTheBody() {
        TokenResponse body = deployed.deliver(TOKENS, ClientType.WEB).body();

        assertThat(body.accessToken()).isNull();
        assertThat(body.refreshToken()).isNull();
        assertThat(body.tokenType()).isNull();
        assertThat(body.accessTokenExpiresAt()).isEqualTo(TOKENS.accessTokenExpiresAt());
        assertThat(body.refreshTokenExpiresAt()).isEqualTo(TOKENS.refreshTokenExpiresAt());
    }

    @Test
    void mobileDeliverySetsNoCookiesAndReturnsTheTokens() {
        Delivery delivery = deployed.deliver(TOKENS, ClientType.MOBILE);

        assertThat(delivery.headers().get(HttpHeaders.SET_COOKIE)).isNull();
        assertThat(delivery.body().accessToken()).isEqualTo(TOKENS.accessToken());
        assertThat(delivery.body().refreshToken()).isEqualTo(TOKENS.refreshToken());
    }

    @Test
    void localCookiesAreHostOnlyAndAllowPlainHttp() {
        List<String> cookies = setCookies(local.deliver(TOKENS, ClientType.WEB).headers());

        assertThat(cookies).allSatisfy(cookie -> {
            assertThat(attributes(cookie)).noneMatch(attribute -> attribute.startsWith("Domain="));
            assertThat(attributes(cookie)).doesNotContain("Secure").contains("HttpOnly");
        });
    }

    @Test
    void clearingMatchesTheDomainAndPathOfTheCookiesItReplaces() {
        List<String> cookies = setCookies(deployed.clear());

        assertThat(cookies.get(0)).startsWith("circadium_access=;");
        assertThat(attributes(cookies.get(0))).contains("Path=/", "Domain=circadium.app", "Max-Age=0");
        assertThat(cookies.get(1)).startsWith("circadium_refresh=;");
        assertThat(attributes(cookies.get(1))).contains("Path=/auth", "Max-Age=0");
        assertThat(attributes(cookies.get(1))).noneMatch(attribute -> attribute.startsWith("Domain="));
    }

    @Test
    void readsTokensBackAndTreatsAClearedCookieAsAbsent() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("circadium_access", "a.b.c"), new Cookie("circadium_refresh", ""));

        assertThat(deployed.accessToken(request)).contains("a.b.c");
        assertThat(deployed.refreshToken(request)).isEmpty();
        assertThat(deployed.accessToken(new MockHttpServletRequest())).isEmpty();
    }

    private static List<String> setCookies(HttpHeaders headers) {
        return headers.get(HttpHeaders.SET_COOKIE);
    }

    /** Everything after {@code name=value}, e.g. {@code Path=/}, {@code HttpOnly}. */
    private static Set<String> attributes(String setCookie) {
        return Arrays.stream(setCookie.split("; ")).skip(1).collect(Collectors.toSet());
    }
}
