package app.circadium.auth;

import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.PasswordResetToken;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.PasswordResetTokenRepository;
import app.circadium.persistence.repository.UserRepository;
import app.circadium.persistence.repository.VerificationTokenRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Forgotten-password flow, ported from the web app's {@code actions/reset.ts} and {@code newPassword.ts}.
 *
 * <p>Audit rows and mail happen after the transaction commits, so nothing is announced for a change that
 * rolled back.
 */
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final VerificationTokenRepository verificationTokenRepository;
    private final AccountTokens accountTokens;
    private final AccountMailer accountMailer;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final TokenService tokenService;
    private final LoginThrottle loginThrottle;
    private final AuditLogger auditLogger;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    /**
     * Behaves the same whether or not the account exists, so the endpoint cannot be used to discover
     * registered emails. Accounts without a password (OAuth-only) get nothing: this flow must not mint a
     * password for an account that never had one.
     */
    public void requestReset(String email, ClientInfo client) {
        String key = CredentialsAuthService.normalize(email);
        Optional<User> found = userRepository.findFirstByEmailIgnoreCase(key)
                .filter(user -> user.getPassword() != null);
        if (found.isEmpty()) {
            auditLogger.record(AuditEvent.PASSWORD_RESET_REQUESTED, null, key, client, "unknown_account");
            return;
        }
        User user = found.get();
        // The stored casing, not the typed one: the web app looks the token's email up case-sensitively.
        Optional<String> token = accountTokens.issuePasswordResetToken(user.getEmail());
        if (token.isEmpty()) {
            auditLogger.record(AuditEvent.PASSWORD_RESET_REQUESTED, user.getId(), key, client, "cooldown");
            return;
        }
        accountMailer.sendPasswordResetEmail(user.getEmail(), token.get());
        auditLogger.record(AuditEvent.PASSWORD_RESET_REQUESTED, user.getId(), key, client, null);
    }

    /**
     * Sets the new password, signs out every device, cancels a pending email change, and lifts any lockout:
     * following the emailed link proves control of the address, and a reset is usually done because someone else
     * may hold a session (and may have asked to move the account to their own address).
     */
    public void resetPassword(String rawToken, String newPassword, ClientInfo client) {
        passwordPolicy.requireValidNewPassword(newPassword);
        String tokenHash = TokenHashing.sha256Hex(rawToken);
        PasswordResetToken token = passwordResetTokenRepository.findByToken(tokenHash)
                .orElseThrow(AccountFlowException::invalidLink);
        Instant now = DbTime.now(clock);
        if (!token.getExpires().isAfter(now)) {
            throw AccountFlowException.expiredLink();
        }
        User user = userRepository.findFirstByEmailIgnoreCase(token.getEmail())
                .orElseThrow(AccountFlowException::invalidLink);
        String hash = passwordEncoder.encode(newPassword);

        transactionTemplate.executeWithoutResult(status -> {
            if (passwordResetTokenRepository.deleteByToken(tokenHash) != 1) {
                throw AccountFlowException.invalidLink();
            }
            passwordResetTokenRepository.deleteAllByEmail(token.getEmail());
            userRepository.updatePassword(user.getId(), hash, now);
            tokenService.revokeAllSessions(user.getId());
            verificationTokenRepository.deleteAllByUserId(user.getId());
        });

        String key = CredentialsAuthService.normalize(user.getEmail());
        loginThrottle.recordSuccess(key);
        accountMailer.sendPasswordChangedNotice(user.getEmail());
        auditLogger.record(AuditEvent.PASSWORD_RESET, user.getId(), key, client, null);
    }
}
