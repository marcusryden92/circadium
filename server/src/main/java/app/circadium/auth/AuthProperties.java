package app.circadium.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Token issuance settings. Signing keys are bound from the environment
 * ({@code CIRCADIUM_AUTH_SIGNINGKEYS_0_KID} / {@code CIRCADIUM_AUTH_SIGNINGKEYS_0_PRIVATEKEY}, ...); the
 * first entry signs, every entry verifies, so rotation is: prepend the new key, deploy, drop the old one
 * after one access-token lifetime.
 *
 * <p>{@code refreshTokenTtl} is the absolute lifetime of a sign-in, counted from the sign-in; refreshing does
 * not extend it.
 */
@Validated
@ConfigurationProperties("circadium.auth")
public record AuthProperties(
        @NotBlank String issuer,
        @NotBlank String audience,
        @NotNull Duration accessTokenTtl,
        @NotNull Duration refreshTokenTtl,
        boolean allowEphemeralKey,
        List<@Valid SigningKey> signingKeys) {

    public AuthProperties {
        signingKeys = signingKeys == null ? List.of() : List.copyOf(signingKeys);
    }

    /**
     * @param privateKey RSA private key as PKCS#8 PEM ({@code BEGIN PRIVATE KEY}); the public half is
     *     derived from it, so only one secret per key needs managing.
     */
    public record SigningKey(@NotBlank String kid, @NotBlank String privateKey) {}
}
