package app.circadium.auth;

import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** 429 with {@code Retry-After}, for an account lockout. */
public class TooManyAttemptsException extends ErrorResponseException {

    public TooManyAttemptsException(Duration retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS,
                ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many failed attempts. Try again later."),
                null);
        getHeaders().set(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds(retryAfter)));
    }

    static long retryAfterSeconds(Duration retryAfter) {
        return Math.max(1, (retryAfter.toMillis() + 999) / 1000);
    }
}
