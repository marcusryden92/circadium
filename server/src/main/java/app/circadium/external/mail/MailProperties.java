package app.circadium.external.mail;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Account-mail settings.
 *
 * @param resendApiKey Resend API key; when blank, mail is only logged, which is allowed only where
 *     {@code allowLoggingFallback} is set (the {@code local} profile)
 * @param webBaseUrl origin of the web app, which hosts the pages the emailed links open
 */
@Validated
@ConfigurationProperties("circadium.mail")
public record MailProperties(
        String resendApiKey,
        @NotBlank String resendBaseUrl,
        @NotBlank String webBaseUrl,
        @NotBlank String securityFrom,
        @NotBlank String supportFrom,
        boolean allowLoggingFallback) {

    public boolean deliveryConfigured() {
        return resendApiKey != null && !resendApiKey.isBlank();
    }
}
