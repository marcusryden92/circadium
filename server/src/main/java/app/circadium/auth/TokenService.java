package app.circadium.auth;

import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.Session;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.SessionRepository;
import app.circadium.persistence.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Issues short-lived RS256 access JWTs and opaque, rotated refresh tokens.
 *
 * <p>Only the SHA-256 hash of a refresh token is stored, so a leaked database cannot be replayed against
 * {@code /auth/refresh}. A plain (unsalted) hash is sufficient because the token is 256 random bits, not
 * a guessable secret like a password.
 *
 * <p>A sign-in lasts {@code refreshTokenTtl} from the moment it started: rotation hands the new refresh token
 * the old one's expiry, so an account in daily use still has to sign in again once that time is up.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {

    static final String ROLE_CLAIM = "role";
    static final String SESSION_FAMILY_CLAIM = "sid";

    /**
     * RFC 8176 authentication method references, present only on tokens of a sign-in that passed the emailed code
     * as well as the password. The web app's admin tools require {@value #MFA_METHOD}.
     */
    static final String AUTH_METHODS_CLAIM = "amr";
    static final String MFA_METHOD = "mfa";
    private static final List<String> TWO_FACTOR_METHODS = List.of("pwd", "otp", MFA_METHOD);

    private static final int REFRESH_TOKEN_BYTES = 32;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder TOKEN_ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final JwtEncoder jwtEncoder;
    private final SigningKeys signingKeys;
    private final AuthProperties properties;
    private final SessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final AuditLogger auditLogger;
    private final Clock clock;

    /** Starts a new session family for a sign-in that proved one factor. */
    @Transactional
    public IssuedTokens startSession(User user, String deviceName) {
        return startSession(user, deviceName, false);
    }

    /**
     * Starts a new session family; called by the login flows once a user is authenticated.
     *
     * @param twoFactorVerified the sign-in passed the emailed code too; carried through every rotation
     */
    @Transactional
    public IssuedTokens startSession(User user, String deviceName, boolean twoFactorVerified) {
        Instant now = now();
        NewSession refresh = createSession(user.getId(), UUID.randomUUID().toString(), deviceName, now,
                now.plus(properties.refreshTokenTtl()), twoFactorVerified);
        return issue(user, refresh, now);
    }

    /** True when the token belongs to a sign-in that passed the emailed code as well as the password. */
    public static boolean isTwoFactorVerified(Jwt jwt) {
        List<String> methods = jwt.getClaimAsStringList(AUTH_METHODS_CLAIM);
        return methods != null && methods.contains(MFA_METHOD);
    }

    /**
     * Rotates a refresh token. Presenting a token that was already rotated means two parties hold the
     * same chain (one of them stolen), so the whole family is revoked and both must log in again.
     *
     * <p>The user row is locked before the session row, in the same order as a password change or reset
     * (update the user, then delete the sessions). Locking only the session would let a refresh that started
     * first insert its new session after the change's delete began, out of that delete's sight, so the new
     * token would outlive the change. With the user locked first, the refresh either finishes before the
     * change starts, and its new session is deleted with the rest, or waits and then finds its token gone.
     *
     * <p>{@code noRollbackFor} keeps the family revocation committed even though the method then throws.
     */
    @Transactional(noRollbackFor = InvalidRefreshTokenException.class)
    public IssuedTokens refresh(String rawRefreshToken, ClientInfo client) {
        String tokenHash = hashRefreshToken(rawRefreshToken);
        User user = userRepository.findByRefreshTokenHashForShare(tokenHash)
                .orElseThrow(InvalidRefreshTokenException::new);
        Session current = sessionRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(InvalidRefreshTokenException::new);
        Instant now = now();

        if (current.getReplacedBy() != null) {
            int revoked = sessionRepository.deleteAllByFamilyId(current.getFamilyId());
            log.warn("Refresh token reuse detected; revoked session family {} ({} sessions) for user {}",
                    current.getFamilyId(), revoked, current.getUserId());
            auditLogger.record(AuditEvent.REFRESH_TOKEN_REUSE, current.getUserId(), null, client,
                    "family=" + current.getFamilyId() + " revoked=" + revoked);
            throw new InvalidRefreshTokenException();
        }
        if (!current.getExpiresAt().isAfter(now)) {
            throw new InvalidRefreshTokenException();
        }

        NewSession next = createSession(user.getId(), current.getFamilyId(), current.getDeviceName(), now,
                current.getExpiresAt(), current.isTwoFactorVerified());
        current.setReplacedBy(next.session().getId());
        current.setLastUsedAt(now);
        return issue(user, next, now);
    }

    /**
     * Revokes the family the token belongs to. Unknown tokens are ignored so logout is idempotent. Access
     * tokens already issued stay valid until they expire (at most one access-token lifetime).
     */
    @Transactional
    public void logout(String rawRefreshToken, ClientInfo client) {
        sessionRepository.findByTokenHash(hashRefreshToken(rawRefreshToken)).ifPresent(session -> {
            sessionRepository.deleteAllByFamilyId(session.getFamilyId());
            auditLogger.record(AuditEvent.LOGOUT, session.getUserId(), null, client, "family=" + session.getFamilyId());
        });
    }

    /**
     * Signs out every device; for password changes and account-level security events. Call it after updating
     * the user row in the same transaction (see {@link #refresh}).
     */
    @Transactional
    public void revokeAllSessions(String userId) {
        sessionRepository.deleteAllByUserId(userId);
    }

    static String hashRefreshToken(String rawRefreshToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(rawRefreshToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private IssuedTokens issue(User user, NewSession refresh, Instant now) {
        Instant accessExpiresAt = now.plus(properties.accessTokenTtl());
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256)
                .keyId(signingKeys.activeKeyId())
                .build();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(user.getId())
                .audience(List.of(properties.audience()))
                .issuedAt(now)
                .expiresAt(accessExpiresAt)
                .id(UUID.randomUUID().toString())
                .claim(ROLE_CLAIM, user.getRole().name())
                .claim(SESSION_FAMILY_CLAIM, refresh.session().getFamilyId());
        if (refresh.session().isTwoFactorVerified()) {
            claims.claim(AUTH_METHODS_CLAIM, TWO_FACTOR_METHODS);
        }
        String accessToken = jwtEncoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
        return new IssuedTokens(accessToken, accessExpiresAt, refresh.rawToken(), refresh.session().getExpiresAt());
    }

    private NewSession createSession(String userId, String familyId, String deviceName, Instant now,
            Instant expiresAt, boolean twoFactorVerified) {
        byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        String rawToken = TOKEN_ENCODER.encodeToString(bytes);

        Session session = new Session();
        session.setId(UUID.randomUUID().toString());
        session.setUserId(userId);
        session.setFamilyId(familyId);
        session.setTokenHash(hashRefreshToken(rawToken));
        session.setExpiresAt(expiresAt);
        session.setLastUsedAt(now);
        session.setCreatedAt(now);
        session.setDeviceName(deviceName);
        session.setTwoFactorVerified(twoFactorVerified);
        sessionRepository.save(session);
        return new NewSession(session, rawToken);
    }

    private Instant now() {
        return DbTime.now(clock);
    }

    private record NewSession(Session session, String rawToken) {}
}
