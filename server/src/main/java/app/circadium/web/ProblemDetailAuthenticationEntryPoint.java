package app.circadium.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.AuthenticationEntryPoint;

/**
 * The 401 the security chain answers with, as the ProblemDetail the rest of the API speaks. Spring's bearer
 * entry point runs first so {@code WWW-Authenticate} keeps the OAuth2 error details; the default leaves the
 * body empty.
 */
public class ProblemDetailAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final BearerTokenAuthenticationEntryPoint bearerDetails = new BearerTokenAuthenticationEntryPoint();

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        bearerDetails.commence(request, response, authException);
        FilterProblemResponses.write(request, response, HttpStatus.UNAUTHORIZED, "Authentication required.");
    }
}
