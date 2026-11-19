package app.circadium.auth;

import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.AccountDeletionToken;
import app.circadium.persistence.entity.PasswordResetToken;
import app.circadium.persistence.entity.TwoFactorToken;
import app.circadium.persistence.entity.VerificationToken;
import app.circadium.persistence.repository.AccountDeletionTokenRepository;
import app.circadium.persistence.repository.PasswordResetTokenRepository;
import app.circadium.persistence.repository.TwoFactorTokenRepository;
import app.circadium.persistence.repository.VerificationTokenRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The email-delivered one-time tokens, ported from the web app's {@code lib/tokens.ts}: one outstanding
 * token per email (or per user, for deletion), where a new one replaces the old. 6-digit 2FA codes last
 * 5 minutes, uuid verification and password-reset tokens 1 hour, account-deletion tokens 30 minutes. All
 * tables store the raw value because the web app reads and consumes these tables too.
 */
@Component
@RequiredArgsConstructor
public class AccountTokens {

    static final Duration TWO_FACTOR_TTL = Duration.ofMinutes(5);
    static final Duration VERIFICATION_TTL = Duration.ofHours(1);
    static final Duration PASSWORD_RESET_TTL = Duration.ofHours(1);
    static final Duration ACCOUNT_DELETION_TTL = Duration.ofMinutes(30);
    static final Duration PASSWORD_RESET_COOLDOWN = Duration.ofMinutes(1);
    private static final int MAX_CODE_ATTEMPTS = 5;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final TwoFactorTokenRepository twoFactorTokenRepository;
    private final VerificationTokenRepository verificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final AccountDeletionTokenRepository accountDeletionTokenRepository;
    private final Clock clock;

    @Transactional
    public String issueTwoFactorCode(String email) {
        twoFactorTokenRepository.deleteAllByEmail(email);
        String code = uniqueCode();
        TwoFactorToken token = new TwoFactorToken();
        token.setId(UUID.randomUUID().toString());
        token.setEmail(email);
        token.setToken(code);
        token.setExpires(DbTime.now(clock).plus(TWO_FACTOR_TTL));
        twoFactorTokenRepository.save(token);
        return code;
    }

    /** Consumes the code if it matches and is unexpired; a used code can never be replayed. */
    @Transactional
    public boolean consumeTwoFactorCode(String email, String presentedCode) {
        Optional<TwoFactorToken> stored = twoFactorTokenRepository.findFirstByEmail(email);
        if (stored.isEmpty() || presentedCode == null) {
            return false;
        }
        TwoFactorToken token = stored.get();
        boolean matches = MessageDigest.isEqual(
                token.getToken().getBytes(StandardCharsets.UTF_8),
                presentedCode.getBytes(StandardCharsets.UTF_8));
        if (!matches || !token.getExpires().isAfter(DbTime.now(clock))) {
            return false;
        }
        twoFactorTokenRepository.delete(token);
        return true;
    }

    @Transactional
    public String issueVerificationToken(String email) {
        verificationTokenRepository.deleteAllByEmail(email);
        VerificationToken token = new VerificationToken();
        token.setId(UUID.randomUUID().toString());
        token.setEmail(email);
        token.setToken(UUID.randomUUID().toString());
        token.setExpires(DbTime.now(clock).plus(VERIFICATION_TTL));
        verificationTokenRepository.save(token);
        return token.getToken();
    }

    /**
     * Empty when a reset token for this address was issued within {@link #PASSWORD_RESET_COOLDOWN}, so the
     * public reset endpoint cannot be used to flood someone's inbox. The issue time is derived from the
     * expiry because the table has no creation timestamp and both apps use the same lifetime.
     */
    @Transactional
    public Optional<String> issuePasswordResetToken(String email) {
        Instant now = DbTime.now(clock);
        Optional<PasswordResetToken> existing = passwordResetTokenRepository.findFirstByEmail(email);
        if (existing.isPresent()) {
            Instant issuedAt = existing.get().getExpires().minus(PASSWORD_RESET_TTL);
            if (issuedAt.isAfter(now.minus(PASSWORD_RESET_COOLDOWN))) {
                return Optional.empty();
            }
        }
        passwordResetTokenRepository.deleteAllByEmail(email);
        PasswordResetToken token = new PasswordResetToken();
        token.setId(UUID.randomUUID().toString());
        token.setEmail(email);
        token.setToken(UUID.randomUUID().toString());
        token.setExpires(now.plus(PASSWORD_RESET_TTL));
        passwordResetTokenRepository.save(token);
        return Optional.of(token.getToken());
    }

    @Transactional
    public String issueAccountDeletionToken(String userId) {
        accountDeletionTokenRepository.deleteAllByUserId(userId);
        AccountDeletionToken token = new AccountDeletionToken();
        token.setId(UUID.randomUUID().toString());
        token.setUserId(userId);
        token.setToken(UUID.randomUUID().toString());
        token.setExpires(DbTime.now(clock).plus(ACCOUNT_DELETION_TTL));
        accountDeletionTokenRepository.save(token);
        return token.getToken();
    }

    /**
     * {@code TwoFactorToken.token} is globally unique, so two users handed the same 6 digits at once would
     * collide on insert; re-drawing on an existing value makes that practically impossible.
     */
    private String uniqueCode() {
        for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            String code = String.valueOf(100_000 + SECURE_RANDOM.nextInt(900_000));
            if (!twoFactorTokenRepository.existsByToken(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Could not allocate a unique two-factor code");
    }
}
