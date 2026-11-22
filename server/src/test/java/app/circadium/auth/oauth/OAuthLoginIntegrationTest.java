package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.auth.RecordingAccountMailer.Kind;
import app.circadium.auth.oauth.FakeProvider.Identity;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.OAuthHandoffCode;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.OAuthHandoffCodeRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Google sign-in end to end, and the parts every provider shares: the start redirect, the callback (against
 * {@link FakeProvider}), account matching, and the handoff that turns a finished sign-in into tokens.
 */
class OAuthLoginIntegrationTest extends SignInTestSupport {

    private static final SignInProvider PROVIDER = SignInProvider.GOOGLE;
    private static final String START = startPath(PROVIDER);
    private static final String CALLBACK = callbackPath(PROVIDER);

    @Autowired
    OAuthHandoffCodeRepository handoffCodeRepository;

    @Test
    void productionRegistrationUsesGooglePkceAndTheExactCallback() {
        ClientRegistration google = OAuthClientConfig.googleRegistration(properties);

        assertThat(google.getProviderDetails().getAuthorizationUri()).startsWith("https://accounts.google.com/");
        assertThat(google.getProviderDetails().getIssuerUri()).isEqualTo("https://accounts.google.com");
        assertThat(google.getRedirectUri()).isEqualTo(redirectUri(PROVIDER));
        assertThat(google.getScopes()).containsExactlyInAnyOrder("openid", "email", "profile");
        assertThat(google.getClientSettings().isRequireProofKey()).isTrue();
    }

    @Test
    void startSendsTheBrowserToGoogleWithStatePkceAndNonce() throws Exception {
        App app = App.create();
        Started started = start(PROVIDER, app, "web");

        assertThat(started.params())
                .containsEntry("response_type", "code")
                .containsEntry("client_id", GOOGLE_CLIENT_ID)
                .containsEntry("redirect_uri", redirectUri(PROVIDER))
                .containsEntry("code_challenge_method", "S256")
                .doesNotContainKeys("response_mode", "prompt");
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

        Started started = start(PROVIDER, app, "web");
        String location = finish(app, started, Identity.google(subject, email, true, "Google User"));

        assertThat(location).startsWith(WEB_COMPLETION + "?code=");
        Map<String, String> tokenRequest = GOOGLE.lastTokenRequest();
        assertThat(tokenRequest)
                .containsEntry("grant_type", "authorization_code")
                .containsEntry("redirect_uri", redirectUri(PROVIDER));
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
        assertThat(account.getRefreshToken()).isNull();
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
        nextAuthRow.setRefreshToken("1//legacy-refresh-token");
        nextAuthRow.setTokenType("bearer");
        nextAuthRow.setScope("openid https://www.googleapis.com/auth/userinfo.email");
        accountRepository.save(nextAuthRow);

        App app = App.create();
        String changedEmail = "renamed-" + email;
        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.google(subject, changedEmail, true, "Same Person"));
        String accessToken = redeemWeb(app, queryParams(location).get("code"));

        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(jsonPath("$.userId").value(existing.getId()));
        assertThat(userRepository.findFirstByEmailIgnoreCase(changedEmail)).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from accounts where user_id = ?", Integer.class, existing.getId())).isEqualTo(1);
        assertThat(accountRepository.findById(nextAuthRow.getId()).orElseThrow().getRefreshToken())
                .as("only Apple's refresh token is ever written; a legacy one is left alone")
                .isEqualTo("1//legacy-refresh-token");
    }

    @Test
    void emailThatAlreadyHasAnAccountIsRefusedNotLinked() throws Exception {
        String email = uniqueEmail();
        User owner = saveUser(email, "$2a$10$not-a-real-hash-but-a-password-is-set");
        String subject = uniqueSubject();

        App app = App.create();
        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.google(subject, email.toUpperCase(), true, "Someone"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=account_exists");
        assertThat(accountRepository.findByProviderAndProviderAccountId("google", subject)).isEmpty();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(owner.getId()))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .containsExactly(tuple("OAUTH_REFUSED", "account_exists"));
    }

    /** Google vouches for most addresses; one it does not gets the same emailed step as every Microsoft one. */
    @Test
    void unverifiedGoogleEmailWaitsForTheEmailedLink() throws Exception {
        String email = uniqueEmail();
        App app = App.create();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.google(uniqueSubject(), email, false, "Someone"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?status=verification_sent");
        assertThat(userRepository.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThat(mailer.latest(Kind.OAUTH_SIGNUP, email)).isPresent();
    }

    @Test
    void identityWithoutAnEmailIsRefused() throws Exception {
        App app = App.create();
        String subject = uniqueSubject();

        String location = finish(app, start(PROVIDER, app, "web"), Identity.google(subject, null, true, "Someone"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=email_missing");
        assertThat(accountRepository.findByProviderAndProviderAccountId("google", subject)).isEmpty();
    }

    @Test
    void mobileSignInReturnsToTheAppScheme() throws Exception {
        App app = App.create();
        String email = uniqueEmail();

        String location = finish(app, start(PROVIDER, app, "mobile"),
                Identity.google(uniqueSubject(), email, true, "Phone User"));

        assertThat(location).startsWith(MOBILE_COMPLETION + "?code=");
        redeemMobile(app, queryParams(location).get("code"));
        assertThat(auditLogRepository.findAllByEmailOrderByCreatedAtAsc(email))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .contains(tuple("LOGIN_SUCCESS", "oauth mobile"));
    }

    @Test
    void codeNeedsTheVerifierAndAWrongOneSpendsIt() throws Exception {
        App app = App.create();
        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.google(uniqueSubject(), uniqueEmail(), true, "U"));
        String code = queryParams(location).get("code");

        handoff(app, code, App.create().verifier())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_code"));
        handoff(app, code, app.verifier()).andExpect(status().isBadRequest());

        assertThat(details("OAUTH_HANDOFF_FAILURE", app)).containsExactlyInAnyOrder("bad_verifier", "unknown_code");
    }

    @Test
    void expiredCodeIsRejected() throws Exception {
        App app = App.create();
        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.google(uniqueSubject(), uniqueEmail(), true, "U"));
        String code = queryParams(location).get("code");
        OAuthHandoffCode row = handoffCodeRepository.findById(OAuthHandoffCodes.sha256Hex(code)).orElseThrow();
        assertThat(row.getExpiresAt()).isBefore(Instant.now().plus(OAuthHandoffCodes.TTL).plusSeconds(1));
        row.setExpiresAt(Instant.now().minusSeconds(1));
        handoffCodeRepository.save(row);

        handoff(app, code, app.verifier()).andExpect(status().isBadRequest());

        assertThat(details("OAUTH_HANDOFF_FAILURE", app)).containsExactly("expired_code");
    }

    @Test
    void startingAgainReplacesTheEarlierSignIn() throws Exception {
        App app = App.create();
        Started first = start(PROVIDER, app, "web");
        MvcResult second = mockMvc.perform(get(START)
                        .param("client", "web").param("challenge", app.challenge())
                        .session(first.session()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn();

        String location = callback(app, PROVIDER, first.param("state"),
                (MockHttpSession) second.getRequest().getSession(false), null).getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
        assertThat(details("OAUTH_FAILURE", app)).containsExactly("authorization_request_not_found");
    }

    @Test
    void cancellingAtGoogleReturnsAccessDenied() throws Exception {
        App app = App.create();
        Started started = start(PROVIDER, app, "mobile");

        String location = mockMvc.perform(get(CALLBACK)
                        .param("error", "access_denied").param("state", started.param("state"))
                        .session(started.session()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn().getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(MOBILE_COMPLETION + "?error=access_denied");
        assertThat(details("OAUTH_FAILURE", app)).containsExactly("access_denied");
    }

    @Test
    void callbackWithoutAStartedSignInFails() throws Exception {
        App app = App.create();

        String location = callback(app, PROVIDER, "forged-state", new MockHttpSession(), null)
                .getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
        assertThat(details("OAUTH_FAILURE", app)).containsExactly("authorization_request_not_found");
    }

    @Test
    void listedProvidersMustBeKnown() {
        OAuthProperties typo = new OAuthProperties(List.of("google", "facebook"), properties.google(),
                properties.microsoft(), properties.apple(), properties.redirectBaseUrl(),
                properties.webCompletionUrl(), properties.mobileCompletionUrl());

        assertThatThrownBy(() -> OAuthClientConfig.listedProviders(typo)).hasMessageContaining("facebook");
    }
}
