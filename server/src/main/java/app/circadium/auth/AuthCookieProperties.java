package app.circadium.auth;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The cookies that carry the web client's tokens. Mobile clients receive their tokens in the JSON body instead.
 *
 * @param accessName cookie holding the access JWT
 * @param refreshName cookie holding the refresh token
 * @param domain the parent domain the web and API hosts share ({@code circadium.app} covers {@code www.} and
 *     {@code api.}), so the web server receives the access token too. Blank means host-only, which is what
 *     localhost needs: cookies ignore ports, so one set by {@code localhost:8080} already reaches
 *     {@code localhost:3000}.
 * @param secure send only over HTTPS; off for plain-HTTP localhost
 */
@Validated
@ConfigurationProperties("circadium.auth.cookies")
public record AuthCookieProperties(
        @NotBlank String accessName,
        @NotBlank String refreshName,
        String domain,
        boolean secure) {

    public AuthCookieProperties {
        domain = domain == null || domain.isBlank() ? null : domain;
    }
}
