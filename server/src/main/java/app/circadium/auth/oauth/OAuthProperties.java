package app.circadium.auth.oauth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;
import org.springframework.validation.annotation.Validated;

/**
 * Google sign-in settings.
 *
 * @param redirectBaseUrl the API's public origin. Google only redirects to URIs registered in its console, so the
 *     callback URI is built from this setting instead of from request headers.
 * @param webCompletionUrl where the web app receives a finished sign-in
 * @param mobileCompletionUrl where the mobile app receives a finished sign-in (its custom URL scheme)
 */
@Validated
@ConfigurationProperties("circadium.oauth")
public record OAuthProperties(
        @NotNull @Valid Google google,
        @NotBlank String redirectBaseUrl,
        @NotBlank String webCompletionUrl,
        @NotBlank String mobileCompletionUrl) {

    /** Blank in {@code local} when Google sign-in is not set up; required everywhere else. */
    public record Google(String clientId, String clientSecret) {

        boolean configured() {
            return StringUtils.hasText(clientId) && StringUtils.hasText(clientSecret);
        }
    }

    /**
     * Completion URLs come only from configuration, never from the request, so the sign-in flow cannot be used
     * to send someone (and a handoff code) to an arbitrary site.
     */
    String completionUrl(OAuthClient client) {
        return switch (client) {
            case WEB -> webCompletionUrl;
            case MOBILE -> mobileCompletionUrl;
        };
    }
}
