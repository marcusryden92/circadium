package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.auth.RecordingAccountMailer.Kind;
import app.circadium.auth.oauth.FakeProvider.Identity;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.entity.OAuthPendingSignup;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.OAuthPendingSignupRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.client.registration.ClientRegistration;

/**
 * Microsoft sign-in: the tenant-aware issuer check, and the emailed link that stands between a Microsoft login and
 * a new account, because Microsoft does not vouch for its users' email addresses.
 */
class MicrosoftSignInIntegrationTest extends SignInTestSupport {

    private static final SignInProvider PROVIDER = SignInProvider.MICROSOFT;

    @Autowired
    OAuthPendingSignupRepository pendingSignupRepository;

    @Test
    void productionRegistrationUsesTheCommonEndpointsPkceAndTheExactCallback() {
        ClientRegistration microsoft = OAuthClientConfig.microsoftRegistration(properties);

        assertThat(microsoft.getProviderDetails().getAuthorizationUri())
                .isEqualTo("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
        assertThat(microsoft.getProviderDetails().getTokenUri())
                .isEqualTo("https://login.microsoftonline.com/common/oauth2/v2.0/token");
        assertThat(microsoft.getProviderDetails().getJwkSetUri())
                .isEqualTo("https://login.microsoftonline.com/common/discovery/v2.0/keys");
        assertThat(microsoft.getProviderDetails().getIssuerUri())
                .as("a fixed issuer would refuse every tenant's tokens; MicrosoftIssuerValidator checks it")
                .isNull();
        assertThat(microsoft.getProviderDetails().getConfigurationMetadata())
                .containsEntry(OAuthClientConfig.ISSUER_METADATA,
                        "https://login.microsoftonline.com/{tenantid}/v2.0");
        assertThat(microsoft.getRedirectUri()).isEqualTo(redirectUri(PROVIDER));
        assertThat(microsoft.getScopes()).containsExactlyInAnyOrder("openid", "email", "profile");
        assertThat(microsoft.getClientSettings().isRequireProofKey()).isTrue();
    }

    @Test
    void startAsksForTheAccountPickerWithPkceAndNonce() throws Exception {
        Started started = start(PROVIDER, App.create(), "web");

        assertThat(started.params())
                .containsEntry("client_id", MICROSOFT_CLIENT_ID)
                .containsEntry("redirect_uri", redirectUri(PROVIDER))
                .containsEntry("prompt", "select_account")
                .containsEntry("code_challenge_method", "S256")
                .doesNotContainKey("response_mode");
        assertThat(started.param("nonce")).isNotBlank();
    }

    @Test
    void firstSignInMailsALinkInsteadOfCreatingAnAccount() throws Exception {
        App app = App.create();
        String email = uniqueEmail();
        String objectId = UUID.randomUUID().toString();

        Started started = start(PROVIDER, app, "web");
        String location = finish(app, started, Identity.microsoft(objectId, email, "Ms User"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?status=verification_sent");
        assertThat(MICROSOFT.lastTokenRequest())
                .containsEntry("client_id", MICROSOFT_CLIENT_ID)
                .containsEntry("client_secret", "test-microsoft-secret");
        assertThat(OAuthHandoffCodes.s256(MICROSOFT.lastTokenRequest().get("code_verifier")))
                .isEqualTo(started.param("code_challenge"));
        assertThat(userRepository.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThat(accountRepository.findByProviderAndProviderAccountId("microsoft", objectId)).isEmpty();
        assertThat(mailer.latest(Kind.OAUTH_SIGNUP, email)).isPresent();
        OAuthPendingSignup pending = pendingSignupRepository.findByProviderAndSubject("microsoft", objectId).orElseThrow();
        assertThat(pending.getEmail()).isEqualTo(email);
        assertThat(pending.getTokenHash())
                .as("only the hash of the emailed token is stored")
                .isEqualTo(OAuthHandoffCodes.sha256Hex(mailer.latest(Kind.OAUTH_SIGNUP, email).orElseThrow()));
        assertThat(events(email)).containsExactly("OAUTH_SIGNUP_PENDING");
    }

    @Test
    void openingTheLinkCreatesTheAccountWhichThenSignsInWithMicrosoft() throws Exception {
        App app = App.create();
        String email = uniqueEmail();
        String objectId = UUID.randomUUID().toString();
        Identity identity = Identity.microsoft(objectId, email, "Ms User");
        finish(app, start(PROVIDER, app, "web"), identity);
        String token = mailer.latest(Kind.OAUTH_SIGNUP, email).orElseThrow();

        MockHttpServletResponse confirmed = confirmSignup(app, token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provider").value("microsoft"))
                .andReturn().getResponse();

        assertThat(confirmed.getHeaders(HttpHeaders.SET_COOKIE))
                .as("opening the link signs nobody in")
                .isEmpty();
        User user = userRepository.findFirstByEmailIgnoreCase(email).orElseThrow();
        assertThat(user.getEmailVerified()).isNotNull();
        assertThat(user.getPassword()).isNull();
        assertThat(user.getName()).isEqualTo("Ms User");
        Account account = accountRepository.findByProviderAndProviderAccountId("microsoft", objectId).orElseThrow();
        assertThat(account.getUserId()).isEqualTo(user.getId());
        assertThat(accountRepository.findByProviderAndProviderAccountId("microsoft", identity.subject()))
                .as("keyed on oid, not the pairwise sub")
                .isEmpty();
        assertThat(pendingSignupRepository.findByProviderAndSubject("microsoft", objectId)).isEmpty();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(user.getId()))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .containsExactly(tuple("OAUTH_REGISTER", "microsoft email_link"));

        confirmSignup(app, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_token"));

        App later = App.create();
        String location = finish(later, start(PROVIDER, later, "web"), identity);
        assertThat(location).startsWith(WEB_COMPLETION + "?code=");
        String accessToken = redeemWeb(later, queryParams(location).get("code"));
        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(jsonPath("$.userId").value(user.getId()));
    }

    /**
     * The DoD case: an address that already has an account is still refused, never linked. Microsoft does not
     * vouch for the address, so the browser is told the same as for a new one and the owner hears by mail.
     */
    @Test
    void emailThatAlreadyHasAnAccountIsRefusedByMailNotLinked() throws Exception {
        String email = uniqueEmail();
        User owner = saveUser(email, "$2a$10$not-a-real-hash-but-a-password-is-set");
        String objectId = UUID.randomUUID().toString();
        App app = App.create();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.microsoft(objectId, email.toUpperCase(), "Someone"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?status=verification_sent");
        assertThat(accountRepository.findByProviderAndProviderAccountId("microsoft", objectId)).isEmpty();
        assertThat(pendingSignupRepository.findByProviderAndSubject("microsoft", objectId)).isEmpty();
        assertThat(mailer.latest(Kind.EXISTING_ACCOUNT, email)).contains("true");
        assertThat(mailer.count(Kind.OAUTH_SIGNUP, email)).isZero();
        assertThat(auditLogRepository.findAllByUserIdOrderByCreatedAtAsc(owner.getId()))
                .extracting(AuditLog::getEvent, AuditLog::getDetail)
                .containsExactly(tuple("OAUTH_REFUSED", "account_exists"));
    }

    @Test
    void addressClaimedBeforeTheLinkIsOpenedIsRefused() throws Exception {
        App app = App.create();
        String email = uniqueEmail();
        String objectId = UUID.randomUUID().toString();
        finish(app, start(PROVIDER, app, "web"), Identity.microsoft(objectId, email, "Ms User"));
        String token = mailer.latest(Kind.OAUTH_SIGNUP, email).orElseThrow();
        saveUser(email, "$2a$10$registered-with-a-password-meanwhile");

        confirmSignup(app, token)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("email_in_use"));

        assertThat(accountRepository.findByProviderAndProviderAccountId("microsoft", objectId)).isEmpty();
        assertThat(details("OAUTH_SIGNUP_LINK_FAILURE", app)).containsExactly("email_in_use");
    }

    @Test
    void expiredLinkIsRejected() throws Exception {
        App app = App.create();
        String email = uniqueEmail();
        String objectId = UUID.randomUUID().toString();
        finish(app, start(PROVIDER, app, "web"), Identity.microsoft(objectId, email, "Ms User"));
        String token = mailer.latest(Kind.OAUTH_SIGNUP, email).orElseThrow();
        OAuthPendingSignup pending = pendingSignupRepository.findByProviderAndSubject("microsoft", objectId).orElseThrow();
        assertThat(pending.getExpiresAt()).isBefore(Instant.now().plus(OAuthPendingSignups.TTL).plusSeconds(1));
        pending.setExpiresAt(Instant.now().minusSeconds(1));
        pendingSignupRepository.save(pending);

        confirmSignup(app, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("expired_token"));

        assertThat(userRepository.findFirstByEmailIgnoreCase(email)).isEmpty();
        assertThat(details("OAUTH_SIGNUP_LINK_FAILURE", app)).containsExactly("expired_link");
    }

    @Test
    void malformedOrUnknownLinksAreRejected() throws Exception {
        App app = App.create();

        confirmSignup(app, "not-a-token").andExpect(status().isBadRequest());
        confirmSignup(app, "A".repeat(43))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_token"));
    }

    @Test
    void signingInAgainSoonSendsNoSecondMailAndLaterReplacesTheLink() throws Exception {
        String email = uniqueEmail();
        String objectId = UUID.randomUUID().toString();
        Identity identity = Identity.microsoft(objectId, email, "Ms User");
        App app = App.create();
        finish(app, start(PROVIDER, app, "web"), identity);
        String firstToken = mailer.latest(Kind.OAUTH_SIGNUP, email).orElseThrow();

        finish(app, start(PROVIDER, app, "web"), identity);
        assertThat(mailer.count(Kind.OAUTH_SIGNUP, email)).isEqualTo(1);
        assertThat(details("OAUTH_SIGNUP_PENDING", app)).containsExactly("microsoft", "microsoft resend_cooldown");

        OAuthPendingSignup pending = pendingSignupRepository.findByProviderAndSubject("microsoft", objectId).orElseThrow();
        pending.setCreatedAt(Instant.now().minus(OAuthPendingSignups.RESEND_COOLDOWN).minusSeconds(1));
        pendingSignupRepository.save(pending);
        finish(app, start(PROVIDER, app, "web"), identity);
        String secondToken = mailer.latest(Kind.OAUTH_SIGNUP, email).orElseThrow();

        assertThat(secondToken).isNotEqualTo(firstToken);
        confirmSignup(app, firstToken).andExpect(status().isBadRequest());
        confirmSignup(app, secondToken).andExpect(status().isOk());
    }

    @Test
    void workAccountFromAnotherTenantSignsIn() throws Exception {
        App app = App.create();
        String email = uniqueEmail();
        String tenant = UUID.randomUUID().toString();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.microsoft(UUID.randomUUID().toString(), email, "Work User").with("tid", tenant));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?status=verification_sent");
    }

    @Test
    void issuerThatDoesNotMatchTheTenantIsRejected() throws Exception {
        App app = App.create();
        String email = uniqueEmail();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.microsoft(UUID.randomUUID().toString(), email, "Someone")
                        .with("iss", MICROSOFT.microsoftIssuer(UUID.randomUUID().toString())));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
        assertThat(details("OAUTH_FAILURE", app)).containsExactly("invalid_id_token");
        assertThat(mailer.count(Kind.OAUTH_SIGNUP, email)).isZero();
    }

    @Test
    void tenantIdThatIsNotAGuidIsRejected() throws Exception {
        App app = App.create();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.microsoft(UUID.randomUUID().toString(), uniqueEmail(), "Someone").with("tid", "common"));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
        assertThat(details("OAUTH_FAILURE", app)).containsExactly("invalid_id_token");
    }

    @Test
    void workAccountWithoutAMailAttributeUsesItsUsername() throws Exception {
        App app = App.create();
        String email = uniqueEmail();

        finish(app, start(PROVIDER, app, "web"),
                Identity.microsoft(UUID.randomUUID().toString(), email, "Work User").with("email", null));

        assertThat(mailer.latest(Kind.OAUTH_SIGNUP, email)).isPresent();
    }

    @Test
    void tokenWithoutAnObjectIdFails() throws Exception {
        App app = App.create();

        String location = finish(app, start(PROVIDER, app, "web"),
                Identity.microsoft(UUID.randomUUID().toString(), uniqueEmail(), "Someone").with("oid", null));

        assertThat(location).isEqualTo(WEB_COMPLETION + "?error=oauth_failed");
    }
}
