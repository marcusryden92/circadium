package app.circadium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * One response for an unknown email, a wrong password, and a wrong or expired 2FA code, so the endpoint
 * cannot be used to learn which accounts exist.
 */
public class InvalidCredentialsException extends ErrorResponseException {

    public InvalidCredentialsException() {
        super(HttpStatus.UNAUTHORIZED,
                ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Invalid email, password, or code."),
                null);
    }
}
