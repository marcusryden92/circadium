package app.circadium.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

/**
 * RFC 7807 bodies for rejections made in the filter chain (security, CORS), which run before the
 * DispatcherServlet and so never reach {@link GlobalExceptionHandler}. Serialized by hand: the fields are
 * fixed and few, and these paths must not depend on the MVC converter machinery they run outside of.
 */
public final class FilterProblemResponses {

    private FilterProblemResponses() {}

    public static void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status,
            String detail) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status.value());
        // Match the MVC ProblemDetail responses exactly: bare application/problem+json, no charset parameter.
        // Writing UTF-8 bytes (the JSON escapes any control char) keeps the header free of a charset suffix.
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getOutputStream().write(
                problemJson(status, detail, request.getRequestURI()).getBytes(StandardCharsets.UTF_8));
    }

    static String problemJson(HttpStatus status, String detail, String instance) {
        StringBuilder json = new StringBuilder("{\"type\":\"about:blank\"");
        json.append(",\"title\":\"").append(escape(status.getReasonPhrase())).append('"');
        json.append(",\"status\":").append(status.value());
        json.append(",\"detail\":\"").append(escape(detail)).append('"');
        if (instance != null) {
            json.append(",\"instance\":\"").append(escape(instance)).append('"');
        }
        String requestId = MDC.get(CorrelationIdFilter.MDC_KEY);
        if (requestId != null) {
            json.append(",\"requestId\":\"").append(escape(requestId)).append('"');
        }
        return json.append('}').toString();
    }

    private static String escape(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.toString();
    }
}
