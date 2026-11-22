package app.circadium.auth.oauth;

import app.circadium.auth.oauth.OAuthAccountService.ProviderIdentity;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.OAuthPendingSignup;
import app.circadium.persistence.repository.OAuthPendingSignupRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Sign-ups waiting for their emailed link: 256 random bits per link, stored only as a SHA-256 hash, valid for an
 * hour (the lifetime of every other emailed verification link), one per provider account.
 */
@Component
@RequiredArgsConstructor
public class OAuthPendingSignups {

    static final Duration TTL = Duration.ofHours(1);

    /** Another sign-in within this window sends no new mail, so the flow cannot flood an inbox. */
    static final Duration RESEND_COOLDOWN = Duration.ofMinutes(1);

    static final String UNKNOWN_LINK = "unknown_link";
    static final String EXPIRED_LINK = "expired_link";

    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();

    private final OAuthPendingSignupRepository repository;
    private final Clock clock;

    public sealed interface Taken {
        record Found(OAuthPendingSignup signup) implements Taken {}

        /** @param reason for the audit log; the client is only told the link is invalid or expired */
        record Rejected(String reason) implements Taken {}
    }

    /**
     * Replaces any earlier pending sign-up for the same provider account, so only the newest link works. Empty when
     * one was issued within {@link #RESEND_COOLDOWN}: that link still works, and no second mail goes out. Also
     * sweeps expired rows, which keeps the table small without a scheduled job.
     *
     * @param email the address the link is sent to, already normalized
     */
    @Transactional
    public Optional<String> issue(ProviderIdentity identity, String email) {
        Instant now = DbTime.now(clock);
        repository.deleteAllExpiredBefore(now);
        Optional<OAuthPendingSignup> existing =
                repository.findByProviderAndSubject(identity.provider(), identity.subject());
        if (existing.isPresent() && existing.get().getCreatedAt().isAfter(now.minus(RESEND_COOLDOWN))
                && existing.get().getEmail().equals(email)) {
            return Optional.empty();
        }
        repository.deleteByProviderAndSubject(identity.provider(), identity.subject());

        byte[] bytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String token = BASE64URL.encodeToString(bytes);

        OAuthPendingSignup row = new OAuthPendingSignup();
        row.setTokenHash(OAuthHandoffCodes.sha256Hex(token));
        row.setProvider(identity.provider());
        row.setSubject(identity.subject());
        row.setEmail(email);
        row.setName(StringUtils.hasText(identity.name()) ? identity.name().strip() : null);
        row.setImage(identity.picture());
        row.setCreatedAt(now);
        row.setExpiresAt(now.plus(TTL));
        repository.saveAndFlush(row);
        return Optional.of(token);
    }

    /**
     * Removes the pending sign-up the link names and returns it. Like a handoff code, the link is spent by its
     * first use whatever happens next, and the delete must report one row, so a link opened twice at once creates
     * one account.
     */
    @Transactional
    public Taken take(String token) {
        String hash = OAuthHandoffCodes.sha256Hex(token);
        Optional<OAuthPendingSignup> stored = repository.findById(hash);
        if (stored.isEmpty() || repository.deleteByTokenHash(hash) != 1) {
            return new Taken.Rejected(UNKNOWN_LINK);
        }
        if (!stored.get().getExpiresAt().isAfter(DbTime.now(clock))) {
            return new Taken.Rejected(EXPIRED_LINK);
        }
        return new Taken.Found(stored.get());
    }
}
