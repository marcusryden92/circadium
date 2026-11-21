package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
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
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Changing the password from a signed-in session: every session ends, the caller gets a new one delivered like a
 * login's, and the current password is checked under the login lockout. Each test uses its own client IP and
 * email so rate-limit buckets and lockout rows never leak between tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AccountFlowsIntegrationTest.MailConfig.class})
class PasswordChangeIntegrationTest {

    private static final String WEB_ORIGIN = "http://localhost:3000";
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
    AuthCookieProperties cookieProperties;

    @Autowired
    JwtDecoder jwtDecoder;

    @Autowired
    RecordingAccountMailer mailer;

    @Test
    void webChangeEndsEverySessionAndSignsTheCallerBackInWithNewCookies() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password");
        String ip = nextIp();
        MockHttpServletResponse login = mockMvc.perform(withBody(fromWeb(post("/auth/login"), ip), """
                        {"email":"%s","password":"old-password","client":"web"}""".formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse();
        Cookie oldRefresh = login.getCookie(cookieProperties.refreshName());
        IssuedTokens otherDevice = tokenService.startSession(user, "phone");

        MockHttpServletResponse changed = mockMvc.perform(withBody(fromWeb(post("/account/password"), ip)
                        .cookie(login.getCookie(cookieProperties.accessName())), """
                        {"currentPassword":"old-password","newPassword":"new-password","client":"web"}"""))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.accessTokenExpiresAt").isNotEmpty())
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andExpect(cookie().httpOnly(cookieProperties.accessName(), true))
                .andExpect(cookie().httpOnly(cookieProperties.refreshName(), true))
                .andExpect(cookie().path(cookieProperties.refreshName(), "/"))
                .andReturn().getResponse();

        User updated = userRepository.findById(user.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("new-password", updated.getPassword())).isTrue();
        Jwt newAccess = jwtDecoder.decode(changed.getCookie(cookieProperties.accessName()).getValue());
        // The web app refuses access tokens issued in an earlier second than the change.
        assertThat(newAccess.getIssuedAt().getEpochSecond())
                .isGreaterThanOrEqualTo(updated.getPasswordChangedAt().getEpochSecond());

        mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(oldRefresh))
                .andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> tokenService.refresh(otherDevice.refreshToken(), ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);
        mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(changed.getCookie(cookieProperties.refreshName())))
                .andExpect(status().isOk());

        assertThat(mailer.count(Kind.PASSWORD_CHANGED, email)).isEqualTo(1);
        assertThat(events(user)).contains("PASSWORD_CHANGED");
        login(ip, email, "old-password").andExpect(status().isUnauthorized());
        login(ip, email, "new-password").andExpect(jsonPath("$.status").value("AUTHENTICATED"));
    }

    @Test
    void mobileChangeReturnsTheNewTokensInTheBody() throws Exception {
        User user = saveUser(uniqueEmail(), "old-password");
        IssuedTokens session = tokenService.startSession(user, "phone");

        String body = change(nextIp(), session.accessToken(), "old-password", "new-password")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
                .andReturn().getResponse().getContentAsString();

        String newRefreshToken = JsonPath.read(body, "$.refreshToken");
        assertThat(tokenService.refresh(newRefreshToken, ClientInfo.UNKNOWN).refreshToken()).isNotBlank();
        assertThatThrownBy(() -> tokenService.refresh(session.refreshToken(), ClientInfo.UNKNOWN))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void wrongCurrentPasswordChangesNothingAndCountsTowardTheLoginLockout() throws Exception {
        String email = uniqueEmail();
        User user = saveUser(email, "old-password");
        IssuedTokens session = tokenService.startSession(user, null);
        String ip = nextIp();

        for (int attempt = 1; attempt <= 5; attempt++) {
            change(ip, session.accessToken(), "wrong-password", "new-password")
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("bad_password"));
        }
        change(ip, session.accessToken(), "old-password", "new-password")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));

        User unchanged = userRepository.findById(user.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("old-password", unchanged.getPassword())).isTrue();
        assertThat(unchanged.getPasswordChangedAt()).isNull();
        assertThat(tokenService.refresh(session.refreshToken(), ClientInfo.UNKNOWN).refreshToken()).isNotBlank();
        assertThat(events(user)).contains("PASSWORD_CHANGE_DENIED", "ACCOUNT_LOCKED");
        assertThat(mailer.count(Kind.PASSWORD_CHANGED, email)).isZero();
    }

    @Test
    void accountWithoutAPasswordHasNoneToChange() throws Exception {
        User user = saveUser(uniqueEmail(), null);

        change(nextIp(), tokenService.startSession(user, null).accessToken(), "anything", "new-password")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("no_password"));
    }

    @Test
    void newPasswordFollowsTheRegistrationRules() throws Exception {
        User user = saveUser(uniqueEmail(), "old-password");
        String accessToken = tokenService.startSession(user, null).accessToken();
        String ip = nextIp();

        change(ip, accessToken, "old-password", "short")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.newPassword").isNotEmpty());
        // 40 characters, 80 bytes: past bcrypt's 72-byte limit.
        change(ip, accessToken, "old-password", "é".repeat(40))
                .andExpect(status().isBadRequest());

        User unchanged = userRepository.findById(user.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("old-password", unchanged.getPassword())).isTrue();
    }

    @Test
    void requiresAnAccessToken() throws Exception {
        mockMvc.perform(withBody(from(post("/account/password"), nextIp()), """
                        {"currentPassword":"old-password","newPassword":"new-password"}"""))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions change(String ip, String accessToken, String currentPassword, String newPassword)
            throws Exception {
        return mockMvc.perform(withBody(from(post("/account/password"), ip)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken), """
                        {"currentPassword":"%s","newPassword":"%s"}""".formatted(currentPassword, newPassword)));
    }

    private ResultActions login(String ip, String email, String password) throws Exception {
        return mockMvc.perform(withBody(from(post("/auth/login"), ip), """
                {"email":"%s","password":"%s"}""".formatted(email, password)));
    }

    private static MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder request, String body) {
        return request.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    /** A request as the web app's fetch sends it: cross-origin from the web origin. */
    private static MockHttpServletRequestBuilder fromWeb(MockHttpServletRequestBuilder request, String ip) {
        return from(request, ip).header(HttpHeaders.ORIGIN, WEB_ORIGIN);
    }

    private static MockHttpServletRequestBuilder from(MockHttpServletRequestBuilder request, String ip) {
        return request.with(mock -> {
            mock.setRemoteAddr(ip);
            return mock;
        });
    }

    private List<String> events(User user) {
        return auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()).stream()
                .map(AuditLog::getEvent)
                .toList();
    }

    private User saveUser(String email, String password) {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName("Test User");
        user.setEmail(email);
        user.setPassword(password == null ? null : passwordEncoder.encode(password));
        user.setEmailVerified(Instant.now().minusSeconds(3600));
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }

    private static String uniqueEmail() {
        return "change-" + UUID.randomUUID() + "@example.com";
    }

    private static String nextIp() {
        int n = NEXT_IP.getAndIncrement();
        return "10.11." + (n / 250) + "." + (n % 250 + 1);
    }
}
