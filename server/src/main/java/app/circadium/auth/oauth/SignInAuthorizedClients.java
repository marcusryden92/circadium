package app.circadium.auth.oauth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;

/**
 * Where Spring puts each provider's tokens once the callback's code exchange succeeds. By default it would keep
 * every signed-in user's access token in memory for the life of the process; sign-in only needs the identity, so
 * nothing is kept.
 *
 * <p>The one exception is Apple's refresh token, which {@link OAuthAccountService} stores to revoke the app's
 * access when the account is deleted. Spring saves the client before it calls the success handler, so the token
 * is parked on the callback request, and the handler takes it from there.
 */
public final class SignInAuthorizedClients implements OAuth2AuthorizedClientRepository {

    private static final String REFRESH_TOKEN_ATTRIBUTE = SignInAuthorizedClients.class.getName() + ".refreshToken";

    @Override
    public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId,
            Authentication principal, HttpServletRequest request) {
        return null;
    }

    @Override
    public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal,
            HttpServletRequest request, HttpServletResponse response) {
        OAuth2RefreshToken refreshToken = authorizedClient.getRefreshToken();
        if (refreshToken != null && SignInProvider.APPLE.registrationId()
                .equals(authorizedClient.getClientRegistration().getRegistrationId())) {
            request.setAttribute(REFRESH_TOKEN_ATTRIBUTE, refreshToken.getTokenValue());
        }
    }

    @Override
    public void removeAuthorizedClient(String clientRegistrationId, Authentication principal,
            HttpServletRequest request, HttpServletResponse response) {
    }

    static String takeRefreshToken(HttpServletRequest request) {
        Object value = request.getAttribute(REFRESH_TOKEN_ATTRIBUTE);
        request.removeAttribute(REFRESH_TOKEN_ATTRIBUTE);
        return value instanceof String token ? token : null;
    }
}
