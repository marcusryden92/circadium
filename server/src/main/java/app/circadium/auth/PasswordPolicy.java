package app.circadium.auth;

import app.circadium.external.passwords.BreachedPasswords;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Rules for a new password, shared by registration, reset and change. Bean Validation on the request DTOs rejects
 * the plainly short ones with a field error; this class holds what character counts cannot express: the length
 * after runs of spaces are collapsed, the bcrypt byte ceiling, and breached passwords. Composition rules (a digit,
 * a symbol) are deliberately absent: they push people toward predictable patterns, not stronger passwords.
 *
 * <p>Passwords set before these rules (6+ characters) still sign in; only setting one applies them.
 */
@Component
@RequiredArgsConstructor
class PasswordPolicy {

    static final int MIN_LENGTH = 12;

    /** bcrypt only reads the first 72 bytes; longer passwords would silently share a hash. */
    static final int MAX_BYTES = 72;

    private final BreachedPasswords breachedPasswords;

    static boolean fitsBcrypt(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES;
    }

    /** Characters (code points), with every run of spaces counted as one, so padding cannot reach the minimum. */
    static int length(String password) {
        String collapsed = password.replaceAll(" {2,}", " ");
        return collapsed.codePointCount(0, collapsed.length());
    }

    void requireValidNewPassword(String password) {
        if (length(password) < MIN_LENGTH) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "password_too_short",
                    "Use at least 12 characters. A few unrelated words make a long password that is easy to remember.");
        }
        if (!fitsBcrypt(password)) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "password_too_long",
                    "Password must be at most 72 bytes.");
        }
        if (breachedPasswords.isBreached(password)) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "password_breached",
                    "This password has appeared in a data breach, so attackers try it early. Choose a different one.");
        }
    }
}
