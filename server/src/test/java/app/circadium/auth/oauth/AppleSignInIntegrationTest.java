package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.auth.RecordingAccountMailer.Kind;
import app.circadium.auth.oauth.FakeProvider.Identity;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.User;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyFactory;
import java.security.interfaces.ECPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.web.client.RestClient;

/**
 * Sign in with Apple: the form-POST callback, the client secret the server signs for every token request, the
 * name that arrives only once, and the stored refresh token that account deletion revokes.
 */
class AppleSignInIntegrationTest extends SignInTestSupport {

    private static final SignInProvider PROVIDER = SignInProvider.APPLE;
    private static final String FIRST_AUTHORIZATION_USER =
            "{\"name\":{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\"},\"email\":\"ignored@example.com\"}";

    @Autowired
    AppleClientSecret appleClientSecret;

    @Test
    void productionRegistrationUsesApplesEndpointsAndAPostedSecret() {
        ClientRegistration apple = OAuthClientConfig.appleRegistration(properties);

        assertThat(apple.getProviderDetails().getAuthorizationUri()).isEqualTo("https://appleid.apple.com/auth/authorize");
        assertThat(apple.getProviderDetails().getTokenUri()).isEqualTo("https://appleid.apple.com/auth/token");
        assertThat(apple.getProviderDetails().getJwkSetUri()).isEqualTo("https://appleid.apple.com/auth/keys");
        assertThat(apple.getProviderDetails().getIssuerUri()).isEqualTo("https://appleid.apple.com");
        assertThat(apple.getClientAuthenticationMethod()).isEqualTo(ClientAuthenticationMethod.CLIENT_SECRET_POST);
        assertThat(apple.getRedirectUri()).isEqualTo(redirectUri(PROVIDER));
        assertThat(apple.getScopes()).containsExactlyInAnyOrder("openid", "email", "name");
    }

    @Test
    void startAsksForAFormPostWithStateAndNonce() throws Exception {
        Started started = start(PROVIDER, App.create(), "web");

        assertThat(started.params())
                .containsEntry("client_id", APPLE_CLIENT_ID)
                .containsEntry("redirect_uri", redirectUri(PROVIDER))
                .containsEntry("response_mode", "form_post")
                .doesNotContainKeys("code_challenge", "code_challenge_method", "prompt");
        assertThat(started.param("state")).hasSizeGreaterThanOrEqualTo(43);
        assertThat(started.param("nonce")).isNotBlank();
    }

    @Test
    void newAppleUserSignsInThroughTheFormPost() throws Exception {
        App app = App.create();
        String email = "abc" + System.nanoTime() + "@privaterelay.appleid.com";
        String subject = "001234." + System.nanoTime() + ".0042";

        String location = finish(app, start(PROVIDER, app, "web"), Identity.apple(subject, email, "true"),
                "apple-refresh-1", FIRST_AUTHORIZATION_USER);

        assertThat(location).startsWith(WEB_COMPLETION + "?code=");
        String accessToken = redeemWeb(app, queryParams(location).get("code"));
        User user = userRepository.findFirstByEmailIgnoreCase(email).orElseThrow();
        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(jsonPath("$.userId").value(user.getId()));
        assertThat(user.getName()).isEqualTo("Ada Lovelace");
        assertThat(user.getEmailVerified()).isNotNull();
        Account account = accountRepository.findByProviderAndProviderAccountId("apple", subject).orElseThrow();
        assertThat(account.getRefreshToken()).isEqualTo("apple-refresh-1");
        assertThat(account.getAccessToken()).isNull();
    }

    @Test
    void tokenRequestCarriesAFreshlySignedClientSecret() throws Exception {
        App app = App.create();
        Instant before = Instant.now().minusSeconds(1);

        finish(app, start(PROVIDER, app, "web"), Identity.apple("secret-check-" + System.nanoTime(), uniqueEmail(),
                "true"), null, null);

        Map<String, String> tokenRequest = APPLE.lastTokenRequest();
        assertThat(tokenRequest)
                .containsEntry("client_id", APPLE_CLIENT_ID)
                .containsEntry("grant_type", "authorization_code")
                .containsEntry("redirect_uri", redirectUri(PROVIDER))
                .doesNotContainKey("code_verifier");
        assertAppleClientSecret(tokenRequest.get("client_secret"), before);
    }

    @Test
    void laterSignInKeepsTheNameAndStoresTheNewRefreshToken() throws Exception {
        String email = uniqueEmail();
        String subject = "001234." + System.nanoTime() + ".0043";
        App first = App.create();
        finish(first, start(PROVIDER, first, "web"), Identity.apple(subject, email, true), "apple-refresh-1",
                FIRST_AUTHORIZATION_USER);

        App second = App.create();
        String location = finish(second, start(PROVIDER, second, "web"), Identity.apple(subject, email, true),
                "apple-refresh-2", null);

        assertThat(location).startsWith(WEB_COMPLETION + "?code=");
        assertThat(userRepository.findFirstByEmailIgnoreCase(email).orElseThrow().getName()).isEqualTo("Ada Lovelace");
        assertThat(accountRepository.findByProviderAndProviderAccountId("apple", subject).orElseThrow()
                .getRefreshToken()).isEqualTo("apple-refresh-2");
    }

    @Test
    void emailThatAlreadyHasAnAccountIsRefusedNotLinked() throws Exception {
        String email = uniqueEmail();
        saveUser(email, "$2a$10$not-a-real-hash-but-a-password-is-set");
        String subject = "001234." + System.nanoTime() + ".0044";
        App app = App.create();

        String location = finish(app, start(PROVIDER, app, "web"), Identity.apple(subject, email, "true"),
                "apple-refresh", null);

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=account_exists");
        assertThat(accountRepository.findByProviderAndProviderAccountId("apple", subject)).isEmpty();
    }

    /** Sign in with Apple at Work & School reports {@code email_verified: false}. */
    @Test
    void unverifiedAppleEmailWaitsForTheEmailedLink() throws Exception {
        String email = uniqueEmail();
        App app = App.create();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.apple("001234." + System.nanoTime() + ".0045", email, "false"), "apple-refresh", null);

        assertThat(location).isEqualTo(WEB_COMPLETION + "?status=verification_sent");
        assertThat(userRepository.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThat(mailer.latest(Kind.OAUTH_SIGNUP, email)).isPresent();
    }

    @Test
    void cancellingAtAppleReturnsAccessDenied() throws Exception {
        App app = App.create();
        Started started = start(PROVIDER, app, "mobile");

        String location = mockMvc.perform(post(callbackPath(PROVIDER))
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .header(HttpHeaders.ORIGIN, "https://appleid.apple.com")
                        .param("error", "user_cancelled_authorize").param("state", started.param("state"))
                        .session(started.session()).with(from(app)))
                .andExpect(status().isFound())
                .andReturn().getResponse().getRedirectedUrl();

        assertThat(location).isEqualTo(MOBILE_COMPLETION + "?error=access_denied");
        assertThat(details("OAUTH_FAILURE", app)).containsExactly("access_denied");
    }

    @Test
    void deletingTheAccountRevokesTheAppleAuthorization() throws Exception {
        String email = uniqueEmail();
        String refreshToken = "apple-refresh-" + System.nanoTime();
        App app = App.create();
        String location = finish(app, start(PROVIDER, app, "mobile"),
                Identity.apple("001234." + System.nanoTime() + ".0046", email, "true"), refreshToken, null);
        String accessToken = redeemMobile(app, queryParams(location).get("code"));

        mockMvc.perform(post("/account/deletion")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirmEmail\":\"%s\"}".formatted(email))
                        .with(from(app)))
                .andExpect(status().isAccepted());
        assertThat(appleRevoker.revoked()).doesNotContain(refreshToken);
        String deletionToken = mailer.latest(Kind.ACCOUNT_DELETION, email).orElseThrow();

        mockMvc.perform(post("/account/deletion/confirm")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"%s\"}".formatted(deletionToken))
                        .with(from(app)))
                .andExpect(status().isOk());

        assertThat(userRepository.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThat(appleRevoker.revoked()).contains(refreshToken);
    }

    @Test
    void revocationPostsTheRefreshTokenWithASignedSecret() throws Exception {
        Instant before = Instant.now().minusSeconds(1);
        AppleRevocationClient client = new AppleRevocationClient(RestClient.create(), APPLE.baseUrl() + "/revoke",
                appleClientSecret, Runnable::run, Duration.ZERO);

        client.revoke("refresh-to-revoke");

        Map<String, String> request = APPLE.revokeRequests().getLast();
        assertThat(request)
                .containsEntry("client_id", APPLE_CLIENT_ID)
                .containsEntry("token", "refresh-to-revoke")
                .containsEntry("token_type_hint", "refresh_token");
        assertAppleClientSecret(request.get("client_secret"), before);
    }

    @Test
    void nameFieldIsReadDefensively() {
        assertThat(SignInProvider.appleName(null)).isNull();
        assertThat(SignInProvider.appleName("not json")).isNull();
        assertThat(SignInProvider.appleName("{\"email\":\"a@example.com\"}")).isNull();
        assertThat(SignInProvider.appleName("{\"name\":{\"firstName\":\"  Ada\\u0007 \",\"lastName\":null}}"))
                .isEqualTo("Ada");
        assertThat(SignInProvider.appleName("{\"name\":{\"firstName\":\"" + "x".repeat(500) + "\"}}"))
                .hasSize(100);
    }

    /** ES256 with the configured key id, issued by the team for the Services ID, for Apple, for minutes only. */
    private static void assertAppleClientSecret(String secret, Instant notBefore) throws Exception {
        SignedJWT jwt = SignedJWT.parse(secret);
        assertThat(jwt.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.ES256);
        assertThat(jwt.getHeader().getKeyID()).isEqualTo(APPLE_KEY_ID);
        assertThat(jwt.verify(new ECDSAVerifier(applePublicKey()))).isTrue();
        JWTClaimsSet claims = jwt.getJWTClaimsSet();
        assertThat(claims.getIssuer()).isEqualTo(APPLE_TEAM_ID);
        assertThat(claims.getSubject()).isEqualTo(APPLE_CLIENT_ID);
        assertThat(claims.getAudience()).isEqualTo(List.of("https://appleid.apple.com"));
        assertThat(claims.getIssueTime().toInstant()).isAfterOrEqualTo(notBefore.truncatedTo(ChronoUnit.SECONDS));
        assertThat(Duration.between(claims.getIssueTime().toInstant(), claims.getExpirationTime().toInstant()))
                .isPositive()
                .isLessThanOrEqualTo(Duration.ofMinutes(5));
    }

    private static ECPublicKey applePublicKey() throws Exception {
        String base64 = APPLE_PUBLIC_KEY.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", "");
        return (ECPublicKey) KeyFactory.getInstance("EC")
                .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(base64)));
    }
}
