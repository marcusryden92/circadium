package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.RecordingAccountMailer.Kind;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.PasswordResetToken;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.entity.VerificationToken;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AccountDeletionTokenRepository;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.PasswordResetTokenRepository;
import app.circadium.persistence.repository.SessionRepository;
import app.circadium.persistence.repository.UserRepository;
import app.circadium.persistence.repository.VerificationTokenRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Plan item 1.7: email verification (registration and email change), password reset, and two-step account
 * deletion, driven through the HTTP endpoints with the mailed tokens a user would receive. Each test uses its
 * own client IP and emails so rate-limit buckets and lockout rows never leak between tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AccountFlowsIntegrationTest.MailConfig.class})
class AccountFlowsIntegrationTest {

    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

    @Autowired
    MockMvc mockMvc;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    VerificationTokenRepository verificationTokenRepository;

    @Autowired
    PasswordResetTokenRepository passwordResetTokenRepository;

    @Autowired
    AccountDeletionTokenRepository accountDeletionTokenRepository;

    @Autowired
    SessionRepository sessionRepository;

    @Autowired
    TokenService tokenService;

    @Autowired
    LoginThrottle loginThrottle;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    RecordingAccountMailer mailer;

    @TestConfiguration(proxyBeanMethods = false)
    static class MailConfig {
        @Bean
        @Primary
        RecordingAccountMailer recordingAccountMailer() {
            return new RecordingAccountMailer();
        }
    }

    @Test
    void registeredAccountVerifiesThroughTheMailedLinkAndCanThenLogIn() throws Exception {
        String email = uniqueEmail();
        String ip = nextIp();
        perform(ip, "/auth/register", """
                {"name":"New User","email":"%s","password":"a-good-password"}""".formatted(email))
                .andExpect(status().isAccepted());
        String token = mailer.latest(Kind.VERIFICATION, email).orElseThrow();

        perform(ip, "/auth/verify-email", tokenBody(token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.status").value("EMAIL_VERIFIED"));

        assertThat(userRepository.findFirstByEmailIgnoreCase(email).orElseThrow().getEmailVerified()).isNotNull();
        perform(ip, "/auth/login", """
                {"email":"%s","password":"a-good-password"}""".formatted(email))
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"));
        perform(ip, "/auth/verify-email", tokenBody(token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_token"));
        assertThat(events(email)).contains("REGISTER", "EMAIL_VERIFIED", "LOGIN_SUCCESS");
    }

    @Test
    void expiredVerificationLinkIsRejected() throws Exception {
        String email = uniqueEmail();
        saveUser(email, "password-1", false);
        VerificationToken token = saveVerificationToken(email, null, Instant.now().minusSeconds(1));

        perform(nextIp(), "/auth/verify-email", tokenBody(token.getToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("expired_token"));
        assertThat(userRepository.findFirstByEmailIgnoreCase(email).orElseThrow().getEmailVerified()).isNull();
    }

    @Test
    void emailChangeTokenMovesTheAccountToTheNewAddress() throws Exception {
        User user = saveUser(uniqueEmail(), "password-1", true);
        String newEmail = uniqueEmail();
        VerificationToken token = saveVerificationToken(newEmail, user.getId(), Instant.now().plusSeconds(600));

        perform(nextIp(), "/auth/verify-email", tokenBody(token.getToken())).andExpect(status().isOk());

        User updated = userRepository.findById(user.getId()).orElseThrow();
        assertThat(updated.getEmail()).isEqualTo(newEmail);
        assertThat(updated.getEmailVerified()).isAfter(user.getEmailVerified());
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()))
                .extracting(AuditLog::getEvent)
                .containsExactlyInAnyOrder("EMAIL_CHANGED", "EMAIL_VERIFIED");
    }

    @Test
    void emailChangeToAnAddressAnotherAccountOwnsConflicts() throws Exception {
        User user = saveUser(uniqueEmail(), "password-1", true);
        User other = saveUser(uniqueEmail(), "password-2", true);
        VerificationToken token = saveVerificationToken(other.getEmail(), user.getId(), Instant.now().plusSeconds(600));

        perform(nextIp(), "/auth/verify-email", tokenBody(token.getToken()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("email_in_use"));
        assertThat(userRepository.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(user.getEmail());
    }

    @Test
    void passwordResetReplacesThePasswordSignsOutEverywhereAndLiftsTheLockout() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password", true);
        IssuedTokens session = tokenService.startSession(user, "phone");
        String ip = nextIp();
        for (int attempt = 1; attempt <= 5; attempt++) {
            loginThrottle.recordFailure(email);
        }

        perform(ip, "/auth/password-reset", """
                {"email":"%s"}""".formatted(email.toUpperCase()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("RESET_EMAIL_SENT"));
        String token = mailer.latest(Kind.PASSWORD_RESET, email).orElseThrow();

        perform(ip, "/auth/password-reset/confirm", """
                {"token":"%s","password":"new-password"}""".formatted(token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PASSWORD_UPDATED"));

        User updated = userRepository.findById(user.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("new-password", updated.getPassword())).isTrue();
        assertThat(updated.getPasswordChangedAt()).isNotNull();
        assertThat(sessionRepository.findByTokenHash(TokenService.hashRefreshToken(session.refreshToken()))).isEmpty();
        assertThat(passwordResetTokenRepository.findFirstByEmail(email)).isEmpty();
        assertThat(mailer.count(Kind.PASSWORD_CHANGED, email)).isEqualTo(1);

        perform(ip, "/auth/login", """
                {"email":"%s","password":"old-password"}""".formatted(email))
                .andExpect(status().isUnauthorized());
        perform(ip, "/auth/login", """
                {"email":"%s","password":"new-password"}""".formatted(email))
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"));
        perform(ip, "/auth/password-reset/confirm", """
                {"token":"%s","password":"third-password"}""".formatted(token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_token"));
        assertThat(events(email)).contains("PASSWORD_RESET_REQUESTED", "PASSWORD_RESET");
    }

    @Test
    void resetRequestLooksTheSameForUnknownAndOAuthOnlyAccountsAndIsThrottledPerAddress() throws Exception {
        String ip = nextIp();
        String unknown = uniqueEmail();
        String oauthOnly = uniqueEmail();
        saveUser(oauthOnly, null, true);
        String real = uniqueEmail();
        saveUser(real, "password-1", true);

        for (String email : List.of(unknown, oauthOnly, real, real)) {
            perform(ip, "/auth/password-reset", """
                    {"email":"%s"}""".formatted(email))
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.status").value("RESET_EMAIL_SENT"));
        }

        assertThat(mailer.count(Kind.PASSWORD_RESET, unknown)).isZero();
        assertThat(mailer.count(Kind.PASSWORD_RESET, oauthOnly)).isZero();
        assertThat(mailer.count(Kind.PASSWORD_RESET, real)).isEqualTo(1);
        assertThat(auditLogRepository.findAllByEmailOrderByCreatedAtAsc(real))
                .extracting(AuditLog::getDetail)
                .containsExactlyInAnyOrder(null, "cooldown");
    }

    @Test
    void expiredResetLinkAndWeakPasswordsAreRejected() throws Exception {
        String email = uniqueEmail();
        saveUser(email, "password-1", true);
        PasswordResetToken token = new PasswordResetToken();
        token.setId(UUID.randomUUID().toString());
        token.setEmail(email);
        token.setToken(UUID.randomUUID().toString());
        token.setExpires(Instant.now().minusSeconds(1));
        passwordResetTokenRepository.saveAndFlush(token);
        String ip = nextIp();

        perform(ip, "/auth/password-reset/confirm", """
                {"token":"%s","password":"short"}""".formatted(token.getToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.password").isNotEmpty());
        perform(ip, "/auth/password-reset/confirm", """
                {"token":"%s","password":"long-enough"}""".formatted(token.getToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("expired_token"));
    }

    @Test
    void accountDeletionErasesTheAccountAfterTheEmailedConfirmation() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "password-1", true);
        String accessToken = tokenService.startSession(user, "laptop").accessToken();
        String ip = nextIp();
        jdbcTemplate.update("""
                insert into "UserSchedulingPreferences" (id, "userId", "updatedAt") values (?, ?, now())""",
                UUID.randomUUID().toString(), user.getId());

        authenticated(ip, "/account/deletion", accessToken, """
                {"confirmEmail":"%s","password":"password-1"}""".formatted(email.toUpperCase()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("CONFIRMATION_EMAIL_SENT"));
        String token = mailer.latest(Kind.ACCOUNT_DELETION, email).orElseThrow();
        assertThat(userRepository.findById(user.getId())).isPresent();
        loginThrottle.recordFailure(email);

        authenticated(ip, "/account/deletion/confirm", accessToken, tokenBody(token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCOUNT_DELETED"));

        assertThat(userRepository.findById(user.getId())).isEmpty();
        assertThat(count("select count(*) from \"UserSchedulingPreferences\" where \"userId\" = ?", user.getId())).isZero();
        assertThat(count("select count(*) from sessions where \"userId\" = ?", user.getId())).isZero();
        assertThat(count("select count(*) from audit_log where \"userId\" = ?", user.getId())).isZero();
        assertThat(count("select count(*) from auth_lockouts where \"key\" = ?", email)).isZero();
        assertThat(accountDeletionTokenRepository.findByToken(token)).isEmpty();
        assertThat(count("select count(*) from audit_log where event = 'ACCOUNT_DELETED' and detail = ?",
                "user=" + user.getId())).isEqualTo(1);
    }

    @Test
    void deletionRequestChecksTheEmailAndPassword() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "password-1", true);
        String accessToken = tokenService.startSession(user, null).accessToken();
        String ip = nextIp();

        authenticated(ip, "/account/deletion", accessToken, """
                {"confirmEmail":"someone-else@example.com","password":"password-1"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("email_mismatch"));
        authenticated(ip, "/account/deletion", accessToken, """
                {"confirmEmail":"%s"}""".formatted(email))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("password_required"));
        authenticated(ip, "/account/deletion", accessToken, """
                {"confirmEmail":"%s","password":"wrong"}""".formatted(email))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("bad_password"));

        assertThat(mailer.count(Kind.ACCOUNT_DELETION, email)).isZero();
        assertThat(events(email)).containsExactly("ACCOUNT_DELETION_DENIED");
    }

    @Test
    void deletionLinkOnlyWorksForTheAccountThatRequestedIt() throws Exception {
        String email = uniqueEmail();
        User owner = saveUser(email, "password-1", true);
        User other = saveUser(uniqueEmail(), "password-2", true);
        String ownerToken = tokenService.startSession(owner, null).accessToken();
        String otherToken = tokenService.startSession(other, null).accessToken();
        String ip = nextIp();

        authenticated(ip, "/account/deletion", ownerToken, """
                {"confirmEmail":"%s","password":"password-1"}""".formatted(email))
                .andExpect(status().isAccepted());
        String link = mailer.latest(Kind.ACCOUNT_DELETION, email).orElseThrow();

        authenticated(ip, "/account/deletion/confirm", otherToken, tokenBody(link))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("wrong_account"));
        assertThat(userRepository.findById(owner.getId())).isPresent();
        assertThat(userRepository.findById(other.getId())).isPresent();
    }

    @Test
    void deletionEndpointsRequireAnAccessToken() throws Exception {
        perform(nextIp(), "/account/deletion", """
                {"confirmEmail":"a@example.com","password":"x"}""")
                .andExpect(status().isUnauthorized());
    }

    private ResultActions perform(String ip, String path, String body) throws Exception {
        return mockMvc.perform(json(ip, path, body));
    }

    private ResultActions authenticated(String ip, String path, String accessToken, String body) throws Exception {
        return mockMvc.perform(json(ip, path, body).header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken));
    }

    private static MockHttpServletRequestBuilder json(String ip, String path, String body) {
        return post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .with(request -> {
                    request.setRemoteAddr(ip);
                    return request;
                });
    }

    private static String tokenBody(String token) {
        return "{\"token\":\"%s\"}".formatted(token);
    }

    private List<String> events(String email) {
        return auditLogRepository.findAllByEmailOrderByCreatedAtAsc(email).stream().map(AuditLog::getEvent).toList();
    }

    private Integer count(String sql, Object... args) {
        return jdbcTemplate.queryForObject(sql, Integer.class, args);
    }

    private User saveUser(String email, String password, boolean verified) {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName("Test User");
        user.setEmail(email);
        user.setPassword(password == null ? null : passwordEncoder.encode(password));
        user.setEmailVerified(verified ? Instant.now().minusSeconds(3600) : null);
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }

    private VerificationToken saveVerificationToken(String email, String userId, Instant expires) {
        VerificationToken token = new VerificationToken();
        token.setId(UUID.randomUUID().toString());
        token.setEmail(email);
        token.setToken(UUID.randomUUID().toString());
        token.setExpires(expires);
        token.setUserId(userId);
        return verificationTokenRepository.saveAndFlush(token);
    }

    private static String uniqueEmail() {
        return "user-" + UUID.randomUUID() + "@example.com";
    }

    private static String nextIp() {
        int n = NEXT_IP.getAndIncrement();
        return "10.7." + (n / 250) + "." + (n % 250 + 1);
    }
}
