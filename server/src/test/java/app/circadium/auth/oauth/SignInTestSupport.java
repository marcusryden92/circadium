package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.RecordingAccountMailer;
import app.circadium.auth.oauth.FakeProvider.Identity;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.AccountRepository;
import app.circadium.persistence.repository.AuditLogRepository;
import app.circadium.persistence.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
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
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The setup every sign-in test shares: all three providers registered against {@link FakeProvider}s, a recording
 * mailer and Apple revoker, and helpers that drive the start, callback and handoff the way a browser would. The
 * subclasses share one Spring context, and each test uses its own client IP and identities so rate limits and
 * accounts never leak between tests.
 */
@SpringBootTest(properties = {
        "circadium.oauth.google.client-id=" + SignInTestSupport.GOOGLE_CLIENT_ID,
        "circadium.oauth.google.client-secret=test-google-secret",
        "circadium.oauth.microsoft.client-id=" + SignInTestSupport.MICROSOFT_CLIENT_ID,
        "circadium.oauth.microsoft.client-secret=test-microsoft-secret",
        "circadium.oauth.apple.client-id=" + SignInTestSupport.APPLE_CLIENT_ID,
        "circadium.oauth.apple.team-id=" + SignInTestSupport.APPLE_TEAM_ID,
        "circadium.oauth.apple.key-id=" + SignInTestSupport.APPLE_KEY_ID,
        "circadium.oauth.apple.private-key=" + SignInTestSupport.APPLE_PRIVATE_KEY,
        "circadium.oauth.redirect-base-url=http://localhost"})
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, SignInTestSupport.FakeProviders.class})
abstract class SignInTestSupport {

    static final String GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    static final String MICROSOFT_CLIENT_ID = "00000000-0000-0000-0000-00000000c1d0";
    static final String APPLE_CLIENT_ID = "app.circadium.test";
    static final String APPLE_TEAM_ID = "TEAMID1234";
    static final String APPLE_KEY_ID = "KEYID12345";

    /** A throwaway P-256 key, written the way a secret store with flattened line breaks would hold a .p8 file. */
    static final String APPLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\n"
            + "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgFLNYEr2j5QpNd3My\\n"
            + "GDaulJMfkjokhAQmZ/dXuqlpGrShRANCAAR3pflokRxiwxiP1Q2hiLDyQHBtvPS4\\n"
            + "SO5v/Kw6QLDR9U8jAZO6HNstKg76v9lOMLobWW1qoucPuq2XRXJuuyMM\\n"
            + "-----END PRIVATE KEY-----";

    static final String APPLE_PUBLIC_KEY = """
            -----BEGIN PUBLIC KEY-----
            MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEd6X5aJEcYsMYj9UNoYiw8kBwbbz0
            uEjub/ysOkCw0fVPIwGTuhzbLSoO+r/ZTjC6G1ltaqLnD7qtl0VybrsjDA==
            -----END PUBLIC KEY-----""";

    static final FakeProvider GOOGLE = FakeProvider.start(SignInProvider.GOOGLE, GOOGLE_CLIENT_ID);
    static final FakeProvider MICROSOFT = FakeProvider.start(SignInProvider.MICROSOFT, MICROSOFT_CLIENT_ID);
    static final FakeProvider APPLE = FakeProvider.start(SignInProvider.APPLE, APPLE_CLIENT_ID);

    static final String WEB_COMPLETION = "http://localhost:3000/auth/oauth/complete";
    static final String MOBILE_COMPLETION = "circadium://auth/oauth/complete";
    static final String ACCESS_COOKIE = "circadium_access";
    static final String REFRESH_COOKIE = "circadium_refresh";

    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);
    private static final SecureRandom RANDOM = new SecureRandom();

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
    JdbcTemplate jdbcTemplate;

    @Autowired
    RecordingAccountMailer mailer;

    @Autowired
    RecordingAppleRevoker appleRevoker;

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeProviders {
        @Bean
        @Primary
        ClientRegistrationRepository fakeRegistrations(OAuthProperties properties) {
            return new InMemoryClientRegistrationRepository(GOOGLE.registration(properties),
                    MICROSOFT.registration(properties), APPLE.registration(properties));
        }

        @Bean
        @Primary
        RecordingAccountMailer recordingAccountMailer() {
            return new RecordingAccountMailer();
        }

        @Bean
        @Primary
        RecordingAppleRevoker recordingAppleRevoker() {
            return new RecordingAppleRevoker();
        }
    }

    static final class RecordingAppleRevoker implements AppleTokenRevoker {

        private final List<String> revoked = new CopyOnWriteArrayList<>();

        @Override
        public void revoke(String refreshToken) {
            revoked.add(refreshToken);
        }

        List<String> revoked() {
            return List.copyOf(revoked);
        }
    }

    /** A client instance: its own IP and its own PKCE-style verifier for the handoff. */
    record App(String ip, String verifier, String challenge) {

        static App create() {
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            String verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            int n = NEXT_IP.getAndIncrement();
            return new App("10.8." + (n / 250) + "." + (n % 250 + 1), verifier, OAuthHandoffCodes.s256(verifier));
        }
    }

    /** The session Spring opened for the sign-in, and the parameters of the redirect it sent to the provider. */
    record Started(SignInProvider provider, MockHttpSession session, Map<String, String> params) {

        String param(String name) {
            return params.get(name);
        }
    }

    static String startPath(SignInProvider provider) {
        return "/oauth2/authorization/" + provider.registrationId();
    }

    static String callbackPath(SignInProvider provider) {
        return "/login/oauth2/code/" + provider.registrationId();
    }

    static String redirectUri(SignInProvider provider) {
        return "http://localhost" + callbackPath(provider);
    }

    static FakeProvider fake(SignInProvider provider) {
        return switch (provider) {
            case GOOGLE -> GOOGLE;
            case MICROSOFT -> MICROSOFT;
            case APPLE -> APPLE;
        };
    }

    Started start(SignInProvider provider, App app, String client) throws Exception {
        MvcResult result = mockMvc.perform(get(startPath(provider))
                        .param("client", client).param("challenge", app.challenge()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn();
        String location = result.getResponse().getRedirectedUrl();
        assertThat(location).startsWith(fake(provider).baseUrl() + "/authorize?");
        return new Started(provider, (MockHttpSession) result.getRequest().getSession(false), queryParams(location));
    }

    /** The provider approves the sign-in as {@code identity}; returns where the browser is sent next. */
    String finish(App app, Started started, Identity identity) throws Exception {
        return finish(app, started, identity, null, null);
    }

    /**
     * @param refreshToken what the provider's token endpoint returns as the refresh token (Apple), or null
     * @param appleUser Apple's {@code user} form field, sent only on a first authorization, or null
     */
    String finish(App app, Started started, Identity identity, String refreshToken, String appleUser)
            throws Exception {
        fake(started.provider()).willSignIn(identity, started.param("nonce"), refreshToken);
        return callback(app, started.provider(), started.param("state"), started.session(), appleUser)
                .getResponse().getRedirectedUrl();
    }

    /**
     * Apple answers with a cross-site form POST (carrying Apple's {@code Origin}); everyone else redirects with a
     * GET.
     */
    MvcResult callback(App app, SignInProvider provider, String state, MockHttpSession session, String appleUser)
            throws Exception {
        MockHttpServletRequestBuilder request;
        if (provider == SignInProvider.APPLE) {
            request = post(callbackPath(provider))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .header(HttpHeaders.ORIGIN, "https://appleid.apple.com");
            if (appleUser != null) {
                request.param("user", appleUser);
            }
        } else {
            request = get(callbackPath(provider));
        }
        return mockMvc.perform(request
                        .param("code", provider.registrationId() + "-authorization-code")
                        .param("state", state)
                        .session(session)
                        .with(from(app)))
                .andExpect(status().isFound())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andReturn();
    }

    /** A web sign-in ends in the token cookies with no token in the body; returns the access token. */
    String redeemWeb(App app, String code) throws Exception {
        MockHttpServletResponse response = redeemed(app, code);
        Map<String, Object> body = JsonPath.read(response.getContentAsString(), "$");
        assertThat(body).containsKeys("accessTokenExpiresAt", "refreshTokenExpiresAt")
                .doesNotContainKeys("accessToken", "refreshToken");
        assertThat(response.getCookie(REFRESH_COOKIE)).isNotNull();
        return response.getCookie(ACCESS_COOKIE).getValue();
    }

    /** A mobile sign-in gets its tokens in the body and no cookies; returns the access token. */
    String redeemMobile(App app, String code) throws Exception {
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

    ResultActions handoff(App app, String code, String verifier) throws Exception {
        return mockMvc.perform(post("/auth/handoff")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"%s\",\"verifier\":\"%s\"}".formatted(code, verifier))
                .with(from(app)));
    }

    ResultActions confirmSignup(App app, String token) throws Exception {
        return mockMvc.perform(post("/auth/oauth/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"%s\"}".formatted(token))
                .with(from(app)));
    }

    static RequestPostProcessor from(App app) {
        return request -> {
            request.setRemoteAddr(app.ip());
            return request;
        };
    }

    static Map<String, String> queryParams(String url) {
        Map<String, String> params = new HashMap<>();
        UriComponentsBuilder.fromUriString(url).build().getQueryParams()
                .forEach((name, values) -> params.put(name, URLDecoder.decode(values.getFirst(), StandardCharsets.UTF_8)));
        return params;
    }

    List<String> events(String email) {
        return auditLogRepository.findAllByEmailOrderByCreatedAtAsc(email).stream().map(AuditLog::getEvent).toList();
    }

    List<String> details(String event, App app) {
        return jdbcTemplate.queryForList("""
                select detail from audit_log where event = ? and "ipAddress" = ?""", String.class, event, app.ip());
    }

    User saveUser(String email, String passwordHash) {
        User user = new User();
        user.setId(cuidLike());
        user.setName("Existing User");
        user.setEmail(email);
        user.setPassword(passwordHash);
        user.setEmailVerified(Instant.now().minusSeconds(86_400));
        return userRepository.save(user);
    }

    /** NextAuth-era rows carry cuid ids, not uuids. */
    static String cuidLike() {
        return "cl" + UUID.randomUUID().toString().replace("-", "").substring(0, 23);
    }

    static String uniqueEmail() {
        return "oauth-" + UUID.randomUUID() + "@example.com";
    }

    static String uniqueSubject() {
        return String.valueOf(100_000_000_000_000_000L + Math.floorMod(RANDOM.nextLong(), 800_000_000_000_000_000L));
    }
}
