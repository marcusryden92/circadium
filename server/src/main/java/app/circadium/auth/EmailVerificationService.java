package app.circadium.auth;

import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.entity.VerificationToken;
import app.circadium.persistence.repository.UserRepository;
import app.circadium.persistence.repository.VerificationTokenRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Consumes emailed verification links, ported from the web app's {@code actions/newVerificationAction.ts}.
 *
 * <p>Two kinds of token share the table. A registration token resolves its user by email. An email-change
 * token carries the {@code userId}, because the new address belongs to no user row yet; consuming it moves
 * the account to that address.
 *
 * <p>Audit rows are written after the transaction commits: they reference the user row, and an email change
 * holds a lock on that row that the audit logger's separate transaction would wait on forever.
 */
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    private final VerificationTokenRepository verificationTokenRepository;
    private final UserRepository userRepository;
    private final AuditLogger auditLogger;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public void verify(String rawToken, ClientInfo client) {
        VerificationToken token = verificationTokenRepository.findByToken(rawToken)
                .orElseThrow(AccountFlowException::invalidLink);
        Instant now = DbTime.now(clock);
        if (!token.getExpires().isAfter(now)) {
            throw AccountFlowException.expiredLink();
        }

        Optional<User> found = token.getUserId() != null
                ? userRepository.findById(token.getUserId())
                : userRepository.findFirstByEmailIgnoreCase(token.getEmail());
        User user = found.orElseThrow(AccountFlowException::invalidLink);

        // The address may have been claimed by another account between the request and the click.
        Optional<User> owner = userRepository.findFirstByEmailIgnoreCase(token.getEmail());
        if (owner.isPresent() && !owner.get().getId().equals(user.getId())) {
            throw emailInUse();
        }

        String previousEmail = user.getEmail();
        try {
            transactionTemplate.executeWithoutResult(status -> {
                if (verificationTokenRepository.deleteByToken(rawToken) != 1) {
                    throw AccountFlowException.invalidLink();
                }
                user.setEmail(token.getEmail());
                user.setEmailVerified(now);
                userRepository.saveAndFlush(user);
            });
        } catch (DataIntegrityViolationException concurrentClaim) {
            throw emailInUse();
        }

        String normalized = CredentialsAuthService.normalize(token.getEmail());
        boolean changed = previousEmail == null || !previousEmail.equalsIgnoreCase(token.getEmail());
        if (changed) {
            auditLogger.record(AuditEvent.EMAIL_CHANGED, user.getId(), normalized, client, null);
        }
        auditLogger.record(AuditEvent.EMAIL_VERIFIED, user.getId(), normalized, client, null);
    }

    private static AccountFlowException emailInUse() {
        return new AccountFlowException(HttpStatus.CONFLICT, "email_in_use",
                "This email address is already used by another account.");
    }
}
