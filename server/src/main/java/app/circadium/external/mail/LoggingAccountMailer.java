package app.circadium.external.mail;

import lombok.extern.slf4j.Slf4j;

/**
 * Logs instead of sending, for running without a Resend key. With {@code revealSecrets} (the {@code local}
 * profile) it includes the token so flows can be exercised by hand; otherwise it logs only that a message was
 * dropped, since tokens and codes must never reach shared logs.
 */
@Slf4j
public class LoggingAccountMailer implements AccountMailer {

    private final boolean revealSecrets;

    public LoggingAccountMailer(boolean revealSecrets) {
        this.revealSecrets = revealSecrets;
    }

    @Override
    public void sendVerificationEmail(String email, String token) {
        logSecret("verification email", email, token);
    }

    @Override
    public void sendOAuthSignupConfirmation(String email, String token, String provider) {
        logSecret(provider + " sign-up confirmation", email, token);
    }

    @Override
    public void sendTwoFactorCode(String email, String code) {
        logSecret("two-factor code", email, code);
    }

    @Override
    public void sendPasswordResetEmail(String email, String token) {
        logSecret("password reset email", email, token);
    }

    @Override
    public void sendPasswordChangedNotice(String email) {
        log.info("[mail] password changed notice to {}", mask(email));
    }

    @Override
    public void sendEmailChangeVerification(String newEmail, String token) {
        logSecret("email change verification", newEmail, token);
    }

    @Override
    public void sendEmailChangeRequestedNotice(String currentEmail, String newEmail) {
        log.info("[mail] email change requested notice to {}", mask(currentEmail));
    }

    @Override
    public void sendEmailChangedNotice(String previousEmail, String newEmail) {
        log.info("[mail] email changed notice to {}", mask(previousEmail));
    }

    @Override
    public void sendTwoFactorChangedNotice(String email, boolean enabled) {
        log.info("[mail] two-factor changed notice to {} (enabled={})", mask(email), enabled);
    }

    @Override
    public void sendAccountDeletionEmail(String email, String token) {
        logSecret("account deletion email", email, token);
    }

    @Override
    public void sendExistingAccountNotice(String email, boolean hasPassword) {
        log.info("[mail] existing account notice to {} (hasPassword={})", mask(email), hasPassword);
    }

    private void logSecret(String kind, String email, String secret) {
        if (revealSecrets) {
            // The local profile deliberately logs the raw address and token so a flow can be walked by hand.
            log.info("[mail] {} to {}: {}", kind, email, secret);
        } else {
            log.warn("[mail] delivery not configured; {} to {} dropped", kind, mask(email));
        }
    }

    /** First character plus the domain, so a non-local log can be correlated without carrying the address. */
    private static String mask(String email) {
        if (email == null) {
            return "null";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
