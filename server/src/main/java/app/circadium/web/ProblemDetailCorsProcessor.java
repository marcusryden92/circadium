package app.circadium.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.cors.DefaultCorsProcessor;

/**
 * {@link DefaultCorsProcessor} rejects with a bare 403; this adds the ProblemDetail body the API speaks
 * everywhere else, so a misconfigured origin shows up as a readable error instead of an empty response.
 */
public class ProblemDetailCorsProcessor extends DefaultCorsProcessor {

    @Override
    protected void rejectRequest(ServerHttpResponse response) throws IOException {
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        response.getBody().write(FilterProblemResponses
                .problemJson(HttpStatus.FORBIDDEN, "Origin is not allowed.", null)
                .getBytes(StandardCharsets.UTF_8));
        response.flush();
    }
}
