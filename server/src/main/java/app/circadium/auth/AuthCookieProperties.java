package app.circadium.auth;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The cookies that carry the web client's tokens. Mobile clients receive their tokens in the JSON body instead.
 *
 * <p>Deployed environments use the browser's name prefixes: {@code __Host-} on the refresh cookie (the browser
 * accepts it only host-only, Secure and on {@code Path=/}, so no sibling subdomain can plant one) and
 * {@code __Secure-} on the access cookie, which needs {@code Domain} and so cannot be {@code __Host-}. A browser
 * silently drops a prefixed cookie that breaks those rules, so such a configuration fails at startup instead.
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

    static final String HOST_PREFIX = "__Host-";
    static final String SECURE_PREFIX = "__Secure-";

    public AuthCookieProperties {
        domain = domain == null || domain.isBlank() ? null : domain;
        boolean prefixed = isPrefixed(accessName) || isPrefixed(refreshName);
        if (prefixed && !secure) {
            throw new IllegalArgumentException("Cookie names with a __Host- or __Secure- prefix need secure=true");
        }
        if (accessName != null && accessName.startsWith(HOST_PREFIX) && domain != null) {
            throw new IllegalArgumentException("The access cookie has a Domain, so it cannot use the __Host- prefix");
        }
    }

    private static boolean isPrefixed(String name) {
        return name != null && (name.startsWith(HOST_PREFIX) || name.startsWith(SECURE_PREFIX));
    }
}
