package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.Session;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.SessionRepository;
import app.circadium.persistence.repository.UserRepository;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class TokenServiceIntegrationTest {

    @Autowired
    TokenService tokenService;

    @Autowired
    SessionRepository sessionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    JwtDecoder jwtDecoder;

    @Autowired
    SigningKeys signingKeys;

    @Autowired
    AuthProperties properties;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void startSessionIssuesVerifiableAccessTokenAndStoresOnlyTheHash() {
        User user = newUser(UserRole.ADMIN);

        IssuedTokens tokens = tokenService.startSession(user, "JUnit");

        Jwt jwt = jwtDecoder.decode(tokens.accessToken());
        assertThat(jwt.getSubject()).isEqualTo(user.getId());
        assertThat(jwt.getAudience()).containsExactly("circadium-api");
        assertThat(jwt.getClaimAsString("role")).isEqualTo("ADMIN");
        assertThat(jwt.getHeaders()).containsEntry("kid", signingKeys.activeKeyId());
        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt())).isEqualTo(properties.accessTokenTtl());

        Session stored = sessionRepository.findByTokenHash(TokenService.hashRefreshToken(tokens.refreshToken()))
                .orElseThrow();
        assertThat(stored.getTokenHash()).isNotEqualTo(tokens.refreshToken());
        assertThat(stored.getFamilyId()).isEqualTo(jwt.getClaimAsString("sid"));
        assertThat(stored.getDeviceName()).isEqualTo("JUnit");
        assertThat(stored.getExpiresAt()).isEqualTo(tokens.refreshTokenExpiresAt());
    }

    @Test
    void refreshRotatesWithinTheSameFamily() {
        User user = newUser(UserRole.USER);
        IssuedTokens first = tokenService.startSession(user, null);

        IssuedTokens second = tokenService.refresh(first.refreshToken(), ClientInfo.UNKNOWN);

        assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
        Session old = findSession(first);
        Session current = findSession(second);
        assertThat(old.getReplacedBy()).isEqualTo(current.getId());
        assertThat(current.getFamilyId()).isEqualTo(old.getFamilyId());
        assertThat(current.getReplacedBy()).isNull();
        assertThat(jwtDecoder.decode(second.accessToken()).getSubject()).isEqualTo(user.getId());
    }

    /** Daily use cannot keep a sign-in alive forever: rotation hands on the expiry the sign-in started with. */
    @Test
    void refreshKeepsTheSignInsOriginalExpiry() {
        IssuedTokens first = tokenService.startSession(newUser(UserRole.USER), null);

        IssuedTokens second = tokenService.refresh(first.refreshToken(), ClientInfo.UNKNOWN);
        IssuedTokens third = tokenService.refresh(second.refreshToken(), ClientInfo.UNKNOWN);

        assertThat(second.refreshTokenExpiresAt()).isEqualTo(first.refreshTokenExpiresAt());
        assertThat(third.refreshTokenExpiresAt()).isEqualTo(first.refreshTokenExpiresAt());
        assertThat(findSession(third).getExpiresAt()).isEqualTo(first.refreshTokenExpiresAt());
    }

    @Test
    void aTwoFactorSignInKeepsItsMfaMethodThroughRotation() {
        User user = newUser(UserRole.ADMIN);
        IssuedTokens verified = tokenService.startSession(user, null, true);
        IssuedTokens plain = tokenService.startSession(user, null);

        Jwt rotated = jwtDecoder.decode(tokenService.refresh(verified.refreshToken(), ClientInfo.UNKNOWN).accessToken());

        assertThat(TokenService.isTwoFactorVerified(jwtDecoder.decode(verified.accessToken()))).isTrue();
        assertThat(TokenService.isTwoFactorVerified(rotated)).isTrue();
        assertThat(jwtDecoder.decode(plain.accessToken()).getClaims()).doesNotContainKey("amr");
    }

    /** The access token is otherwise still within its 15 minutes; ending the sign-in must end it too. */
    @Test
    void anAccessTokenStopsVerifyingOnceItsSignInEnds() {
        User user = newUser(UserRole.USER);
        IssuedTokens loggedOut = tokenService.startSession(user, null);
        IssuedTokens passwordChanged = tokenService.startSession(user, null);
        IssuedTokens otherDevice = tokenService.startSession(newUser(UserRole.USER), null);

        tokenService.logout(loggedOut.refreshToken(), ClientInfo.UNKNOWN);
        assertThatThrownBy(() -> jwtDecoder.decode(loggedOut.accessToken())).isInstanceOf(JwtValidationException.class);
        assertThat(jwtDecoder.decode(passwordChanged.accessToken()).getSubject()).isEqualTo(user.getId());

        tokenService.revokeAllSessions(user.getId());
        assertThatThrownBy(() -> jwtDecoder.decode(passwordChanged.accessToken()))
                .isInstanceOf(JwtValidationException.class);
        assertThat(jwtDecoder.decode(otherDevice.accessToken()).getSubject()).isNotEqualTo(user.getId());
    }

    @Test
    void reusingARotatedTokenRevokesTheWholeFamilyButNotOtherDevices() {
        User user = newUser(UserRole.USER);
        IssuedTokens first = tokenService.startSession(user, "phone");
        IssuedTokens otherDevice = tokenService.startSession(user, "laptop");
        IssuedTokens second = tokenService.refresh(first.refreshToken(), ClientInfo.UNKNOWN);
        String familyId = findSession(second).getFamilyId();

        assertThatThrownBy(() -> tokenService.refresh(first.refreshToken(), ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);

        assertThat(sessionRepository.countByFamilyId(familyId)).isZero();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .containsExactly(tuple("REFRESH_TOKEN_REUSE", "family=" + familyId + " revoked=2"));
        assertThatThrownBy(() -> tokenService.refresh(second.refreshToken(), ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThat(tokenService.refresh(otherDevice.refreshToken(), ClientInfo.UNKNOWN).refreshToken()).isNotBlank();
    }

    @Test
    void expiredRefreshTokenIsRejected() {
        IssuedTokens tokens = tokenService.startSession(newUser(UserRole.USER), null);
        Session session = findSession(tokens);
        session.setExpiresAt(Instant.now().minusSeconds(60));
        sessionRepository.saveAndFlush(session);

        assertThatThrownBy(() -> tokenService.refresh(tokens.refreshToken(), ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void unknownRefreshTokenIsRejected() {
        assertThatThrownBy(() -> tokenService.refresh("never-issued", ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void logoutRevokesTheFamily() {
        User user = newUser(UserRole.USER);
        IssuedTokens tokens = tokenService.startSession(user, null);
        String familyId = findSession(tokens).getFamilyId();

        tokenService.logout(tokens.refreshToken(), new ClientInfo("10.0.0.9", "JUnit"));

        assertThat(sessionRepository.countByFamilyId(familyId)).isZero();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()))
                .extracting(AuditLog::getEvent, AuditLog::getIpAddress)
                .containsExactly(tuple("LOGOUT", "10.0.0.9"));
        assertThatThrownBy(() -> tokenService.refresh(tokens.refreshToken(), ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);
        tokenService.logout(tokens.refreshToken(), ClientInfo.UNKNOWN);
    }

    /**
     * A password change or reset holds the user row from its update until it commits. A refresh that arrives
     * in between must wait, then find its token gone; rotating anyway would insert a session the change's
     * delete cannot see, and that token would survive the change.
     */
    @Test
    void refreshWaitsForAPasswordChangeInProgressAndThenFindsItsTokenGone() throws Exception {
        User user = newUser(UserRole.USER);
        IssuedTokens tokens = tokenService.startSession(user, null);

        try (Connection change = dataSource.getConnection()) {
            change.setAutoCommit(false);
            execute(change, "update users set password_changed_at = now() where id = ?", user.getId());

            CompletableFuture<IssuedTokens> refresh = CompletableFuture.supplyAsync(
                    () -> tokenService.refresh(tokens.refreshToken(), ClientInfo.UNKNOWN));
            awaitATransactionWaitingForALock();
            assertThat(refresh).isNotDone();

            execute(change, "delete from sessions where \"userId\" = ?", user.getId());
            change.commit();

            assertThatThrownBy(refresh::join).hasCauseInstanceOf(InvalidRefreshTokenException.class);
        }
        assertThat(jdbcTemplate.queryForObject("select count(*) from sessions where \"userId\" = ?",
                Integer.class, user.getId())).isZero();
    }

    private static void execute(Connection connection, String sql, String parameter) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, parameter);
            statement.executeUpdate();
        }
    }

    private void awaitATransactionWaitingForALock() throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        while (System.nanoTime() < deadline) {
            Integer waiting = jdbcTemplate.queryForObject("""
                    select count(*) from pg_stat_activity
                    where wait_event_type = 'Lock' and datname = current_database()""", Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("The refresh never waited for the password change's lock on the user row");
    }

    private Session findSession(IssuedTokens tokens) {
        return sessionRepository.findByTokenHash(TokenService.hashRefreshToken(tokens.refreshToken())).orElseThrow();
    }

    private User newUser(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setRole(role);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }
}
