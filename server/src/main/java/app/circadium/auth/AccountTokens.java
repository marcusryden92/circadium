package app.circadium.auth;

import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.TwoFactorToken;
import app.circadium.persistence.entity.VerificationToken;
import app.circadium.persistence.repository.TwoFactorTokenRepository;
import app.circadium.persistence.repository.VerificationTokenRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The email-delivered one-time tokens, ported from the web app's {@code lib/tokens.ts}: one outstanding
 * token per email (a new one replaces the old), 6-digit 2FA codes valid 5 minutes, and uuid verification
 * tokens valid 1 hour. Both tables store the raw value because the web app reads these tables too.
 */
@Component
@RequiredArgsConstructor
public class AccountTokens {

    static final Duration TWO_FACTOR_TTL = Duration.ofMinutes(5);
    static final Duration VERIFICATION_TTL = Duration.ofHours(1);
    private static final int MAX_CODE_ATTEMPTS = 5;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final TwoFactorTokenRepository twoFactorTokenRepository;
    private final VerificationTokenRepository verificationTokenRepository;
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
