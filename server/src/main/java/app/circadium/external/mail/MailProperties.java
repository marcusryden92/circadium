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
 * @param securityFrom sender of the security mail (2FA codes, changes to password, email or 2FA, deletion)
 * @param accountFrom sender of the other account mail (confirmation and sign-up links, reset, existing-account
 *     notice); a no-reply address, so answers to automated mail stay out of the support inbox
 * @param supportAddress the support inbox: sender AND recipient of the feedback notification (the reporting
 *     user rides along as reply-to)
 */
@Validated
@ConfigurationProperties("circadium.mail")
public record MailProperties(
        String resendApiKey,
        @NotBlank String resendBaseUrl,
        @NotBlank String webBaseUrl,
        @NotBlank String securityFrom,
        @NotBlank String accountFrom,
        @NotBlank String supportAddress,
        boolean allowLoggingFallback) {

    public boolean deliveryConfigured() {
        return resendApiKey != null && !resendApiKey.isBlank();
    }
}
