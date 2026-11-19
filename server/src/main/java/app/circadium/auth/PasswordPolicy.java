package app.circadium.auth;

import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Password rules shared by registration and reset. The 8-character minimum is enforced by Bean Validation on
 * the request DTOs; this class covers the byte limit, which character counts cannot express.
 */
final class PasswordPolicy {

    /** bcrypt only reads the first 72 bytes; longer passwords would silently share a hash. */
    static final int MAX_BYTES = 72;

    private PasswordPolicy() {}

    static boolean fitsBcrypt(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES;
    }

    static void requireValidNewPassword(String password) {
        if (!fitsBcrypt(password)) {
            throw new ErrorResponseException(HttpStatus.BAD_REQUEST, ProblemDetail.forStatusAndDetail(
                    HttpStatus.BAD_REQUEST, "Password must be at most 72 bytes."), null);
        }
    }
}
