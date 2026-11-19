package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.RecordingAccountMailer.Kind;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.TwoFactorToken;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.TwoFactorTokenRepository;
import app.circadium.persistence.repository.UserRepository;
import app.circadium.persistence.repository.VerificationTokenRepository;
import com.jayway.jsonpath.JsonPath;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Plan item 1.6 DoD: a pre-migration (bcryptjs) account logs in, brute force hits both the account lockout
 * and the per-IP limiter, and every step leaves audit rows. Each test uses its own client IP and emails so
 * the in-memory rate-limit buckets and lockout rows never leak between tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, CredentialsAuthIntegrationTest.MailConfig.class})
class CredentialsAuthIntegrationTest {

    /** {@code bcryptjs.hashSync("pre-migration-pass", 10)}, produced by the web app's own library. */
    private static final String BCRYPTJS_HASH = "$2a$10$F2MHf042PZTfu4fldA5L.O6rEjqj5y6K/fglX5All0XHT/rLiDf9.";
    private static final String BCRYPTJS_PASSWORD = "pre-migration-pass";
    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

    @Autowired
    MockMvc mockMvc;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    TwoFactorTokenRepository twoFactorTokenRepository;

    @Autowired
    VerificationTokenRepository verificationTokenRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    JwtDecoder jwtDecoder;

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
    void preMigrationAccountLogsInWithItsBcryptjsHash() throws Exception {
        String storedEmail = "Legacy.User+" + UUID.randomUUID() + "@Example.com";
        User user = saveUser(storedEmail, BCRYPTJS_HASH, true, false);
        String ip = nextIp();

        String body = login(ip, storedEmail.toLowerCase(), BCRYPTJS_PASSWORD)
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.tokens.tokenType").value("Bearer"))
                .andReturn().getResponse().getContentAsString();

        String accessToken = JsonPath.read(body, "$.tokens.accessToken");
        assertThat(jwtDecoder.decode(accessToken).getSubject()).isEqualTo(user.getId());
        assertThat(events(storedEmail.toLowerCase())).containsExactly("LOGIN_SUCCESS");
        AuditLog success = auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()).getFirst();
        assertThat(success.getIpAddress()).isEqualTo(ip);
    }

    @Test
    void unknownEmailAndWrongPasswordAreIndistinguishable() throws Exception {
        String email = uniqueEmail();
        saveUser(email, passwordEncoder.encode("right-password"), true, false);
        String ip = nextIp();

        String wrongPassword = login(ip, email, "wrong-password")
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andReturn().getResponse().getContentAsString();
        String unknownEmail = login(ip, uniqueEmail(), "wrong-password")
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        assertThat((String) JsonPath.read(unknownEmail, "$.detail"))
                .isEqualTo(JsonPath.read(wrongPassword, "$.detail"));
        assertThat(events(email)).containsExactly("LOGIN_FAILURE");
    }

    @Test
    void bruteForceLocksTheAccountEvenForTheRightPassword() throws Exception {
        String email = uniqueEmail();
        saveUser(email, passwordEncoder.encode("right-password"), true, false);
        String ip = nextIp();

        for (int attempt = 1; attempt <= 5; attempt++) {
            login(ip, email, "guess-" + attempt).andExpect(status().isUnauthorized());
        }
        login(ip, email, "right-password")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        assertThat(events(email)).containsExactlyInAnyOrder(
                "LOGIN_FAILURE", "LOGIN_FAILURE", "LOGIN_FAILURE", "LOGIN_FAILURE", "LOGIN_FAILURE",
                "ACCOUNT_LOCKED", "LOGIN_BLOCKED");
    }

    @Test
    void lockoutAppliesToEmailsWithNoAccountToo() throws Exception {
        String email = uniqueEmail();
        String ip = nextIp();
        for (int attempt = 1; attempt <= 5; attempt++) {
            login(ip, email, "guess-" + attempt).andExpect(status().isUnauthorized());
        }
        login(ip, email, "guess-6").andExpect(status().isTooManyRequests());
    }

    @Test
    void successfulLoginResetsTheFailureCount() throws Exception {
        String email = uniqueEmail();
        saveUser(email, passwordEncoder.encode("right-password"), true, false);
        String ip = nextIp();

        for (int attempt = 1; attempt <= 4; attempt++) {
            login(ip, email, "guess-" + attempt).andExpect(status().isUnauthorized());
        }
        login(ip, email, "right-password").andExpect(status().isOk());
        login(ip, email, "guess-5").andExpect(status().isUnauthorized());
        login(ip, email, "right-password").andExpect(status().isOk());
    }

    @Test
    void ipRateLimiterStopsCredentialSpraying() throws Exception {
        String ip = nextIp();
        for (int request = 1; request <= 10; request++) {
            login(ip, uniqueEmail(), "spray").andExpect(status().isUnauthorized());
        }
        login(ip, uniqueEmail(), "spray")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Too many requests. Try again later."));

        login(nextIp(), uniqueEmail(), "spray").andExpect(status().isUnauthorized());
    }

    @Test
    void twoFactorLoginRequiresTheEmailedCodeOnce() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, passwordEncoder.encode("right-password"), true, true);
        String ip = nextIp();

        login(ip, email, "right-password")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TWO_FACTOR_REQUIRED"))
                .andExpect(jsonPath("$.tokens").doesNotExist());
        String code = mailer.latest(Kind.TWO_FACTOR, email).orElseThrow();
        String wrongCode = code.equals("111111") ? "222222" : "111111";

        twoFactor(ip, email, "right-password", wrongCode).andExpect(status().isUnauthorized());
        twoFactor(ip, email, "wrong-password", code).andExpect(status().isUnauthorized());
        twoFactor(ip, email, "right-password", code)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.tokens.accessToken").isNotEmpty());
        twoFactor(ip, email, "right-password", code).andExpect(status().isUnauthorized());

        assertThat(twoFactorTokenRepository.findFirstByEmail(email)).isEmpty();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()))
                .extracting(AuditLog::getEvent)
                .contains("TWO_FACTOR_CHALLENGE", "LOGIN_SUCCESS");
    }

    @Test
    void expiredTwoFactorCodeIsRejected() throws Exception {
        String email = uniqueEmail();
        saveUser(email, passwordEncoder.encode("right-password"), true, true);
        String ip = nextIp();

        login(ip, email, "right-password").andExpect(jsonPath("$.status").value("TWO_FACTOR_REQUIRED"));
        TwoFactorToken token = twoFactorTokenRepository.findFirstByEmail(email).orElseThrow();
        token.setExpires(Instant.now().minusSeconds(1));
        twoFactorTokenRepository.saveAndFlush(token);

        twoFactor(ip, email, "right-password", token.getToken()).andExpect(status().isUnauthorized());
    }

    @Test
    void registerCreatesAnUnverifiedAccountThatMustVerifyBeforeLogin() throws Exception {
        String email = uniqueEmail();
        String ip = nextIp();

        register(ip, "  New User ", email.toUpperCase(), "a-good-password")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("VERIFICATION_EMAIL_SENT"));

        User created = userRepository.findFirstByEmailIgnoreCase(email).orElseThrow();
        assertThat(created.getEmail()).isEqualTo(email);
        assertThat(created.getName()).isEqualTo("New User");
        assertThat(created.getEmailVerified()).isNull();
        assertThat(created.getPassword()).startsWith("$2a$10$");
        assertThat(passwordEncoder.matches("a-good-password", created.getPassword())).isTrue();
        String mailedToken = mailer.latest(Kind.VERIFICATION, email).orElseThrow();
        assertThat(verificationTokenRepository.findFirstByEmail(email).orElseThrow().getToken()).isEqualTo(mailedToken);

        login(ip, email, "a-good-password")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EMAIL_VERIFICATION_SENT"));
        assertThat(mailer.count(Kind.VERIFICATION, email)).isEqualTo(2);
        assertThat(events(email)).containsExactlyInAnyOrder("REGISTER", "LOGIN_UNVERIFIED");
    }

    @Test
    void registeringATakenEmailLooksIdenticalAndCreatesNothing() throws Exception {
        String email = uniqueEmail();
        saveUser(email, passwordEncoder.encode("right-password"), true, false);
        String ip = nextIp();

        register(ip, "Someone", email.toUpperCase(), "another-password")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("VERIFICATION_EMAIL_SENT"));

        assertThat(userRepository.findAll()).filteredOn(u -> email.equalsIgnoreCase(u.getEmail())).hasSize(1);
        assertThat(mailer.count(Kind.VERIFICATION, email)).isZero();
        assertThat(mailer.latest(Kind.EXISTING_ACCOUNT, email)).contains("true");
        assertThat(events(email)).containsExactly("REGISTER_DUPLICATE");
    }

    @Test
    void registerValidatesTheBody() throws Exception {
        register(nextIp(), "Name", "not-an-email", "short")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").isNotEmpty())
                .andExpect(jsonPath("$.errors.password").isNotEmpty());
    }

    private ResultActions login(String ip, String email, String password) throws Exception {
        return mockMvc.perform(json(ip, "/auth/login",
                "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
    }

    private ResultActions twoFactor(String ip, String email, String password, String code) throws Exception {
        return mockMvc.perform(json(ip, "/auth/2fa",
                "{\"email\":\"%s\",\"password\":\"%s\",\"code\":\"%s\"}".formatted(email, password, code)));
    }

    private ResultActions register(String ip, String name, String email, String password) throws Exception {
        return mockMvc.perform(json(ip, "/auth/register",
                "{\"name\":\"%s\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(name, email, password)));
    }

    private static RequestBuilder json(String ip, String path, String body) {
        return post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .with(request -> {
                    request.setRemoteAddr(ip);
                    return request;
                });
    }

    private List<String> events(String email) {
        return auditLogRepository.findAllByEmailOrderByCreatedAtAsc(email).stream().map(AuditLog::getEvent).toList();
    }

    private User saveUser(String email, String passwordHash, boolean verified, boolean twoFactor) {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName("Test User");
        user.setEmail(email);
        user.setPassword(passwordHash);
        user.setEmailVerified(verified ? Instant.now() : null);
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(twoFactor);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }

    private static String uniqueEmail() {
        return "user-" + UUID.randomUUID() + "@example.com";
    }

    private static String nextIp() {
        int n = NEXT_IP.getAndIncrement();
        return "10.6." + (n / 250) + "." + (n % 250 + 1);
    }
}
