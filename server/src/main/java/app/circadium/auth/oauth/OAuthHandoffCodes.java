package app.circadium.auth.oauth;

import app.circadium.auth.ClientType;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.OAuthHandoffCode;
import app.circadium.persistence.repository.OAuthHandoffCodeRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * One-time codes that hand a finished sign-in to the client that started it: 256 random bits, valid for 60 seconds,
 * stored only as a SHA-256 hash, and bound to the client's challenge.
 */
@Component
@RequiredArgsConstructor
public class OAuthHandoffCodes {

    static final Duration TTL = Duration.ofSeconds(60);
    static final String UNKNOWN_CODE = "unknown_code";
    static final String EXPIRED_CODE = "expired_code";
    static final String BAD_VERIFIER = "bad_verifier";

    private static final int CODE_BYTES = 32;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();

    private final OAuthHandoffCodeRepository repository;
    private final Clock clock;

    public sealed interface Redemption {
        record Redeemed(String userId, ClientType client) implements Redemption {}

        /** @param reason for the audit log only; the client is told nothing more than "invalid code" */
        record Rejected(String reason) implements Redemption {}
    }

    /** Also sweeps expired codes, which keeps the table at a handful of rows without a scheduled job. */
    @Transactional
    public String issue(String userId, ClientType client, String challenge) {
        Instant now = DbTime.now(clock);
        repository.deleteAllExpiredBefore(now);

        byte[] bytes = new byte[CODE_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String code = BASE64URL.encodeToString(bytes);

        OAuthHandoffCode row = new OAuthHandoffCode();
        row.setCodeHash(sha256Hex(code));
        row.setUserId(userId);
        row.setChallenge(challenge);
        row.setClient(client.parameter());
        row.setExpiresAt(now.plus(TTL));
        repository.save(row);
        return code;
    }

    /**
     * The first attempt deletes the code whatever its outcome, so no code can be tried twice; a wrong verifier
     * spends it too. The delete must report one row, so of two concurrent redemptions only one can succeed.
     */
    @Transactional
    public Redemption redeem(String code, String verifier) {
        String hash = sha256Hex(code);
        Optional<OAuthHandoffCode> stored = repository.findById(hash);
        if (stored.isEmpty() || repository.deleteByCodeHash(hash) != 1) {
            return new Redemption.Rejected(UNKNOWN_CODE);
        }
        OAuthHandoffCode row = stored.get();
        if (!row.getExpiresAt().isAfter(DbTime.now(clock))) {
            return new Redemption.Rejected(EXPIRED_CODE);
        }
        boolean verifierMatches = MessageDigest.isEqual(
                s256(verifier).getBytes(StandardCharsets.US_ASCII),
                row.getChallenge().getBytes(StandardCharsets.US_ASCII));
        if (!verifierMatches) {
            return new Redemption.Rejected(BAD_VERIFIER);
        }
        return new Redemption.Redeemed(row.getUserId(), ClientType.fromParameter(row.getClient()).orElseThrow());
    }

    /** PKCE's S256 transform (RFC 7636): base64url of the SHA-256 of the verifier, without padding. */
    static String s256(String verifier) {
        return BASE64URL.encodeToString(sha256(verifier));
    }

    static String sha256Hex(String value) {
        return HexFormat.of().formatHex(sha256(value));
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
