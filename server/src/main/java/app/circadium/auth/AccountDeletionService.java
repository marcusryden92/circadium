package app.circadium.auth;

import app.circadium.external.analytics.AnalyticsEraser;
import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.AccountDeletionToken;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.AccountDeletionTokenRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Two-step account deletion, ported from the web app's {@code actions/deleteAccount.ts}. The request step
 * re-checks the password and emails a link; nothing is deleted until that link is confirmed from a session
 * of the same account, so neither a stolen session nor an intercepted email alone can erase an account.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountDeletionService {

    private final UserRepository userRepository;
    private final AccountDeletionTokenRepository accountDeletionTokenRepository;
    private final AccountTokens accountTokens;
    private final AccountMailer accountMailer;
    private final AnalyticsEraser analyticsEraser;
    private final PasswordEncoder passwordEncoder;
    private final LoginThrottle loginThrottle;
    private final AuditLogger auditLogger;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    /**
     * A wrong password counts toward the same lockout as a failed login, so an access token cannot be used
     * to guess the password here instead.
     */
    public void requestDeletion(String userId, String confirmEmail, String password, ClientInfo client) {
        User user = userRepository.findById(userId).orElseThrow(AccountDeletionService::accountGone);
        String email = user.getEmail();
        String key = email == null ? null : CredentialsAuthService.normalize(email);
        if (key == null || !key.equals(CredentialsAuthService.normalize(confirmEmail))) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "email_mismatch",
                    "The email address doesn't match this account.");
        }

        if (user.getPassword() != null) {
            Optional<Duration> lock = loginThrottle.remainingLock(key);
            if (lock.isPresent()) {
                auditLogger.record(AuditEvent.ACCOUNT_DELETION_DENIED, user.getId(), key, client, "locked");
                throw new TooManyAttemptsException(lock.get());
            }
            if (password == null || password.isEmpty()) {
                throw new AccountFlowException(HttpStatus.BAD_REQUEST, "password_required", "Password is required.");
            }
            if (!PasswordPolicy.fitsBcrypt(password) || !passwordEncoder.matches(password, user.getPassword())) {
                auditLogger.record(AuditEvent.ACCOUNT_DELETION_DENIED, user.getId(), key, client, "bad_password");
                loginThrottle.recordFailure(key).ifPresent(duration ->
                        auditLogger.record(AuditEvent.ACCOUNT_LOCKED, user.getId(), key, client, "lock=" + duration));
                throw new AccountFlowException(HttpStatus.FORBIDDEN, "bad_password", "Incorrect password.");
            }
            loginThrottle.recordSuccess(key);
        }

        String token = accountTokens.issueAccountDeletionToken(user.getId());
        accountMailer.sendAccountDeletionEmail(email, token);
        auditLogger.record(AuditEvent.ACCOUNT_DELETION_REQUESTED, user.getId(), key, client, null);
    }

    /**
     * Deletes the account. Most data goes through the {@code ON DELETE CASCADE} foreign keys on
     * {@code users}; the statements before the final delete cover the tables that have no such key.
     *
     * <p>The audit row is written after the commit and without a user id: {@code audit_log} rows cascade with
     * their user, and a row naming the user being deleted would wait on the delete's own lock.
     *
     * <p>The analytics person is erased after the commit too, so a rolled-back deletion keeps it, and in the
     * background, so the response does not wait on the analytics service.
     */
    public void confirmDeletion(String userId, String rawToken, ClientInfo client) {
        AccountDeletionToken token = accountDeletionTokenRepository.findByToken(rawToken)
                .orElseThrow(AccountFlowException::invalidLink);
        if (!token.getUserId().equals(userId)) {
            auditLogger.record(AuditEvent.ACCOUNT_DELETION_DENIED, userId, null, client, "wrong_account");
            throw new AccountFlowException(HttpStatus.FORBIDDEN, "wrong_account",
                    "This confirmation link belongs to a different account. Sign in as that account to confirm.");
        }
        if (!token.getExpires().isAfter(DbTime.now(clock))) {
            throw AccountFlowException.expiredLink();
        }
        User user = userRepository.findById(userId).orElseThrow(AccountDeletionService::accountGone);

        transactionTemplate.executeWithoutResult(status -> {
            if (accountDeletionTokenRepository.deleteByToken(rawToken) != 1) {
                throw AccountFlowException.invalidLink();
            }
            erase(user);
        });

        log.info("Deleted account {}", user.getId());
        auditLogger.record(AuditEvent.ACCOUNT_DELETED, null, null, client, "user=" + user.getId());
        analyticsEraser.erasePerson(user.getId());
    }

    private void erase(User user) {
        jdbcTemplate.update("delete from \"UserSchedulingPreferences\" where \"userId\" = ?", user.getId());
        if (user.getEmail() != null) {
            String key = CredentialsAuthService.normalize(user.getEmail());
            // Keyed by email with no foreign key; lower() also catches tokens issued under the typed casing.
            jdbcTemplate.update("delete from \"VerificationToken\" where lower(email) = ?", key);
            jdbcTemplate.update("delete from \"PasswordResetToken\" where lower(email) = ?", key);
            jdbcTemplate.update("delete from \"TwoFactorToken\" where lower(email) = ?", key);
            jdbcTemplate.update("delete from auth_lockouts where \"key\" = ?", key);
        }
        jdbcTemplate.update("delete from users where id = ?", user.getId());
    }

    private static AccountFlowException accountGone() {
        return new AccountFlowException(HttpStatus.UNAUTHORIZED, "account_not_found", "This account no longer exists.");
    }
}
