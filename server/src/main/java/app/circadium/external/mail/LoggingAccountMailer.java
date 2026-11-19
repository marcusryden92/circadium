package app.circadium.external.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Logs instead of sending. Under the {@code local} profile it includes the token so flows can be exercised
 * by hand; everywhere else it logs only that a message was dropped, since verification tokens and 2FA codes
 * must never reach shared logs.
 */
@Slf4j
@Component
public class LoggingAccountMailer implements AccountMailer {

    private final boolean revealSecrets;

    public LoggingAccountMailer(Environment environment) {
        this.revealSecrets = environment.matchesProfiles("local");
    }

    @Override
    public void sendVerificationEmail(String email, String token) {
        if (revealSecrets) {
            log.info("[mail] verification email to {}: token={}", email, token);
        } else {
            log.warn("[mail] delivery not configured; verification email to {} dropped", email);
        }
    }

    @Override
    public void sendTwoFactorCode(String email, String code) {
        if (revealSecrets) {
            log.info("[mail] two-factor code to {}: {}", email, code);
        } else {
            log.warn("[mail] delivery not configured; two-factor code to {} dropped", email);
        }
    }
}
