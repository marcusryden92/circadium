package app.circadium.auth;

import app.circadium.persistence.entity.User;
import java.time.Duration;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Re-checks the password of a signed-in account before a sensitive change. A wrong password counts toward the same
 * lockout as a failed sign-in, so a stolen access token cannot be used to guess the password through these
 * endpoints instead. The caller records the success, because some flows only count it once their change commits.
 */
@Component
@RequiredArgsConstructor
class CurrentPasswordCheck {

    private final PasswordEncoder passwordEncoder;
    private final LoginThrottle loginThrottle;
    private final AuditLogger auditLogger;

    /**
     * @param user an account with a password and an email
     * @param deniedEvent recorded for a locked account or a wrong password
     * @return the lockout key, for the caller's {@link LoginThrottle#recordSuccess}
     * @throws TooManyAttemptsException while the account is locked
     * @throws AccountFlowException 403 {@code bad_password}
     */
    String require(User user, String password, ClientInfo client, AuditEvent deniedEvent) {
        String key = CredentialsAuthService.normalize(user.getEmail());
        Optional<Duration> lock = loginThrottle.remainingLock(key);
        if (lock.isPresent()) {
            auditLogger.record(deniedEvent, user.getId(), key, client, "locked");
            throw new TooManyAttemptsException(lock.get());
        }
        if (password == null || !PasswordPolicy.fitsBcrypt(password)
                || !passwordEncoder.matches(password, user.getPassword())) {
            auditLogger.record(deniedEvent, user.getId(), key, client, "bad_password");
            loginThrottle.recordFailure(key).ifPresent(duration ->
                    auditLogger.record(AuditEvent.ACCOUNT_LOCKED, user.getId(), key, client, "lock=" + duration));
            throw new AccountFlowException(HttpStatus.FORBIDDEN, "bad_password", "Incorrect password.");
        }
        return key;
    }
}
