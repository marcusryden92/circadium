package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Session;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.SessionRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

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

        IssuedTokens second = tokenService.refresh(first.refreshToken());

        assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
        Session old = findSession(first);
        Session current = findSession(second);
        assertThat(old.getReplacedBy()).isEqualTo(current.getId());
        assertThat(current.getFamilyId()).isEqualTo(old.getFamilyId());
        assertThat(current.getReplacedBy()).isNull();
        assertThat(jwtDecoder.decode(second.accessToken()).getSubject()).isEqualTo(user.getId());
    }

    @Test
    void reusingARotatedTokenRevokesTheWholeFamilyButNotOtherDevices() {
        User user = newUser(UserRole.USER);
        IssuedTokens first = tokenService.startSession(user, "phone");
        IssuedTokens otherDevice = tokenService.startSession(user, "laptop");
        IssuedTokens second = tokenService.refresh(first.refreshToken());
        String familyId = findSession(second).getFamilyId();

        assertThatThrownBy(() -> tokenService.refresh(first.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);

        assertThat(sessionRepository.countByFamilyId(familyId)).isZero();
        assertThatThrownBy(() -> tokenService.refresh(second.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThat(tokenService.refresh(otherDevice.refreshToken()).refreshToken()).isNotBlank();
    }

    @Test
    void expiredRefreshTokenIsRejected() {
        IssuedTokens tokens = tokenService.startSession(newUser(UserRole.USER), null);
        Session session = findSession(tokens);
        session.setExpiresAt(Instant.now().minusSeconds(60));
        sessionRepository.saveAndFlush(session);

        assertThatThrownBy(() -> tokenService.refresh(tokens.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void unknownRefreshTokenIsRejected() {
        assertThatThrownBy(() -> tokenService.refresh("never-issued"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void logoutRevokesTheFamily() {
        IssuedTokens tokens = tokenService.startSession(newUser(UserRole.USER), null);
        String familyId = findSession(tokens).getFamilyId();

        tokenService.logout(tokens.refreshToken());

        assertThat(sessionRepository.countByFamilyId(familyId)).isZero();
        assertThatThrownBy(() -> tokenService.refresh(tokens.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
        tokenService.logout(tokens.refreshToken());
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
