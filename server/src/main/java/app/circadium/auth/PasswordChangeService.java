package app.circadium.auth;

import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Changing the password from a signed-in session.
 *
 * <p>Every session ends, the caller's included, and the caller gets a new one in the same transaction. So the
 * only tokens that outlive the change are the ones handed back to whoever just proved they know the password,
 * and the new access token is issued after {@code passwordChangedAt}, which the web app requires.
 *
 * <p>A wrong current password counts toward the same lockout as a failed login, so a stolen access token cannot
 * be used to guess the password here instead. Audit rows and mail happen after the commit.
 */
@Service
@RequiredArgsConstructor
public class PasswordChangeService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final LoginThrottle loginThrottle;
    private final AccountMailer accountMailer;
    private final AuditLogger auditLogger;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public IssuedTokens changePassword(String userId, String currentPassword, String newPassword,
            ClientInfo client) {
        PasswordPolicy.requireValidNewPassword(newPassword);
        User user = userRepository.findById(userId).orElseThrow(PasswordChangeService::accountGone);
        if (user.getPassword() == null || user.getEmail() == null) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "no_password",
                    "This account signs in without a password, so there is none to change.");
        }
        String key = CredentialsAuthService.normalize(user.getEmail());

        Optional<Duration> lock = loginThrottle.remainingLock(key);
        if (lock.isPresent()) {
            auditLogger.record(AuditEvent.PASSWORD_CHANGE_DENIED, user.getId(), key, client, "locked");
            throw new TooManyAttemptsException(lock.get());
        }
        if (!PasswordPolicy.fitsBcrypt(currentPassword)
                || !passwordEncoder.matches(currentPassword, user.getPassword())) {
            auditLogger.record(AuditEvent.PASSWORD_CHANGE_DENIED, user.getId(), key, client, "bad_password");
            loginThrottle.recordFailure(key).ifPresent(duration ->
                    auditLogger.record(AuditEvent.ACCOUNT_LOCKED, user.getId(), key, client, "lock=" + duration));
            throw new AccountFlowException(HttpStatus.FORBIDDEN, "bad_password", "Incorrect password.");
        }

        String hash = passwordEncoder.encode(newPassword);
        Instant now = DbTime.now(clock);
        IssuedTokens tokens = transactionTemplate.execute(status -> {
            if (userRepository.updatePassword(user.getId(), hash, now) != 1) {
                throw accountGone();
            }
            tokenService.revokeAllSessions(user.getId());
            return tokenService.startSession(user, client.userAgent());
        });

        loginThrottle.recordSuccess(key);
        accountMailer.sendPasswordChangedNotice(user.getEmail());
        auditLogger.record(AuditEvent.PASSWORD_CHANGED, user.getId(), key, client, null);
        return tokens;
    }

    private static AccountFlowException accountGone() {
        return new AccountFlowException(HttpStatus.UNAUTHORIZED, "account_not_found", "This account no longer exists.");
    }
}
