package app.circadium.external.passwords;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Have I Been Pwned's Pwned Passwords range API, which needs no key.
 *
 * @param enabled false skips the check (new passwords are then only held to the length rules)
 * @param baseUrl the API origin
 */
@Validated
@ConfigurationProperties("circadium.passwords.pwned")
public record PwnedPasswordsProperties(boolean enabled, @NotBlank String baseUrl) {}
