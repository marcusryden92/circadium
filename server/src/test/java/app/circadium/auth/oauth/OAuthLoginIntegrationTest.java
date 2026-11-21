package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.oauth.FakeGoogle.Identity;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.OAuthHandoffCode;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.AccountRepository;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.OAuthHandoffCodeRepository;
import app.circadium.persistence.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Google sign-in end to end: the start redirect, the callback (against {@link FakeGoogle}), account matching, and
 * the handoff that turns a finished sign-in into tokens. Each test uses its own client IP and identities so rate
 * limits and accounts never leak between tests.
 */
@SpringBootTest(properties = {
        "circadium.oauth.google.client-id=" + FakeGoogle.CLIENT_ID,
        "circadium.oauth.google.client-secret=test-client-secret",
        "circadium.oauth.redirect-base-url=http://localhost"})
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, OAuthLoginIntegrationTest.FakeGoogleConfig.class})
class OAuthLoginIntegrationTest {

    private static final FakeGoogle GOOGLE = FakeGoogle.start();
    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final String START = "/oauth2/authorization/google";
    private static final String CALLBACK = "/login/oauth2/code/google";
    private static final String REDIRECT_URI = "http://localhost" + CALLBACK;
    private static final String WEB_COMPLETION = "http://localhost:3000/auth/oauth/complete";
    private static final String MOBILE_COMPLETION = "circadium://auth/oauth/complete";
    private static final String ACCESS_COOKIE = "circadium_access";
    private static final String REFRESH_COOKIE = "circadium_refresh";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    OAuthProperties properties;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AccountRepository accountRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    OAuthHandoffCodeRepository handoffCodeRepository;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeGoogleConfig {
        @Bean
        @Primary
        ClientRegistrationRepository fakeGoogleRegistrations(OAuthProperties properties) {
            return new InMemoryClientRegistrationRepository(GOOGLE.registration(properties));
        }
    }

    @AfterAll
    static void stopGoogle() {
        GOOGLE.close();
    }

    @Test
    void productionRegistrationUsesGooglePkceAndTheExactCallback() {
        ClientRegistration google = OAuthClientConfig.googleRegistration(properties);

        assertThat(google.getProviderDetails().getAuthorizationUri()).startsWith("https://accounts.google.com/");
        assertThat(google.getProviderDetails().getIssuerUri()).isEqualTo("https://accounts.google.com");
        assertThat(google.getRedirectUri()).isEqualTo(REDIRECT_URI);
        assertThat(google.getScopes()).containsExactlyInAnyOrder("openid", "email", "profile");
        assertThat(google.getClientSettings().isRequireProofKey()).isTrue();
    }

    @Test
    void startSendsTheBrowserToGoogleWithStatePkceAndNonce() throws Exception {
        App app = App.create();
        Started started = start(app, "web");

        assertThat(started.params())
                .containsEntry("response_type", "code")
                .containsEntry("client_id", FakeGoogle.CLIENT_ID)
                .containsEntry("redirect_uri", REDIRECT_URI)
                .containsEntry("code_challenge_method", "S256");
        assertThat(started.param("scope").split(" ")).containsExactlyInAnyOrder("openid", "email", "profile");
        assertThat(started.param("state")).hasSizeGreaterThanOrEqualTo(43);
        assertThat(started.param("nonce")).isNotBlank();
        assertThat(started.param("code_challenge"))
                .matches("[A-Za-z0-9_-]{43}")
                .isNotEqualTo(app.challenge());
    }

    @Test
    void startRejectsMalformedRequestsWithoutCreatingASession() throws Exception {
        App app = App.create();

        MvcResult missing = mockMvc.perform(get(START).with(from(app)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"))
                .andReturn();
        assertThat(missing.getRequest().getSession(false)).isNull();

        mockMvc.perform(get(START).param("client", "desktop").param("challenge", app.challenge()).with(from(app)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get(START).param("client", "web").param("challenge", "too-short").with(from(app)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/oauth2/authorization/github")
                        .param("client", "web").param("challenge", app.challenge()).with(from(app)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("unknown_provider"));
        mockMvc.perform(post(START).param("client", "web").param("challenge", app.challenge()).with(from(app)))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void newGoogleUserSignsInAndReceivesTokens() throws Exception {
        App app = App.create();
        String email = uniqueEmail();
        String subject = uniqueSubject();

        Started started = start(app, "web");
        String location = finish(app, started, new Identity(subject, email, true, "Google User"));

        assertThat(location).startsWith(WEB_COMPLETION + "?code=");
        Map<String, String> tokenRequest = GOOGLE.lastTokenRequest();
        assertThat(tokenRequest)
                .containsEntry("grant_type", "authorization_code")
                .containsEntry("redirect_uri", REDIRECT_URI);
        assertThat(OAuthHandoffCodes.s256(tokenRequest.get("code_verifier")))
                .as("the PKCE verifier sent to the token endpoint matches the challenge sent to Google")
                .isEqualTo(started.param("code_challenge"));

        String code = queryParams(location).get("code");
        String accessToken = redeemWeb(app, code);
        User user = userRepository.findFirstByEmailIgnoreCase(email).orElseThrow();
        mockMvc.perform(get("/auth/me").cookie(new Cookie(ACCESS_COOKIE, accessToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId()));

        assertThat(user.getEmailVerified()).isNotNull();
        assertThat(user.getPassword()).isNull();
        assertThat(user.getName()).isEqualTo("Google User");
        Account account = accountRepository.findByProviderAndProviderAccountId("google", subject).orElseThrow();
        assertThat(account.getUserId()).isEqualTo(user.getId());
        assertThat(account.getType()).isEqualTo("oidc");
        assertThat(account.getAccessToken()).isNull();
        assertThat(events(email)).containsExactlyInAnyOrder("OAUTH_REGISTER", "LOGIN_SUCCESS");

        handoff(app, code, app.verifier())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_code"));
    }

    @Test
    void existingNextAuthGoogleAccountSignsInAsTheSameUser() throws Exception {
        String email = uniqueEmail();
        String subject = uniqueSubject();
        User existing = saveUser(email, null);
        Account nextAuthRow = new Account();
        nextAuthRow.setId(cuidLike());
        nextAuthRow.setUserId(existing.getId());
        nextAuthRow.setType("oidc");
        nextAuthRow.setProvider("google");
        nextAuthRow.setProviderAccountId(subject);
        nextAuthRow.setAccessToken("ya29.legacy-access-token");
        nextAuthRow.setTokenType("bearer");
        nextAuthRow.setScope("openid https://www.googleapis.com/auth/userinfo.email");
        accountRepository.save(nextAuthRow);

        App app = App.create();
        String changedEmail = "renamed-" + email;
        String location = finish(app, start(app, "web"), new Identity(subject, changedEmail, true, "Same Person"));
        String accessToken = redeemWeb(app, queryParams(location).get("code"));

        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(jsonPath("$.userId").value(existing.getId()));
        assertThat(userRepository.findFirstByEmailIgnoreCase(changedEmail)).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from accounts where user_id = ?", Integer.class, existing.getId())).isEqualTo(1);
    }

    @Test
    void emailThatAlreadyHasAnAccountIsRefusedNotLinked() throws Exception {
        String email = uniqueEmail();
        User owner = saveUser(email, "$2a$10$not-a-real-hash-but-a-password-is-set");
        String subject = uniqueSubject();

        App app = App.create();
        String location = finish(app, start(app, "web"), new Identity(subject, email.toUpperCase(), true, "Someone"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=account_exists");
        assertThat(accountRepository.findByProviderAndProviderAccountId("google", subject)).isEmpty();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(owner.getId()))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .containsExactly(tuple("OAUTH_REFUSED", "account_exists"));
    }

    @Test
    void unverifiedGoogleEmailIsRefused() throws Exception {
        String email = uniqueEmail();
        App app = App.create();

        String location = finish(app, start(app, "web"), new Identity(uniqueSubject(), email, false, "Someone"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=email_unverified");
        assertThat(userRepository.findFirstByEmailIgnoreCase(email)).isEmpty();
    }

    @Test
    void mobileSignInReturnsToTheAppScheme() throws Exception {
        App app = App.create();
        String email = uniqueEmail();

        String location = finish(app, start(app, "mobile"), new Identity(uniqueSubject(), email, true, "Phone User"));

        assertThat(location).startsWith(MOBILE_COMPLETION + "?code=");
        redeemMobile(app, queryParams(location).get("code"));
        assertThat(auditLogRepository.findAllByEmailOrderByCreatedAtAsc(email))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .contains(tuple("LOGIN_SUCCESS", "oauth mobile"));
    }

    @Test
    void codeNeedsTheVerifierAndAWrongOneSpendsIt() throws Exception {
        App app = App.create();
        String location = finish(app, start(app, "web"), new Identity(uniqueSubject(), uniqueEmail(), true, "U"));
        String code = queryParams(location).get("code");

        handoff(app, code, App.create().verifier())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_code"));
        handoff(app, code, app.verifier()).andExpect(status().isBadRequest());

        assertThat(handoffFailures(app)).containsExactlyInAnyOrder("bad_verifier", "unknown_code");
    }

    @Test
    void expiredCodeIsRejected() throws Exception {
        App app = App.create();
        String location = finish(app, start(app, "web"), new Identity(uniqueSubject(), uniqueEmail(), true, "U"));
        String code = queryParams(location).get("code");
        OAuthHandoffCode row = handoffCodeRepository.findById(OAuthHandoffCodes.sha256Hex(code)).orElseThrow();
        assertThat(row.getExpiresAt()).isBefore(Instant.now().plus(OAuthHandoffCodes.TTL).plusSeconds(1));
        row.setExpiresAt(Instant.now().minusSeconds(1));
        handoffCodeRepository.save(row);

        handoff(app, code, app.verifier()).andExpect(status().isBadRequest());

        assertThat(handoffFailures(app)).containsExactly("expired_code");
    }

    @Test
    void startingAgainReplacesTheEarlierSignIn() throws Exception {
        App app = App.create();
        Started first = start(app, "web");
        MvcResult second = mockMvc.perform(get(START)
                        .param("client", "web").param("challenge", app.challenge())
                        .session(first.session()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn();

        String location = callback(app, first.param("state"), (MockHttpSession) second.getRequest().getSession(false))
                .getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
        assertThat(oauthFailures(app)).containsExactly("authorization_request_not_found");
    }

    @Test
    void cancellingAtGoogleReturnsAccessDenied() throws Exception {
        App app = App.create();
        Started started = start(app, "mobile");

        String location = mockMvc.perform(get(CALLBACK)
                        .param("error", "access_denied").param("state", started.param("state"))
                        .session(started.session()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn().getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(MOBILE_COMPLETION + "?error=access_denied");
        assertThat(oauthFailures(app)).containsExactly("access_denied");
    }

    @Test
    void callbackWithoutAStartedSignInFails() throws Exception {
        App app = App.create();

        String location = callback(app, "forged-state", new MockHttpSession()).getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
        assertThat(oauthFailures(app)).containsExactly("authorization_request_not_found");
    }

    /** A client instance: its own IP and its own PKCE-style verifier for the handoff. */
    private record App(String ip, String verifier, String challenge) {

        static App create() {
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            String verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            int n = NEXT_IP.getAndIncrement();
            return new App("10.8." + (n / 250) + "." + (n % 250 + 1), verifier, OAuthHandoffCodes.s256(verifier));
        }
    }

    /** The session Spring opened for the sign-in, and the parameters of the redirect it sent to Google. */
    private record Started(MockHttpSession session, Map<String, String> params) {

        String param(String name) {
            return params.get(name);
        }
    }

    private Started start(App app, String client) throws Exception {
        MvcResult result = mockMvc.perform(get(START)
                        .param("client", client).param("challenge", app.challenge()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn();
        String location = result.getResponse().getRedirectedUrl();
        assertThat(location).startsWith(GOOGLE.baseUrl() + "/authorize?");
        return new Started((MockHttpSession) result.getRequest().getSession(false), queryParams(location));
    }

    /** Google approves the sign-in as {@code identity}; returns where the browser is sent next. */
    private String finish(App app, Started started, Identity identity) throws Exception {
        GOOGLE.willSignIn(identity, started.param("nonce"));
        return callback(app, started.param("state"), started.session()).getResponse().getRedirectedUrl();
    }

    private MvcResult callback(App app, String state, MockHttpSession session) throws Exception {
        return mockMvc.perform(get(CALLBACK)
                        .param("code", "google-authorization-code").param("state", state)
                        .session(session).with(from(app)))
                .andExpect(status().isFound())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andReturn();
    }

    /** A web sign-in ends in the token cookies with no token in the body; returns the access token. */
    private String redeemWeb(App app, String code) throws Exception {
        MockHttpServletResponse response = redeemed(app, code);
        Map<String, Object> body = JsonPath.read(response.getContentAsString(), "$");
        assertThat(body).containsKeys("accessTokenExpiresAt", "refreshTokenExpiresAt")
                .doesNotContainKeys("accessToken", "refreshToken");
        assertThat(response.getCookie(REFRESH_COOKIE)).isNotNull();
        return response.getCookie(ACCESS_COOKIE).getValue();
    }

    /** A mobile sign-in gets its tokens in the body and no cookies; returns the access token. */
    private String redeemMobile(App app, String code) throws Exception {
        MockHttpServletResponse response = redeemed(app, code);
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
        return JsonPath.read(response.getContentAsString(), "$.accessToken");
    }

    private MockHttpServletResponse redeemed(App app, String code) throws Exception {
        return handoff(app, code, app.verifier())
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn().getResponse();
    }

    private ResultActions handoff(App app, String code, String verifier) throws Exception {
        return mockMvc.perform(post("/auth/handoff")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"%s\",\"verifier\":\"%s\"}".formatted(code, verifier))
                .with(from(app)));
    }

    private static RequestPostProcessor from(App app) {
        return request -> {
            request.setRemoteAddr(app.ip());
            return request;
        };
    }

    private static Map<String, String> queryParams(String url) {
        Map<String, String> params = new HashMap<>();
        UriComponentsBuilder.fromUriString(url).build().getQueryParams()
                .forEach((name, values) -> params.put(name, URLDecoder.decode(values.getFirst(), StandardCharsets.UTF_8)));
        return params;
    }

    private List<String> events(String email) {
        return auditLogRepository.findAllByEmailOrderByCreatedAtAsc(email).stream().map(AuditLog::getEvent).toList();
    }

    private List<String> handoffFailures(App app) {
        return details("OAUTH_HANDOFF_FAILURE", app);
    }

    private List<String> oauthFailures(App app) {
        return details("OAUTH_FAILURE", app);
    }

    private List<String> details(String event, App app) {
        return jdbcTemplate.queryForList("""
                select detail from audit_log where event = ? and "ipAddress" = ?""", String.class, event, app.ip());
    }

    private User saveUser(String email, String passwordHash) {
        User user = new User();
        user.setId(cuidLike());
        user.setName("Existing User");
        user.setEmail(email);
        user.setPassword(passwordHash);
        user.setEmailVerified(Instant.now().minusSeconds(86_400));
        return userRepository.save(user);
    }

    /** NextAuth-era rows carry cuid ids, not uuids. */
    private static String cuidLike() {
        return "cl" + UUID.randomUUID().toString().replace("-", "").substring(0, 23);
    }

    private static String uniqueEmail() {
        return "oauth-" + UUID.randomUUID() + "@example.com";
    }

    private static String uniqueSubject() {
        return String.valueOf(100_000_000_000_000_000L + Math.floorMod(RANDOM.nextLong(), 800_000_000_000_000_000L));
    }
}
