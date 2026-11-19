package app.circadium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * One response for unknown, expired, revoked, and replayed tokens alike, so a caller probing with a
 * stolen token learns nothing about which case it hit.
 */
public class InvalidRefreshTokenException extends ErrorResponseException {

    public InvalidRefreshTokenException() {
        super(HttpStatus.UNAUTHORIZED,
                ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED,
                        "The refresh token is invalid, expired, or revoked."),
                null);
    }
}
