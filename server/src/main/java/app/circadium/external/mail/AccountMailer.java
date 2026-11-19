package app.circadium.external.mail;

/**
 * Account emails the auth flows send. Expressed as intents rather than raw messages so the implementation
 * owns templates, links, and the web base URL.
 */
public interface AccountMailer {

    void sendVerificationEmail(String email, String token);

    void sendTwoFactorCode(String email, String code);
}
