package app.circadium.auth.oauth;

import app.circadium.auth.ClientType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;
import org.springframework.validation.annotation.Validated;

/**
 * Sign-in provider settings.
 *
 * @param providers the providers this deployment offers ({@code OAUTH_PROVIDERS}). Outside {@code local} each one
 *     must be fully configured or startup fails, so a deployment cannot silently lose one; the list is how a
 *     provider is rolled out (or held back) on purpose. The web app's {@code NEXT_PUBLIC_OAUTH_PROVIDERS} must
 *     name the same set, or it shows a button this server refuses.
 * @param redirectBaseUrl the API's public origin. Providers only redirect to URIs registered with them, so each
 *     callback URI is built from this setting instead of from request headers.
 * @param webCompletionUrl where the web app receives a finished sign-in
 * @param mobileCompletionUrl where the mobile app receives a finished sign-in (its custom URL scheme)
 */
@Validated
@ConfigurationProperties("circadium.oauth")
public record OAuthProperties(
        @NotNull List<String> providers,
        @NotNull @Valid Google google,
        @NotNull @Valid Microsoft microsoft,
        @NotNull @Valid Apple apple,
        @NotBlank String redirectBaseUrl,
        @NotBlank String webCompletionUrl,
        @NotBlank String mobileCompletionUrl) {

    public record Google(String clientId, String clientSecret) {

        boolean configured() {
            return StringUtils.hasText(clientId) && StringUtils.hasText(clientSecret);
        }
    }

    /**
     * An Entra app registration that accepts personal and work or school accounts: the same one the web app's
     * calendar import uses, hence the shared variable names.
     */
    public record Microsoft(String clientId, String clientSecret) {

        boolean configured() {
            return StringUtils.hasText(clientId) && StringUtils.hasText(clientSecret);
        }
    }

    /**
     * Apple has no static client secret: the server signs one with a private key from the developer account
     * ({@link AppleClientSecret}).
     *
     * @param clientId the Services ID (for example {@code app.circadium.web})
     * @param teamId the developer account's 10-character Team ID
     * @param keyId the 10-character id of the Sign in with Apple key
     * @param privateKey that key's {@code .p8} file contents (PKCS#8 PEM)
     */
    public record Apple(String clientId, String teamId, String keyId, String privateKey) {

        boolean configured() {
            return StringUtils.hasText(clientId) && StringUtils.hasText(teamId) && StringUtils.hasText(keyId)
                    && StringUtils.hasText(privateKey);
        }
    }

    boolean configured(SignInProvider provider) {
        return switch (provider) {
            case GOOGLE -> google.configured();
            case MICROSOFT -> microsoft.configured();
            case APPLE -> apple.configured();
        };
    }

    /** The environment variables a provider needs, for startup errors. */
    static String requiredVariables(SignInProvider provider) {
        return switch (provider) {
            case GOOGLE -> "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET";
            case MICROSOFT -> "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET";
            case APPLE -> "APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY";
        };
    }

    /**
     * Completion URLs come only from configuration, never from the request, so the sign-in flow cannot be used
     * to send someone (and a handoff code) to an arbitrary site.
     */
    String completionUrl(ClientType client) {
        return switch (client) {
            case WEB -> webCompletionUrl;
            case MOBILE -> mobileCompletionUrl;
        };
    }
}
