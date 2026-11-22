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
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
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
 * Finishes a sign-in after Spring has verified the provider's response (state, PKCE where the provider supports
 * it, the ID token's signature, issuer, audience and nonce). Success matches or creates the account and sends the
 * browser back to the client that started the sign-in with a one-time handoff code. A provider that does not
 * vouch for the email ends in {@code ?status=verification_sent}: the next step is in the user's inbox. Anything
 * else sends the browser back with an {@code error}:
 *
 * <ul>
 *   <li>{@code access_denied}: the user cancelled at the provider
 *   <li>{@code account_exists}: the email belongs to an account that does not sign in with this provider account
 *   <li>{@code email_missing}: the provider shared no email address
 *   <li>{@code oauth_failed}: anything else; the audit log has the details
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OAuthLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

    static final String ACCESS_DENIED = "access_denied";
    static final String OAUTH_FAILED = "oauth_failed";
    static final String VERIFICATION_SENT = "verification_sent";

    /** The standard OAuth code, and Apple's own for the same thing. */
    private static final Set<String> CANCELLED = Set.of(ACCESS_DENIED, "user_cancelled_authorize");

    private static final String CALLBACK_PATH_PREFIX = "/login/oauth2/code/";

    private static final Pattern EMAIL_LIKE = Pattern.compile("[^\\s@'\"<>(),;]+@[^\\s@'\"<>(),;]+");
    private static final int MAX_DESCRIPTION_LENGTH = 500;

    private final OAuthAccountService accountService;
    private final OAuthHandoffCodes handoffCodes;
    private final OAuthProperties properties;
    private final AuditLogger auditLogger;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        PendingOAuthLogin pending = PendingOAuthLogin.take(request);
        Optional<SignInProvider> provider = authentication instanceof OAuth2AuthenticationToken token
                ? SignInProvider.fromRegistrationId(token.getAuthorizedClientRegistrationId())
                : Optional.empty();
        if (pending == null || provider.isEmpty() || !(authentication.getPrincipal() instanceof OidcUser user)) {
            log.error("Sign-in succeeded without a pending sign-in, a known provider or an OpenID Connect user");
            redirect(response, pending == null ? ClientType.WEB : pending.client(), "error", OAUTH_FAILED);
            return;
        }
        try {
            ProviderIdentity identity =
                    provider.get().identity(user, request, SignInAuthorizedClients.takeRefreshToken(request));
            switch (accountService.signIn(identity, ClientInfo.from(request))) {
                case SignInResult.SignedIn signedIn -> redirect(response, pending.client(), "code",
                        handoffCodes.issue(signedIn.user().getId(), pending.client(), pending.challenge()));
                case SignInResult.VerificationSent sent ->
                        redirect(response, pending.client(), "status", VERIFICATION_SENT);
                case SignInResult.Refused refused -> redirect(response, pending.client(), "error", refused.reason());
            }
        } catch (RuntimeException e) {
            log.error("Could not finish {} sign-in", provider.get().displayName(), e);
            redirect(response, pending.client(), "error", OAUTH_FAILED);
        }
    }

    /**
     * Spring's error codes ({@code authorization_request_not_found}, {@code invalid_id_token}, ...) go to the audit
     * log; the client only learns whether the user cancelled. The description goes to the server log only: a
     * provider's bare code ({@code server_error}) rarely says what to fix, its description ({@code AADSTS...})
     * does.
     */
    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        PendingOAuthLogin pending = PendingOAuthLogin.take(request);
        ClientType client = pending == null ? ClientType.WEB : pending.client();
        String reason = exception instanceof OAuth2AuthenticationException oauth
                ? oauth.getError().getErrorCode()
                : "authentication_failed";
        String description = exception instanceof OAuth2AuthenticationException oauth
                ? oauth.getError().getDescription()
                : exception.getMessage();
        boolean cancelled = CANCELLED.contains(reason);
        log.warn("Sign-in through {} failed: {} ({})", providerSegment(request), reason,
                loggableDescription(description));
        auditLogger.record(AuditEvent.OAUTH_FAILURE, null, null, ClientInfo.from(request),
                cancelled ? ACCESS_DENIED : reason);
        redirect(response, client, "error", cancelled ? ACCESS_DENIED : OAUTH_FAILED);
    }

    /**
     * Provider error descriptions can name the account ("User account 'a@b.example' ... does not exist"), and
     * emails stay out of the logs, so anything shaped like one is masked. Capped, since it comes from outside.
     */
    static String loggableDescription(String description) {
        if (description == null || description.isBlank()) {
            return "no description";
        }
        String masked = EMAIL_LIKE.matcher(description.replaceAll("\\p{Cntrl}", " ")).replaceAll("<email>");
        return masked.length() > MAX_DESCRIPTION_LENGTH ? masked.substring(0, MAX_DESCRIPTION_LENGTH) + "..." : masked;
    }

    /** For the log line only; never echoed to the client. */
    private static String providerSegment(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String segment = uri.startsWith(CALLBACK_PATH_PREFIX) ? uri.substring(CALLBACK_PATH_PREFIX.length()) : "";
        return SignInProvider.fromRegistrationId(segment).map(SignInProvider::displayName).orElse("an unknown provider");
    }

    /**
     * {@code no-referrer} applies to the redirected request, so the completion page is not told this callback's URL,
     * which carries the provider's authorization code. {@code no-store} keeps the redirect out of caches.
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
