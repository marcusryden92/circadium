package app.circadium.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Finds the access token on a request: the {@code Authorization: Bearer} header (mobile, tools) or, failing that,
 * the web app's access cookie.
 *
 * <p>The cookie is ignored on endpoints that need no authentication. Spring rejects a request carrying an invalid
 * token even where none is required, and browsers attach cookies on their own, so a stale access cookie would
 * otherwise make the web app's own sign-in and refresh calls fail with 401.
 */
public final class CookieBearerTokenResolver implements BearerTokenResolver {

    private final DefaultBearerTokenResolver headerResolver = new DefaultBearerTokenResolver();
    private final AuthCookies authCookies;
    private final RequestMatcher publicEndpoints;

    public CookieBearerTokenResolver(AuthCookies authCookies, RequestMatcher publicEndpoints) {
        this.authCookies = authCookies;
        this.publicEndpoints = publicEndpoints;
    }

    @Override
    public String resolve(HttpServletRequest request) {
        String fromHeader = headerResolver.resolve(request);
        if (fromHeader != null || publicEndpoints.matches(request)) {
            return fromHeader;
        }
        return authCookies.accessToken(request).orElse(null);
    }
}
