package app.circadium.auth.oauth;

import app.circadium.web.CorrelationIdFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Checks the start of a sign-in, {@code GET /oauth2/authorization/google?client=web&challenge=...}, before Spring
 * builds the redirect to Google, and remembers who asked.
 *
 * <p>{@code challenge} is the base64url SHA-256 of a random verifier the client keeps to itself. The handoff code
 * issued at the end can only be redeemed with that verifier, so a code that leaks (browser history, a log, another
 * app catching the mobile redirect) is useless, and nobody can make a victim's browser finish a sign-in that the
 * attacker started.
 *
 * <p>Starting always replaces any session the browser had, so only its most recent sign-in can complete.
 */
public final class OAuthStartFilter extends OncePerRequestFilter {

    static final String START_PATH_PREFIX = "/oauth2/authorization/";

    /** 32 bytes of SHA-256, base64url without padding. */
    private static final Pattern CHALLENGE = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final ClientRegistrationRepository registrations;

    public OAuthStartFilter(ClientRegistrationRepository registrations) {
        this.registrations = registrations;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(START_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!"GET".equals(request.getMethod())) {
            response.setHeader(HttpHeaders.ALLOW, "GET");
            reject(response, HttpStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Start a sign-in with GET.");
            return;
        }
        String registrationId = request.getRequestURI().substring(START_PATH_PREFIX.length());
        if (registrations.findByRegistrationId(registrationId) == null) {
            reject(response, HttpStatus.NOT_FOUND, "unknown_provider", "This sign-in provider is not available.");
            return;
        }
        Optional<OAuthClient> client = OAuthClient.fromParameter(request.getParameter("client"));
        String challenge = request.getParameter("challenge");
        if (client.isEmpty() || challenge == null || !CHALLENGE.matcher(challenge).matches()) {
            reject(response, HttpStatus.BAD_REQUEST, "invalid_request",
                    "client must be web or mobile, and challenge the base64url SHA-256 of the client's verifier.");
            return;
        }

        HttpSession previous = request.getSession(false);
        if (previous != null) {
            previous.invalidate();
        }
        new PendingOAuthLogin(client.get(), challenge).store(request);
        chain.doFilter(request, response);
    }

    /**
     * Written by hand because this runs outside Spring MVC. Every interpolated value is a fixed string, a number,
     * or the request id the correlation filter already validated, so nothing needs escaping.
     */
    private static void reject(HttpServletResponse response, HttpStatus status, String code, String detail)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("""
                {"title":"%s","status":%d,"detail":"%s","code":"%s","requestId":"%s"}""".formatted(
                status.getReasonPhrase(), status.value(), detail, code, MDC.get(CorrelationIdFilter.MDC_KEY)));
    }
}
