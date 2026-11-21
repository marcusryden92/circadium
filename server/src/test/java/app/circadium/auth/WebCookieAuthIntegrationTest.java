package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * The web client's cookie model end to end: a web login sets the token cookies, the access cookie authenticates
 * API calls, refresh and logout work from the refresh cookie alone, and only the web origin may make credentialed
 * calls. Each test uses its own client IP so rate limits never leak between tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class WebCookieAuthIntegrationTest {

    private static final String WEB_ORIGIN = "http://localhost:3000";
    private static final String FOREIGN_ORIGIN = "https://evil.example";
    private static final String PASSWORD = "right-password";
    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

    @Autowired
    MockMvc mockMvc;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    TokenService tokenService;

    @Autowired
    AuthCookieProperties cookieProperties;

    @Test
    void webLoginSetsTheTokenCookiesAndKeepsTokensOutOfTheBody() throws Exception {
        String access = cookieProperties.accessName();
        String refresh = cookieProperties.refreshName();

        mockMvc.perform(login(nextIp(), saveUser().getEmail(), "web"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.tokens.accessTokenExpiresAt").isNotEmpty())
                .andExpect(jsonPath("$.tokens.refreshTokenExpiresAt").isNotEmpty())
                .andExpect(jsonPath("$.tokens.accessToken").doesNotExist())
                .andExpect(jsonPath("$.tokens.refreshToken").doesNotExist())
                .andExpect(jsonPath("$.tokens.tokenType").doesNotExist())
                .andExpect(cookie().httpOnly(access, true))
                .andExpect(cookie().path(access, "/"))
                .andExpect(cookie().sameSite(access, "Lax"))
                .andExpect(cookie().maxAge(access, allOf(greaterThan(890), lessThanOrEqualTo(900))))
                .andExpect(cookie().httpOnly(refresh, true))
                .andExpect(cookie().path(refresh, "/"))
                .andExpect(cookie().sameSite(refresh, "Strict"))
                .andExpect(cookie().maxAge(refresh, greaterThan(29 * 24 * 3600)));
    }

    @Test
    void loginWithoutAClientStillReturnsTheTokensInTheBodyAndSetsNoCookies() throws Exception {
        mockMvc.perform(login(nextIp(), saveUser().getEmail(), null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokens.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokens.refreshToken").isNotEmpty())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
    }

    @Test
    void unknownClientIsABadRequest() throws Exception {
        mockMvc.perform(login(nextIp(), saveUser().getEmail(), "desktop")).andExpect(status().isBadRequest());
    }

    @Test
    void accessCookieAuthenticatesAProtectedCall() throws Exception {
        User user = saveUser();
        String ip = nextIp();
        MockHttpServletResponse login = webLogin(ip, user.getEmail());

        mockMvc.perform(fromWeb(get("/auth/me"), ip).cookie(login.getCookie(cookieProperties.accessName())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId()))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, WEB_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
        mockMvc.perform(fromWeb(get("/auth/me"), ip)).andExpect(status().isUnauthorized());
    }

    @Test
    void webRefreshRotatesFromTheCookieAndReplayingTheOldOneEndsTheSession() throws Exception {
        String ip = nextIp();
        MockHttpServletResponse login = webLogin(ip, saveUser().getEmail());
        Cookie firstRefresh = login.getCookie(cookieProperties.refreshName());

        MockHttpServletResponse refreshed = mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(firstRefresh))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.accessTokenExpiresAt").isNotEmpty())
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andReturn().getResponse();
        Cookie secondRefresh = refreshed.getCookie(cookieProperties.refreshName());
        assertThat(secondRefresh.getValue()).isNotEqualTo(firstRefresh.getValue());
        mockMvc.perform(fromWeb(get("/auth/me"), ip).cookie(refreshed.getCookie(cookieProperties.accessName())))
                .andExpect(status().isOk());

        mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(firstRefresh))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andExpect(cookie().maxAge(cookieProperties.accessName(), 0))
                .andExpect(cookie().maxAge(cookieProperties.refreshName(), 0));
        mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(secondRefresh))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshWithNeitherBodyNorCookieIsUnauthorized() throws Exception {
        mockMvc.perform(fromWeb(post("/auth/refresh"), nextIp())).andExpect(status().isUnauthorized());
    }

    @Test
    void webLogoutEndsTheSessionAndClearsBothCookies() throws Exception {
        String ip = nextIp();
        Cookie refresh = webLogin(ip, saveUser().getEmail()).getCookie(cookieProperties.refreshName());

        mockMvc.perform(fromWeb(post("/auth/logout"), ip).cookie(refresh))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(cookieProperties.accessName(), 0))
                .andExpect(cookie().maxAge(cookieProperties.refreshName(), 0));
        mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(refresh)).andExpect(status().isUnauthorized());
    }

    @Test
    void staleAccessCookieIsIgnoredWhereNoAuthenticationIsNeeded() throws Exception {
        String ip = nextIp();
        User user = saveUser();
        Cookie stale = new Cookie(cookieProperties.accessName(), "not-a-jwt");

        MockHttpServletResponse login = mockMvc.perform(login(ip, user.getEmail(), "web").cookie(stale))
                .andExpect(status().isOk())
                .andReturn().getResponse();
        mockMvc.perform(fromWeb(post("/auth/refresh"), ip)
                        .cookie(stale, login.getCookie(cookieProperties.refreshName())))
                .andExpect(status().isOk());
        mockMvc.perform(fromWeb(get("/auth/me"), ip).cookie(stale)).andExpect(status().isUnauthorized());
    }

    @Test
    void bearerHeaderTakesPrecedenceOverTheCookie() throws Exception {
        User user = saveUser();
        IssuedTokens tokens = tokenService.startSession(user, null);

        mockMvc.perform(get("/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokens.accessToken())
                        .cookie(new Cookie(cookieProperties.accessName(), "not-a-jwt")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId()));
    }

    @Test
    void preflightFromTheWebOriginIsAllowedWithCredentials() throws Exception {
        mockMvc.perform(options("/auth/login")
                        .header(HttpHeaders.ORIGIN, WEB_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, WEB_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_MAX_AGE, "3600"));
    }

    @Test
    void foreignOriginIsRefusedBeforeAnythingHappens() throws Exception {
        String ip = nextIp();
        User user = saveUser();
        Cookie refresh = webLogin(ip, user.getEmail()).getCookie(cookieProperties.refreshName());

        mockMvc.perform(options("/auth/login")
                        .header(HttpHeaders.ORIGIN, FOREIGN_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));

        String otherEmail = saveUser().getEmail();
        mockMvc.perform(login(ip, otherEmail, "web", FOREIGN_ORIGIN))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertThat(auditLogRepository.findAllByEmailOrderByCreatedAtAsc(otherEmail)).isEmpty();

        mockMvc.perform(from(post("/auth/logout"), ip, FOREIGN_ORIGIN).cookie(refresh))
                .andExpect(status().isForbidden());
        mockMvc.perform(fromWeb(post("/auth/refresh"), ip).cookie(refresh))
                .andExpect(status().isOk());
    }

    @Test
    void rateLimitedResponsesStillCarryTheCorsHeaders() throws Exception {
        String ip = nextIp();
        for (int attempt = 0; attempt < 10; attempt++) {
            mockMvc.perform(login(ip, "nobody-" + UUID.randomUUID() + "@example.com", "web"))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(login(ip, "nobody-" + UUID.randomUUID() + "@example.com", "web"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, WEB_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        containsString(HttpHeaders.RETRY_AFTER)));
    }

    /** A JSON login from the web origin; {@code client} is left out when null. */
    private static MockHttpServletRequestBuilder login(String ip, String email, String client) {
        return login(ip, email, client, WEB_ORIGIN);
    }

    private static MockHttpServletRequestBuilder login(String ip, String email, String client, String origin) {
        String clientField = client == null ? "" : ",\"client\":\"%s\"".formatted(client);
        return from(post("/auth/login"), ip, origin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"%s}".formatted(email, PASSWORD, clientField));
    }

    private MockHttpServletResponse webLogin(String ip, String email) throws Exception {
        return mockMvc.perform(login(ip, email, "web"))
                .andExpect(status().isOk())
                .andReturn().getResponse();
    }

    /** A request as the web app's fetch sends it: cross-origin from the web origin, from one client IP. */
    private static MockHttpServletRequestBuilder fromWeb(MockHttpServletRequestBuilder request, String ip) {
        return from(request, ip, WEB_ORIGIN);
    }

    private static MockHttpServletRequestBuilder from(MockHttpServletRequestBuilder request, String ip,
            String origin) {
        return request
                .header(HttpHeaders.ORIGIN, origin)
                .with(mock -> {
                    mock.setRemoteAddr(ip);
                    return mock;
                });
    }

    private User saveUser() {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName("Web User");
        user.setEmail("web-" + UUID.randomUUID() + "@example.com");
        user.setPassword(passwordEncoder.encode(PASSWORD));
        user.setEmailVerified(Instant.now());
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }

    private static String nextIp() {
        int n = NEXT_IP.getAndIncrement();
        return "10.9." + (n / 250) + "." + (n % 250 + 1);
    }
}
