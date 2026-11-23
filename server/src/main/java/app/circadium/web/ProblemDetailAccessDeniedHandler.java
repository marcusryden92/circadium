package app.circadium.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.web.access.AccessDeniedHandler;

/**
 * The 403 the security chain answers with, as the ProblemDetail the rest of the API speaks. Spring's bearer
 * handler runs first so {@code WWW-Authenticate} keeps the OAuth2 error details; the default leaves the body
 * empty.
 */
public class ProblemDetailAccessDeniedHandler implements AccessDeniedHandler {

    private final BearerTokenAccessDeniedHandler bearerDetails = new BearerTokenAccessDeniedHandler();

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        bearerDetails.handle(request, response, accessDeniedException);
        FilterProblemResponses.write(request, response, HttpStatus.FORBIDDEN, "Access denied.");
    }
}
