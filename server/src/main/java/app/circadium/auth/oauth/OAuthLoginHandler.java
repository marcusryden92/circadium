package app.circadium.auth.oauth;

import app.circadium.auth.AuditEvent;
import app.circadium.auth.AuditLogger;
import app.circadium.auth.ClientInfo;
import app.circadium.auth.ClientType;
import app.circadium.auth.oauth.OAuthAccountService.ProviderIdentity;
import app.circadium.auth.oauth.OAuthAccountService.SignInResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Finishes a sign-in after Spring has verified Google's response (state, PKCE, the ID token's signature, issuer,
 * audience and nonce). Success matches or creates the account and sends the browser back to the client that
 * started the sign-in with a one-time handoff code; anything else sends it back with an {@code error}:
 *
 * <ul>
 *   <li>{@code access_denied}: the user cancelled at Google
 *   <li>{@code account_exists}: the email belongs to an account that does not sign in with Google
 *   <li>{@code email_unverified}: Google does not vouch for the email
 *   <li>{@code oauth_failed}: anything else; the audit log has the details
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OAuthLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

    static final String ACCESS_DENIED = "access_denied";
    static final String OAUTH_FAILED = "oauth_failed";

    private final OAuthAccountService accountService;
    private final OAuthHandoffCodes handoffCodes;
    private final OAuthProperties properties;
    private final AuditLogger auditLogger;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        PendingOAuthLogin pending = PendingOAuthLogin.take(request);
        if (pending == null
                || !(authentication instanceof OAuth2AuthenticationToken token)
                || !(token.getPrincipal() instanceof OidcUser user)) {
            log.error("Google sign-in succeeded without a pending sign-in or an OpenID Connect user");
            redirect(response, ClientType.WEB, "error", OAUTH_FAILED);
            return;
        }
        ProviderIdentity identity = new ProviderIdentity(token.getAuthorizedClientRegistrationId(),
                user.getSubject(), user.getEmail(), Boolean.TRUE.equals(user.getEmailVerified()),
                user.getFullName(), user.getPicture());
        try {
            switch (accountService.signIn(identity, ClientInfo.from(request))) {
                case SignInResult.SignedIn signedIn -> redirect(response, pending.client(), "code",
                        handoffCodes.issue(signedIn.user().getId(), pending.client(), pending.challenge()));
                case SignInResult.Refused refused -> redirect(response, pending.client(), "error", refused.reason());
            }
        } catch (RuntimeException e) {
            log.error("Could not finish Google sign-in", e);
            redirect(response, pending.client(), "error", OAUTH_FAILED);
        }
    }

    /**
     * Spring's error codes ({@code authorization_request_not_found}, {@code invalid_id_token}, ...) go to the audit
     * log; the client only learns whether the user cancelled.
     */
    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        PendingOAuthLogin pending = PendingOAuthLogin.take(request);
        ClientType client = pending == null ? ClientType.WEB : pending.client();
        String reason = exception instanceof OAuth2AuthenticationException oauth
                ? oauth.getError().getErrorCode()
                : "authentication_failed";
        log.warn("Google sign-in failed: {}", reason);
        auditLogger.record(AuditEvent.OAUTH_FAILURE, null, null, ClientInfo.from(request), reason);
        redirect(response, client, "error", ACCESS_DENIED.equals(reason) ? ACCESS_DENIED : OAUTH_FAILED);
    }

    /**
     * {@code no-referrer} applies to the redirected request, so the completion page is not told this callback's URL,
     * which carries Google's authorization code. {@code no-store} keeps the redirect out of caches.
     */
    private void redirect(HttpServletResponse response, ClientType client, String parameter, String value)
            throws IOException {
        String location = UriComponentsBuilder.fromUriString(properties.completionUrl(client))
                .queryParam(parameter, value)
                .build()
                .toUriString();
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.sendRedirect(location);
    }
}
