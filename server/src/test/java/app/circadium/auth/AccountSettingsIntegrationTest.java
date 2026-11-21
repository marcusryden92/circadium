package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.RecordingAccountMailer.Kind;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * The sign-in email and the two-factor switch: both need the current password, count wrong ones toward the login
 * lockout, and tell the owner by email. Each test uses its own client IP and emails so rate-limit buckets and
 * lockout rows never leak between tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AccountFlowsIntegrationTest.MailConfig.class})
class AccountSettingsIntegrationTest {

    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

    @Autowired
    MockMvc mockMvc;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    TokenService tokenService;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    RecordingAccountMailer mailer;

    @Test
    void emailMovesOnlyOnceTheNewAddressConfirmsAndTheOldOneHearsOfBothSteps() throws Exception {
        String oldEmail = uniqueEmail();
        User user = saveUser(oldEmail, "old-password", false);
        String newEmail = uniqueEmail();
        String ip = nextIp();

        authenticated(ip, "/account/email", accessToken(user), """
                {"currentPassword":"old-password","newEmail":"%s"}""".formatted(newEmail.toUpperCase()))
                .andExpect(status().isAccepted())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.status").value("VERIFICATION_EMAIL_SENT"));

        assertThat(userRepository.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(oldEmail);
        assertThat(mailer.latest(Kind.EMAIL_CHANGE_REQUESTED, oldEmail)).contains(newEmail);
        String token = mailer.latest(Kind.EMAIL_CHANGE_VERIFICATION, newEmail).orElseThrow();

        perform(ip, "/auth/verify-email", "{\"token\":\"%s\"}".formatted(token)).andExpect(status().isOk());

        assertThat(userRepository.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(newEmail);
        assertThat(mailer.latest(Kind.EMAIL_CHANGED, oldEmail)).contains(newEmail);
        assertThat(events(user)).contains("EMAIL_CHANGE_REQUESTED", "EMAIL_CHANGED");
    }

    @Test
    void wrongPasswordSendsNothingAndCountsTowardTheLoginLockout() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password", false);
        String accessToken = accessToken(user);
        String ip = nextIp();
        String newEmail = uniqueEmail();

        for (int attempt = 1; attempt <= 5; attempt++) {
            authenticated(ip, "/account/email", accessToken, """
                    {"currentPassword":"wrong-password","newEmail":"%s"}""".formatted(newEmail))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("bad_password"));
        }
        authenticated(ip, "/account/two-factor", accessToken, """
                {"currentPassword":"old-password","enabled":true}""")
                .andExpect(status().isTooManyRequests());

        assertThat(mailer.count(Kind.EMAIL_CHANGE_VERIFICATION, newEmail)).isZero();
        assertThat(mailer.count(Kind.EMAIL_CHANGE_REQUESTED, email)).isZero();
        assertThat(userRepository.findById(user.getId()).orElseThrow().isTwoFactorEnabled()).isFalse();
        assertThat(events(user)).contains("EMAIL_CHANGE_DENIED", "ACCOUNT_LOCKED", "TWO_FACTOR_CHANGE_DENIED");
    }

    @Test
    void emailChangeRefusesTheCurrentAddressAndOneAnotherAccountOwns() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password", false);
        User other = saveUser(uniqueEmail(), "other-password", false);
        String ip = nextIp();

        authenticated(ip, "/account/email", accessToken(user), """
                {"currentPassword":"old-password","newEmail":"%s"}""".formatted(email.toUpperCase()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("same_email"));
        authenticated(ip, "/account/email", accessToken(user), """
                {"currentPassword":"old-password","newEmail":"%s"}""".formatted(other.getEmail()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("email_in_use"));
    }

    /** Whoever asked for the change may be the reason for the new password. */
    @Test
    void passwordChangeCancelsAPendingEmailChange() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password", false);
        String newEmail = uniqueEmail();
        String ip = nextIp();
        authenticated(ip, "/account/email", accessToken(user), """
                {"currentPassword":"old-password","newEmail":"%s"}""".formatted(newEmail))
                .andExpect(status().isAccepted());
        String token = mailer.latest(Kind.EMAIL_CHANGE_VERIFICATION, newEmail).orElseThrow();

        authenticated(ip, "/account/password", accessToken(user), """
                {"currentPassword":"old-password","newPassword":"brand-new-password"}""")
                .andExpect(status().isOk());

        perform(ip, "/auth/verify-email", "{\"token\":\"%s\"}".formatted(token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_token"));
        assertThat(userRepository.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(email);
    }

    @Test
    void twoFactorSwitchNeedsThePasswordAndTellsTheAccountOfEveryChange() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password", false);
        String accessToken = accessToken(user);
        String ip = nextIp();

        twoFactor(ip, accessToken, "old-password", true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TWO_FACTOR_ENABLED"));
        twoFactor(ip, accessToken, "old-password", true).andExpect(status().isOk());
        assertThat(userRepository.findById(user.getId()).orElseThrow().isTwoFactorEnabled()).isTrue();
        assertThat(mailer.count(Kind.TWO_FACTOR_CHANGED, email)).isEqualTo(1);

        twoFactor(ip, accessToken, "wrong-password", false)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("bad_password"));
        assertThat(userRepository.findById(user.getId()).orElseThrow().isTwoFactorEnabled()).isTrue();

        twoFactor(ip, accessToken, "old-password", false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TWO_FACTOR_DISABLED"));
        assertThat(userRepository.findById(user.getId()).orElseThrow().isTwoFactorEnabled()).isFalse();
        assertThat(mailer.latest(Kind.TWO_FACTOR_CHANGED, email)).contains("false");
        assertThat(events(user)).contains("TWO_FACTOR_ENABLED", "TWO_FACTOR_DISABLED");
    }

    @Test
    void accountsWithoutAPasswordCannotChangeEither() throws Exception {
        User user = saveUser(uniqueEmail(), null, false);
        String ip = nextIp();

        authenticated(ip, "/account/email", accessToken(user), """
                {"currentPassword":"anything","newEmail":"%s"}""".formatted(uniqueEmail()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("no_password"));
        twoFactor(ip, accessToken(user), "anything", true)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("no_password"));
    }

    @Test
    void bothRequireAnAccessToken() throws Exception {
        perform(nextIp(), "/account/email", """
                {"currentPassword":"old-password","newEmail":"a@example.com"}""")
                .andExpect(status().isUnauthorized());
        perform(nextIp(), "/account/two-factor", """
                {"currentPassword":"old-password","enabled":true}""")
                .andExpect(status().isUnauthorized());
    }

    private ResultActions twoFactor(String ip, String accessToken, String password, boolean enabled) throws Exception {
        return authenticated(ip, "/account/two-factor", accessToken, """
                {"currentPassword":"%s","enabled":%s}""".formatted(password, enabled));
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

    private String accessToken(User user) {
        return tokenService.startSession(user, null).accessToken();
    }

    private List<String> events(User user) {
        return auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()).stream()
                .map(AuditLog::getEvent)
                .toList();
    }

    private User saveUser(String email, String password, boolean twoFactor) {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName("Test User");
        user.setEmail(email);
        user.setPassword(password == null ? null : passwordEncoder.encode(password));
        user.setEmailVerified(Instant.now().minusSeconds(3600));
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(twoFactor);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }

    private static String uniqueEmail() {
        return "settings-" + UUID.randomUUID() + "@example.com";
    }

    private static String nextIp() {
        int n = NEXT_IP.getAndIncrement();
        return "10.12." + (n / 250) + "." + (n % 250 + 1);
    }
}
